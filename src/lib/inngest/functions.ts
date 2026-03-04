import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { inngest } from "./client";
import { prisma } from "../db";
import { searchVaultSplit, enrichWithAnalysis, searchVault, clearVaultCache } from "../vault/vaultIndex";
import { getPlanner } from "../ai/claudePlanner";
import { getImageProvider } from "../ai/nanoBananaProvider";
import { getStorageProvider } from "../storage";
import { TEMPLATE_REGISTRY } from "../templates/registry";
import { Channel, CHANNEL_SIZES } from "../templates/types";
import { ReferenceImage } from "../ai/types";
import { buildRulesBlock } from "../ai/promptBuilder";
import { buildIllustrationSystemPrompt, ILLUSTRATION_USER_TEMPLATE } from "../ai/illustrationPrompts";
import { buildPictogramSystemPrompt, PICTOGRAM_USER_TEMPLATE } from "../ai/pictogramPrompts";

interface VariantRecord {
  id: string;
  label: string;
  jobId: string;
  status: string;
  plannerSpec: unknown;
}

const VAULT_ANALYSIS_PROMPT = `Analyze this design asset for a crypto sportsbook/casino brand (CB). Return a JSON object with exactly these fields:

{
  "description": "2-3 sentence description of what the image contains and its visual style",
  "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "mood": "comma-separated mood descriptors, e.g. dark, energetic, premium",
  "composition": "describe layout and spatial arrangement, e.g. centered subject, gradient background",
  "styleNotes": "specific style observations: lighting, effects, textures, brand elements",
  "subjects": ["subject1", "subject2"]
}

Return ONLY the JSON object. No markdown, no explanation.`;

// ---------------------------------------------------------------------------
// Multi-reference helpers
// ---------------------------------------------------------------------------

/** Normalise subject references from either the new JSON array or legacy single-URL fields. */
function getSubjectRefs(job: {
  subjectReferences?: unknown;
  subjectReferenceUrl?: string | null;
  subjectReferenceNote?: string | null;
}): Array<{ url: string; note: string }> {
  const arr = job.subjectReferences as Array<{ url: string; note: string }> | null | undefined;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.filter((r) => r.url);
  }
  if (job.subjectReferenceUrl) {
    return [{ url: job.subjectReferenceUrl, note: job.subjectReferenceNote ?? "" }];
  }
  return [];
}

/** Load a single reference image buffer from a local upload path or remote URL. */
async function loadRefBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("/uploads/")) {
      const filePath = path.resolve(process.cwd(), "public" + url);
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } else if (url.startsWith("http")) {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    }
  } catch {
    console.warn(`[RefLoad] Failed to load: ${url}`);
  }
  return null;
}

/**
 * Phase 1: Retrieve vault refs + run Claude planner.
 * Saves specs to each Variant, then marks job as "planned" and STOPS.
 * Waits for user approval before generating images.
 */
export const generateSocialPostJob = inngest.createFunction(
  {
    id: "generate-social-post-job",
    retries: 2,
    onFailure: async ({ event }) => {
      const jobId = event.data.event?.data?.jobId as string | undefined;
      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "failed",
            errorMessage: String(event.data.error?.message || "Planning failed").slice(0, 500),
          },
        });
        console.error(`[Planner] Job ${jobId} marked as FAILED: ${event.data.error?.message}`);
      }
    },
  },
  { event: "job/generate" },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string;

    await step.run("mark-running", async () => {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "running" },
      });
    });

    const retrievalBundle = await step.run("retrieve-vault-refs", async () => {
      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

      const results = await searchVaultSplit({
        query: job.description,
        visualType: job.visualType,
        channels: job.channels,
        limit: 20,
      });

      console.log(`[Vault] Found ${results.templates.length} templates, ${results.illustrations.length} illustrations, ${results.otherRefs.length} other refs`);

      const allItems = [...results.templates, ...results.illustrations, ...results.otherRefs];

      await prisma.job.update({
        where: { id: jobId },
        data: { retrievalBundle: JSON.parse(JSON.stringify({ items: allItems, totalMatched: results.totalMatched })) },
      });

      return results;
    });

    await step.run("run-planner", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });

      const allItems = [...retrievalBundle.templates, ...retrievalBundle.illustrations, ...retrievalBundle.otherRefs];
      const enrichedItems = await enrichWithAnalysis(allItems);
      const rules = await buildRulesBlock(job.mode || "socials");

      // Load template performance stats and append to rules block
      const templateStats = await prisma.templateStats.findMany({
        where: { jobCount: { gt: 0 } },
        orderBy: { acceptCount: "desc" },
      });
      let rulesText = rules.text;
      if (templateStats.length > 0) {
        const statsLines = templateStats.map((ts) => {
          const rate = ts.jobCount > 0 ? Math.round((ts.acceptCount / ts.jobCount) * 100) : 0;
          return `  - ${ts.templateId} [${ts.channel}]: ${ts.acceptCount}/${ts.jobCount} accepted (${rate}% win rate)`;
        });
        rulesText += `\n\nTEMPLATE PERFORMANCE (prefer high win-rate templates):\n${statsLines.join("\n")}`;
      }

      console.log(`[Rules] Injecting ${rules.ruleCount} rules (~${rules.estimatedTokens} tokens, v${rules.version}), ${templateStats.length} template stats`);

      await prisma.job.update({
        where: { id: jobId },
        data: { rulesVersion: rules.version, rulesSnapshot: rulesText || null },
      });

      const jobSubjectRefs = getSubjectRefs(job);
      const firstRefNote = jobSubjectRefs[0]?.note ?? "";
      const isPreStyledIllustration =
        jobSubjectRefs.length > 0 &&
        firstRefNote.includes("GENERATED CB FLAT-VECTOR ILLUSTRATION");

      let enrichedDescription = job.description;
      if (isPreStyledIllustration) {
        enrichedDescription += `\n\n[IMPORTANT — PRE-STYLED ILLUSTRATION SUBJECT]
The subject reference is a pre-styled CB brand illustration, NOT a photo. Do NOT re-stylize it. The image generator will receive this illustration as a separate hero asset and composite it onto the template AS-IS. The illustration is the hero element — choose a template that gives it centre-stage prominence.

Your backgroundPrompt for each variant should describe HOW TO COMPOSITE the provided hero illustration onto the chosen template — positioning (centre, centre-right, etc.), scale relative to the canvas, negative space for copy overlay, and any subtle atmospheric effects or design flourishes around the hero. Do NOT describe a new character to generate — the character already exists. Focus on placement, composition, and surrounding design elements only.`;
        console.log(`[Planner] Detected pre-styled illustration subject — injecting compositing instructions`);
      }

      const planner = getPlanner();
      const output = await planner.plan({
        description: enrichedDescription,
        channels: job.channels,
        visualType: job.visualType,
        templateIds: TEMPLATE_REGISTRY.map((t) => t.id),
        rulesBlock: rulesText,
        vaultReferences: enrichedItems.map((item) => ({
          id: item.id,
          type: item.type,
          tags: item.tags,
          notes: item.notes,
          analysisDescription: item.analysis?.description,
          analysisColorPalette: item.analysis?.colorPalette,
          analysisMood: item.analysis?.mood,
          analysisSubjects: item.analysis?.subjects,
          analysisStyleNotes: item.analysis?.styleNotes,
          analysisComposition: item.analysis?.composition,
        })),
      });

      const variants = (job.variants || []) as VariantRecord[];
      for (const variantPlan of output.variants) {
        const variant = variants.find((v: VariantRecord) => v.label === variantPlan.variantLabel);
        if (variant) {
          await prisma.variant.update({
            where: { id: variant.id },
            data: {
              plannerSpec: JSON.parse(JSON.stringify(variantPlan)),
              status: "planned",
            },
          });
        }
      }
    });

    await step.run("mark-planned", async () => {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "planned" },
      });
    });

    return { jobId, status: "planned" };
  }
);

/**
 * Phase 2: Generate images from approved specs.
 * Triggered by "job/generate-images" event after user approves the planner output.
 */
export const generateImagesJob = inngest.createFunction(
  {
    id: "generate-images-job",
    retries: 2,
    onFailure: async ({ event }) => {
      const jobId = event.data.event?.data?.jobId as string | undefined;
      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "failed",
            errorMessage: String(event.data.error?.message || "Image generation failed").slice(0, 500),
          },
        });
        console.error(`[ImageGen] Job ${jobId} marked as FAILED: ${event.data.error?.message}`);
      }
    },
  },
  { event: "job/generate-images" },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string;

    await step.run("mark-generating", async () => {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "generating" },
      });
    });

    const styleRules = await step.run("load-style-rules", async () => {
      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { mode: true } });
      const rules = await prisma.promptRule.findMany({
        where: { enabled: true, mode: job.mode || "socials" },
        orderBy: [{ confidence: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
        take: 15,
      });
      if (rules.length === 0) return "";

      const doRules = rules
        .filter((r) => ["do", "style", "positive"].includes(r.category))
        .map((r) => r.content);
      const dontRules = rules
        .filter((r) => ["dont", "color", "composition", "typography"].includes(r.category))
        .map((r) => r.content);

      const parts: string[] = [];
      if (doRules.length > 0) parts.push("STYLE RULES — FOLLOW THESE:\n" + doRules.map((r) => `• ${r}`).join("\n"));
      if (dontRules.length > 0) parts.push("AVOID:\n" + dontRules.map((r) => `• ${r}`).join("\n"));
      console.log(`[Rules→Gemini] Injecting ${rules.length} style rules into image prompt`);
      return parts.join("\n\n");
    });

    await step.run("generate-images", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });
      const variants = (job.variants || []) as VariantRecord[];
      const channels = (job.channels || []) as Channel[];
      const imageProvider = getImageProvider();
      const storage = getStorageProvider();

      for (const variant of variants) {
        const spec = variant.plannerSpec as {
          variantLabel: string;
          templateAssetId?: string;
          artDirection: { backgroundPrompt?: string; style?: string; referenceInstructions?: string };
          copy?: Record<string, string>;
          templateId?: string;
          referencesUsed?: string[];
        } | null;

        if (!spec?.artDirection?.backgroundPrompt) continue;

        await prisma.variant.update({
          where: { id: variant.id },
          data: { status: "generating" },
        });

        const referenceImages: ReferenceImage[] = [];

        if (spec.templateAssetId) {
          const templateItem = await prisma.assetVaultItem.findUnique({
            where: { id: spec.templateAssetId },
            select: { pathOrUrl: true },
          });
          if (templateItem) {
            const tplPath = path.resolve(process.cwd(), templateItem.pathOrUrl);
            if (fs.existsSync(tplPath)) {
              const buf = fs.readFileSync(tplPath);
              referenceImages.push({
                buffer: buf,
                description: "BASE TEMPLATE — use this as the canvas background. Place the generated graphic element ON TOP of this template. Do NOT modify the background, logo, or notch area.",
              });
              console.log(`[Template] Loaded ${spec.templateAssetId} (${buf.length} bytes)`);
            }
          }
        }

        const subjectRefs = getSubjectRefs(job);
        const totalSubjectRefs = subjectRefs.length;
        for (let ri = 0; ri < totalSubjectRefs; ri++) {
          const ref = subjectRefs[ri];
          const subjectBuffer = await loadRefBuffer(ref.url);
          if (!subjectBuffer) {
            console.warn(`[ImageGen] Failed to load subject reference ${ri + 1}: ${ref.url}`);
            continue;
          }
          const note = ref.note.trim();
          const isPreStyled = note.includes("GENERATED CB FLAT-VECTOR ILLUSTRATION");
          const nOfM = totalSubjectRefs > 1 ? ` ${ri + 1} of ${totalSubjectRefs}` : "";
          const multiClause = totalSubjectRefs > 1
            ? `\n\nMULTI-REFERENCE SCENE: This is subject ${ri + 1} of ${totalSubjectRefs}. Compose ALL references together — each defines a separate character, element, or angle of the same scene.`
            : "";
          const description = isPreStyled
            ? `HERO ILLUSTRATION${nOfM} — pre-styled CB brand illustration. Place it AS-IS on the template. Do NOT re-draw or re-stylize it.${note ? `\n\nContext: ${note}` : ""}${multiClause}`
            : `SUBJECT REFERENCE${nOfM} — use this to capture likeness, pose, and energy. Translate into the brand visual style.${note ? `\n\nCREATOR INSTRUCTIONS: "${note}"` : ""}${multiClause}`;

          referenceImages.push({ buffer: subjectBuffer, description });
          console.log(`[ImageGen] Loaded subject reference ${ri + 1}/${totalSubjectRefs} (${subjectBuffer.length} bytes, preStyled=${isPreStyled})`);
        }

        const refIds = (spec.referencesUsed || []).filter((id) => id !== spec.templateAssetId);
        if (refIds.length > 0) {
          const vaultItems = await prisma.assetVaultItem.findMany({
            where: { id: { in: refIds } },
            select: { id: true, pathOrUrl: true, notes: true, type: true, analysis: true },
          });

          for (const item of vaultItems) {
            const filePath = path.resolve(process.cwd(), item.pathOrUrl);
            const ext = path.extname(filePath).toLowerCase();
            if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;

            try {
              if (fs.existsSync(filePath)) {
                const buf = fs.readFileSync(filePath);
                const a = item.analysis as Record<string, unknown> | null;
                const subjects = Array.isArray(a?.subjects) ? (a.subjects as string[]).join(", ") : "";
                const style = typeof a?.styleNotes === "string" ? a.styleNotes : "";
                const desc = subjects ? `${item.type} of ${subjects}` : (item.notes || item.type);
                const styleHint = style ? ` — style: ${style.slice(0, 100)}` : "";

                referenceImages.push({
                  buffer: buf,
                  description: `${desc}${styleHint}`,
                });
                console.log(`[Refs] Loaded ${item.id} (${buf.length} bytes) — ${desc.slice(0, 80)}`);
              }
            } catch {
              console.warn(`[Refs] Failed to load ${item.id}`);
            }
          }
        }

        console.log(`[ImageGen] Variant ${spec.variantLabel}: template=${spec.templateAssetId || "none"}, subjectRefs=${subjectRefs.length}, totalRefs=${referenceImages.length}`);

        const refInstructions = spec.artDirection.referenceInstructions || "";
        let imagePrompt = spec.artDirection.backgroundPrompt!;
        if (refInstructions) imagePrompt += `\n\n${refInstructions}`;
        if (styleRules) imagePrompt += `\n\n${styleRules}`;

        for (const channel of channels) {
          const size = CHANNEL_SIZES[channel];
          if (!size) continue;

          const result = await imageProvider.generateImage({
            prompt: imagePrompt,
            width: size.width,
            height: size.height,
            style: spec.artDirection.style || "",
            referenceImages,
          });

          const artifactPath = `jobs/${jobId}/finals/${spec.variantLabel}_${channel}.png`;
          const url = await storage.upload(result.buffer, artifactPath, result.mimeType);

          await prisma.artifact.create({
            data: {
              variantId: variant.id,
              channel,
              kind: "final_png",
              url,
              width: size.width,
              height: size.height,
              mimeType: result.mimeType,
            },
          });
        }

        const specPath = `jobs/${jobId}/specs/${spec.variantLabel}_spec.json`;
        const specBuffer = Buffer.from(JSON.stringify(spec, null, 2));
        const specUrl = await storage.upload(specBuffer, specPath, "application/json");

        await prisma.artifact.create({
          data: {
            variantId: variant.id,
            channel: "all",
            kind: "spec_json",
            url: specUrl,
            width: 0,
            height: 0,
            mimeType: "application/json",
          },
        });
      }
    });

    await step.run("mark-ready", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });

      for (const variant of job.variants) {
        await prisma.variant.update({
          where: { id: variant.id },
          data: { status: "ready" },
        });
      }

      await prisma.job.update({
        where: { id: jobId },
        data: { status: "ready" },
      });
    });

    return { jobId, status: "ready" };
  }
);

const ILLUSTRATION_SIZES: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "16:9": { width: 1600, height: 900 },
};

function getIllustrationSize(visualType: string): { width: number; height: number } {
  return ILLUSTRATION_SIZES[visualType] || { width: 1080, height: 1080 };
}

/**
 * Phase 1: Illustration mode — retrieve illustration vault refs + run Claude with illustration system prompt.
 * No templates used. Marks job as "planned" for spec review.
 */
export const generateIllustrationJob = inngest.createFunction(
  {
    id: "generate-illustration-job",
    retries: 2,
    onFailure: async ({ event }) => {
      const jobId = event.data.event?.data?.jobId as string | undefined;
      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "failed",
            errorMessage: String(event.data.error?.message || "Illustration planning failed").slice(0, 500),
          },
        });
        console.error(`[IllustrationPlanner] Job ${jobId} marked as FAILED`);
      }
    },
  },
  { event: "job/generate-illustration" },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string;

    await step.run("mark-running", async () => {
      await prisma.job.update({ where: { id: jobId }, data: { status: "running" } });
    });

    const illustrationRefs = await step.run("retrieve-illustration-refs", async () => {
      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

      const results = await searchVault({
        query: job.description,
        visualType: "illustration",
        limit: 12,
      });

      const illustrationOnly = results.items.filter((i) => i.type === "illustration");
      console.log(`[IllustrationVault] Found ${illustrationOnly.length} illustration refs`);

      await prisma.job.update({
        where: { id: jobId },
        data: {
          retrievalBundle: JSON.parse(
            JSON.stringify({ items: illustrationOnly, totalMatched: results.totalMatched })
          ),
        },
      });

      return illustrationOnly;
    });

    await step.run("run-illustration-planner", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });

      const enrichedItems = await enrichWithAnalysis(illustrationRefs);
      const rules = await buildRulesBlock("illustration");

      console.log(`[IllustrationRules] Injecting ${rules.ruleCount} rules (~${rules.estimatedTokens} tokens, v${rules.version})`);

      await prisma.job.update({
        where: { id: jobId },
        data: { rulesVersion: rules.version, rulesSnapshot: rules.text || null },
      });

      const formatRef = (ref: typeof enrichedItems[0]) => {
        let line = `- ${ref.id} [${ref.type}] tags=[${ref.tags.join(",")}]`;
        if (ref.analysis?.subjects?.length) line += `\n  Subjects: ${ref.analysis.subjects.join(", ")}`;
        if (ref.analysis?.description) line += `\n  Description: ${ref.analysis.description}`;
        if (ref.analysis?.styleNotes) line += `\n  Style: ${ref.analysis.styleNotes}`;
        if (ref.analysis?.colorPalette?.length) line += `\n  Colors: ${ref.analysis.colorPalette.join(", ")}`;
        if (ref.analysis?.mood) line += `\n  Mood: ${ref.analysis.mood}`;
        if (ref.notes) line += `\n  Notes: ${ref.notes}`;
        return line;
      };

      const subjectRefs = getSubjectRefs(job);
      const hasSubjectRef = subjectRefs.length > 0;
      const angleRef = (job.angleReference as { url: string; note: string } | null) ?? null;
      const vaultLabel = hasSubjectRef
        ? "STYLE REFERENCES FROM VAULT (use for rendering style only — line weight, colour approach, flat shading technique — NOT to define the subject):"
        : "ILLUSTRATION VAULT REFERENCES (pick 2-5 that share the same flat-vector visual style):";
      const vaultSummary = enrichedItems.length > 0
        ? `${vaultLabel}\n` + enrichedItems.map(formatRef).join("\n")
        : "No illustration references available — rely on style description alone.";

      const userMessage = ILLUSTRATION_USER_TEMPLATE({
        description: job.description,
        sizePreset: job.visualType || "1:1",
        vaultSummary,
        hasSubjectReference: hasSubjectRef,
        subjectReferences: subjectRefs,
        angleReference: angleRef ?? undefined,
      });

      const systemPrompt = buildIllustrationSystemPrompt(rules.text);

      let rawText: string;

      if (process.env.USE_MOCK_PROVIDERS === "true" || !process.env.ANTHROPIC_API_KEY) {
        rawText = JSON.stringify({
          variants: [
            {
              variantLabel: "A",
              artDirection: {
                backgroundPrompt: `Bold stylized character in dynamic action pose, low-angle hero perspective looking up. The figure is centered with generous breathing room on all sides, suitable for cutout compositing. Bold flat-vector style with solid color fills and clean sharp edges. Dramatic cast shadows in dark navy. Character wears bold electric blue kit with orange accents. Background is a single flat rich dark purple (#1A0B2E). No text, no logos, pure standalone character illustration.`,
                style: "flat-vector",
                mood: "Bold & Dynamic",
                palette: ["#2D4BE6", "#FF6B2F", "#1A0B2E"],
                solidBackground: "#0F0A1A",
                referenceInstructions: "Match the clean vector style and bold color blocking.",
              },
              referencesUsed: enrichedItems.slice(0, 2).map((r) => r.id),
              copy: { headline: "", subhead: "", cta: "" },
            },
            {
              variantLabel: "B",
              artDirection: {
                backgroundPrompt: `Alternative angle — same character from a side-profile or three-quarter view, captured mid-action with strong foreshortening. Bold flat-vector illustration with clean hard edges, stylized proportions, and dramatic cast shadows. Deep orange and purple palette. Solid single-color background in dark midnight blue (#0B1120). Subject fills 65% of frame height with clear negative space. No text, no logos.`,
                style: "flat-vector",
                mood: "Premium & Sleek",
                palette: ["#7C3AED", "#FF6B2F", "#0B1120"],
                solidBackground: "#0B1120",
                referenceInstructions: "Match the flat-vector style: bold solid fills, clean hard edges, dramatic cast shadows.",
              },
              referencesUsed: enrichedItems.slice(0, 2).map((r) => r.id),
              copy: { headline: "", subhead: "", cta: "" },
            },
          ],
          reasoning: `Mock illustration plan for "${job.description}"`,
        });
      } else {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

        // Build message content — multipart when angle reference image is provided
        type ContentBlock =
          | Anthropic.Messages.ImageBlockParam
          | Anthropic.Messages.TextBlockParam;

        const messageContent: ContentBlock[] = [];

        // Append subject reference images (so Claude sees them during planning)
        for (let ri = 0; ri < subjectRefs.length; ri++) {
          const buf = await loadRefBuffer(subjectRefs[ri].url);
          if (buf) {
            messageContent.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") },
            });
          }
        }

        // Append angle reference image last (the prompt text refers to it as the "LAST image")
        if (angleRef?.url) {
          const angleRefBuffer = await loadRefBuffer(angleRef.url);
          if (angleRefBuffer) {
            messageContent.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: angleRefBuffer.toString("base64") },
            });
            console.log(`[IllustrationPlanner] Sending angle reference image to Claude (${angleRefBuffer.length} bytes)`);
          } else {
            console.warn(`[IllustrationPlanner] Could not load angle reference image: ${angleRef.url}`);
          }
        }

        // Text prompt always comes last
        messageContent.push({ type: "text", text: userMessage });

        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{ role: "user", content: messageContent }],
          system: systemPrompt,
        });
        rawText = response.content[0].type === "text" ? response.content[0].text : "";
      }

      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("[IllustrationPlanner] Invalid JSON from Claude:", cleaned.slice(0, 500));
        throw new Error("Illustration planner returned invalid JSON");
      }

      const variantsRaw = Array.isArray(parsed.variants)
        ? (parsed.variants as Record<string, unknown>[])
        : [parsed as Record<string, unknown>];

      const labels: Array<"A" | "B"> = ["A", "B"];
      const variants = (job.variants || []) as VariantRecord[];

      for (let i = 0; i < Math.min(variantsRaw.length, 2); i++) {
        const vRaw = variantsRaw[i];
        const label = labels[i];

        const artRaw = (vRaw.artDirection || vRaw.art_direction || {}) as Record<string, unknown>;
        const artDirection = {
          backgroundPrompt: String(artRaw.backgroundPrompt || artRaw.background_prompt || artRaw.imagePrompt || ""),
          style: String(artRaw.style || "flat-vector"),
          mood: String(artRaw.mood || ""),
          palette: Array.isArray(artRaw.palette) ? artRaw.palette : [],
          solidBackground: String(artRaw.solidBackground || artRaw.solid_background || "#1A0B2E"),
          referenceInstructions: String(artRaw.referenceInstructions || artRaw.reference_instructions || ""),
        };

        const refsUsed: string[] = Array.isArray(vRaw.referencesUsed)
          ? (vRaw.referencesUsed as string[])
          : Array.isArray(vRaw.references_used)
          ? (vRaw.references_used as string[])
          : [];

        // Build a map of id → asset path so spec-review can serve thumbnails via /api/vault/asset
        const referencePaths: Record<string, string> = {};
        for (const refId of refsUsed) {
          const item = enrichedItems.find((e) => e.id === refId);
          if (item?.pathOrUrl) {
            // pathOrUrl is e.g. "assets/vault/illustrations/foo.png"
            referencePaths[refId] = item.pathOrUrl;
          }
        }

        const spec = {
          variantLabel: label,
          artDirection,
          referencesUsed: refsUsed,
          referencePaths,
          copy: typeof vRaw.copy === "object" && vRaw.copy !== null ? vRaw.copy : { headline: "", cta: "" },
        };

        const variant = variants.find((v: VariantRecord) => v.label === label);
        if (variant) {
          await prisma.variant.update({
            where: { id: variant.id },
            data: {
              plannerSpec: JSON.parse(JSON.stringify(spec)),
              status: "planned",
            },
          });
        }
      }

      console.log(`[IllustrationPlanner] Planned ${Math.min(variantsRaw.length, 2)} variants for job ${jobId}`);
    });

    await step.run("mark-planned", async () => {
      await prisma.job.update({ where: { id: jobId }, data: { status: "planned" } });
    });

    return { jobId, status: "planned" };
  }
);

/**
 * Phase 2 (illustration): Generate images from approved illustration specs.
 * Subject reference is sent as the FIRST image to Gemini; vault style refs follow.
 */
export const generateIllustrationImagesJob = inngest.createFunction(
  {
    id: "generate-illustration-images-job",
    retries: 2,
    onFailure: async ({ event }) => {
      const jobId = event.data.event?.data?.jobId as string | undefined;
      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "failed",
            errorMessage: String(event.data.error?.message || "Illustration image generation failed").slice(0, 500),
          },
        });
        console.error(`[IllustrationImageGen] Job ${jobId} marked as FAILED`);
      }
    },
  },
  { event: "job/generate-illustration-images" },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string;

    await step.run("mark-generating", async () => {
      await prisma.job.update({ where: { id: jobId }, data: { status: "generating" } });
    });

    const illustrationStyleRules = await step.run("load-style-rules", async () => {
      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { mode: true } });
      const rules = await prisma.promptRule.findMany({
        where: { enabled: true, mode: job.mode || "illustration" },
        orderBy: [{ confidence: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
        take: 15,
      });
      if (rules.length === 0) return "";

      const doRules = rules
        .filter((r) => ["do", "style", "positive"].includes(r.category))
        .map((r) => r.content);
      const dontRules = rules
        .filter((r) => ["dont", "color", "composition", "typography"].includes(r.category))
        .map((r) => r.content);

      const parts: string[] = [];
      if (doRules.length > 0) parts.push("STYLE RULES — FOLLOW THESE:\n" + doRules.map((r) => `• ${r}`).join("\n"));
      if (dontRules.length > 0) parts.push("AVOID:\n" + dontRules.map((r) => `• ${r}`).join("\n"));
      console.log(`[Rules→Gemini] Injecting ${rules.length} style rules into illustration prompt`);
      return parts.join("\n\n");
    });

    await step.run("generate-illustration-images", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });

      const { width, height } = getIllustrationSize(job.visualType || "1:1");
      const imageProvider = getImageProvider();
      const storage = getStorageProvider();

      for (const variant of job.variants as VariantRecord[]) {
        const spec = variant.plannerSpec as {
          variantLabel: string;
          artDirection: {
            backgroundPrompt?: string;
            style?: string;
            solidBackground?: string;
            referenceInstructions?: string;
          };
          referencesUsed?: string[];
        } | null;

        if (!spec?.artDirection?.backgroundPrompt) continue;

        await prisma.variant.update({ where: { id: variant.id }, data: { status: "generating" } });

        const referenceImages: ReferenceImage[] = [];

        // 1. Subject references (user-uploaded photos) go FIRST — anchor what is drawn
        const subjectRefs = getSubjectRefs(job);
        const totalSubjectRefs = subjectRefs.length;
        for (let ri = 0; ri < totalSubjectRefs; ri++) {
          const ref = subjectRefs[ri];
          const subjectBuffer = await loadRefBuffer(ref.url);
          if (!subjectBuffer) {
            console.warn(`[IllustrationImageGen] Failed to load subject reference ${ri + 1}: ${ref.url}`);
            continue;
          }
          const noteClause = ref.note.trim() ? `\n\nCREATOR INSTRUCTIONS FOR THIS REFERENCE: "${ref.note.trim()}"` : "";
          const nOfM = totalSubjectRefs > 1 ? ` ${ri + 1} of ${totalSubjectRefs}` : "";
          const multiClause = totalSubjectRefs > 1
            ? `\n\nMULTI-REFERENCE COMPOSITION: You have ${totalSubjectRefs} subject references. Compose all of them into a single cohesive illustration — each reference is a different character or element that should appear in the final image.`
            : "";
          referenceImages.push({
            buffer: subjectBuffer,
            description: `SUBJECT REFERENCE${nOfM} — real-world reference for the character or subject. Use it to capture physique, pose, clothing, and likeness. Translate into the CB flat-vector illustration style.${noteClause}${multiClause}`,
          });
          console.log(`[IllustrationImageGen] Loaded subject reference ${ri + 1}/${totalSubjectRefs} (${subjectBuffer.length} bytes)`);
        }

        // 2. Angle reference — send to Gemini so it can visually match the camera angle
        const angleRefData = (job.angleReference as { url: string; note: string } | null) ?? null;
        if (angleRefData?.url) {
          const angleBuffer = await loadRefBuffer(angleRefData.url);
          if (angleBuffer) {
            const angleNoteClause = angleRefData.note.trim()
              ? ` Creator note: "${angleRefData.note.trim()}".`
              : "";
            referenceImages.push({
              buffer: angleBuffer,
              description: `ANGLE REFERENCE — match the EXACT camera angle, elevation, and perspective shown in this image. Do NOT copy the subject, style, or colors — replicate only the viewpoint: the camera height, tilt, and how the subject is positioned relative to the viewer.${angleNoteClause}`,
            });
            console.log(`[IllustrationImageGen] Loaded angle reference (${angleBuffer.length} bytes)`);
          } else {
            console.warn(`[IllustrationImageGen] Could not load angle reference: ${angleRefData.url}`);
          }
        }

        // 3. Vault style references follow — anchor the visual style
        const refIds = (spec.referencesUsed || []);
        if (refIds.length > 0) {
          const vaultItems = await prisma.assetVaultItem.findMany({
            where: { id: { in: refIds } },
            select: { id: true, pathOrUrl: true, notes: true, type: true, analysis: true },
          });

          for (const [styleIdx, item] of vaultItems.entries()) {
            const filePath = path.resolve(process.cwd(), item.pathOrUrl);
            const ext = path.extname(filePath).toLowerCase();
            if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;

            try {
              if (fs.existsSync(filePath)) {
                const buf = fs.readFileSync(filePath);
                const a = item.analysis as Record<string, unknown> | null;
                const subjects = Array.isArray(a?.subjects) ? (a.subjects as string[]).join(", ") : "";
                const style = typeof a?.styleNotes === "string" ? a.styleNotes : "";
                const desc = subjects ? `illustration of ${subjects}` : (item.notes || "illustration");
                const styleHint = style ? ` — style: ${style.slice(0, 100)}` : "";

                referenceImages.push({
                  buffer: buf,
                  description: `STYLE REFERENCE ${styleIdx + 1} — ${desc}${styleHint}. Use this for visual style guidance: color treatment, line work, shading technique, and level of stylization.`,
                });
                console.log(`[IllustrationImageGen] Loaded style ref ${styleIdx + 1}: ${item.id} (${buf.length} bytes)`);
              }
            } catch {
              console.warn(`[IllustrationImageGen] Failed to load vault ref ${item.id}`);
            }
          }
        }

        const solidBg = spec.artDirection.solidBackground || "#1A0B2E";
        const refInstructions = spec.artDirection.referenceInstructions || "";

        let imagePrompt = spec.artDirection.backgroundPrompt!;
        imagePrompt += `\n\nBACKGROUND: Solid single flat color ${solidBg} — no gradients, no patterns, no textures. Pure flat fill.`;
        imagePrompt += `\n\nCRITICAL: NO text, NO logos, NO brand marks anywhere in the image. Pure standalone illustration only.`;
        if (refInstructions) imagePrompt += `\n\n${refInstructions}`;
        if (illustrationStyleRules) imagePrompt += `\n\n${illustrationStyleRules}`;

        const result = await imageProvider.generateImage({
          prompt: imagePrompt,
          width,
          height,
          style: spec.artDirection.style || "flat-vector",
          referenceImages,
          mode: "illustration",
        });

        const artifactPath = `jobs/${jobId}/illustrations/${spec.variantLabel}_illustration.png`;
        const url = await storage.upload(result.buffer, artifactPath, result.mimeType);

        await prisma.artifact.create({
          data: {
            variantId: variant.id,
            channel: "illustration",
            kind: "final_png",
            url,
            width,
            height,
            mimeType: result.mimeType,
          },
        });

        const specPath = `jobs/${jobId}/specs/${spec.variantLabel}_illustration_spec.json`;
        const specBuffer = Buffer.from(JSON.stringify(spec, null, 2));
        const specUrl = await storage.upload(specBuffer, specPath, "application/json");

        await prisma.artifact.create({
          data: {
            variantId: variant.id,
            channel: "all",
            kind: "spec_json",
            url: specUrl,
            width: 0,
            height: 0,
            mimeType: "application/json",
          },
        });

        console.log(`[IllustrationImageGen] Variant ${spec.variantLabel} done — subjectRefs=${subjectRefs.length}, styleRefs=${refIds.length}`);
      }
    });

    await step.run("mark-ready", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });

      for (const variant of job.variants) {
        await prisma.variant.update({ where: { id: variant.id }, data: { status: "ready" } });
      }

      await prisma.job.update({ where: { id: jobId }, data: { status: "ready" } });
    });

    return { jobId, status: "ready" };
  }
);

/**
 * Expand an accepted illustration by ~28% on all sides using Gemini outpainting.
 * Triggered by POST /api/artifacts/:id/expand.
 * Saves a new Artifact with kind="expanded_png" on the same variant.
 */
export const expandIllustrationJob = inngest.createFunction(
  {
    id: "expand-illustration-job",
    retries: 1,
  },
  { event: "artifact/expand" },
  async ({ event, step }) => {
    const { artifactId, variantId } = event.data as { artifactId: string; variantId: string };

    await step.run("expand-illustration", async () => {
      const artifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifactId } });

      const variant = await prisma.variant.findUniqueOrThrow({
        where: { id: variantId },
        select: { id: true, jobId: true, plannerSpec: true },
      });

      // Resolve the original image from local storage
      const localPath = path.resolve(process.cwd(), "public" + artifact.url);
      if (!fs.existsSync(localPath)) {
        throw new Error(`Artifact file not found: ${localPath}`);
      }
      const originalBuffer = fs.readFileSync(localPath);

      const spec = variant.plannerSpec as Record<string, unknown> | null;
      const artDir = spec?.artDirection as Record<string, unknown> | null;
      const solidBg = (artDir?.solidBackground as string) || "#0F0A1A";
      const bgPrompt = typeof artDir?.backgroundPrompt === "string" ? artDir.backgroundPrompt : "";
      const contextExcerpt = bgPrompt.length > 30
        ? bgPrompt.slice(0, 200).replace(/\s+/g, " ").trim()
        : "";

      const hex = solidBg.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16) || 26;
      const g = parseInt(hex.slice(2, 4), 16) || 11;
      const b = parseInt(hex.slice(4, 6), 16) || 46;

      const metadata = await sharp(originalBuffer).metadata();
      const origW = metadata.width ?? artifact.width;
      const origH = metadata.height ?? artifact.height;
      const padX = Math.round(origW * 0.14);
      const padY = Math.round(origH * 0.14);
      const newW = origW + padX * 2;
      const newH = origH + padY * 2;

      const expandedCanvas = await sharp({
        create: { width: newW, height: newH, channels: 3, background: { r, g, b } },
      })
        .composite([{ input: originalBuffer, left: padX, top: padY }])
        .png()
        .toBuffer();

      console.log(`[Expand] Canvas ${origW}×${origH} → ${newW}×${newH}, bg=${solidBg}`);

      const imageProvider = getImageProvider();
      const result = await imageProvider.generateImage({
        prompt: "Extend the illustration naturally into the border area. Keep the exact same flat-vector style, colours, and solid background colour. Seamlessly continue all visual elements from the original into the empty border region.",
        width: newW,
        height: newH,
        mode: "illustration",
        referenceImages: [
          {
            buffer: expandedCanvas,
            description: `Original illustration centred on an expanded ${newW}×${newH} canvas. The solid-colour border around it is the area to fill in by naturally extending the character.`,
          },
        ],
      });

      const storage = getStorageProvider();
      const expandedPath = `jobs/${variant.jobId}/illustrations/${artifactId}_expanded.png`;
      const url = await storage.upload(result.buffer, expandedPath, result.mimeType);

      await prisma.artifact.create({
        data: {
          variantId,
          channel: "illustration",
          kind: "expanded_png",
          url,
          width: newW,
          height: newH,
          mimeType: result.mimeType,
        },
      });

      console.log(`[Expand] Done → ${url} (${newW}×${newH})`);
    });

    return { artifactId, status: "expanded" };
  }
);

/**
 * Edit an accepted illustration or pictogram using a user-supplied text instruction.
 * Sends the existing image + edit prompt to Gemini, saves result as "edited_png".
 * Replaces any previous edited_png for the same variant.
 */
export const editIllustrationJob = inngest.createFunction(
  {
    id: "edit-illustration-job",
    retries: 1,
  },
  { event: "artifact/edit" },
  async ({ event, step }) => {
    const { artifactId, variantId, editPrompt } = event.data as {
      artifactId: string;
      variantId: string;
      editPrompt: string;
    };

    await step.run("edit-illustration", async () => {
      const artifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifactId } });

      const variant = await prisma.variant.findUniqueOrThrow({
        where: { id: variantId },
        select: { id: true, jobId: true, plannerSpec: true },
      });

      const localPath = path.resolve(process.cwd(), "public" + artifact.url);
      if (!fs.existsSync(localPath)) {
        throw new Error(`Artifact file not found: ${localPath}`);
      }
      const originalBuffer = fs.readFileSync(localPath);

      const spec = variant.plannerSpec as Record<string, unknown> | null;
      const artDir = spec?.artDirection as Record<string, unknown> | null;
      const solidBg = (artDir?.solidBackground as string) || "#0F0A1A";
      const style = (artDir?.style as string) || "flat-vector";
      const bgPrompt = typeof artDir?.backgroundPrompt === "string" ? artDir.backgroundPrompt : "";
      const styleContext = bgPrompt.length > 20
        ? bgPrompt.slice(0, 150).replace(/\s+/g, " ").trim()
        : "";

      console.log(`[Edit] Editing artifact ${artifactId} (${artifact.width}×${artifact.height}) with prompt: "${editPrompt.slice(0, 80)}..."`);

      const imageProvider = getImageProvider();
      const result = await imageProvider.generateImage({
        prompt: `You are editing an existing ${style} illustration. Apply ONLY the following change to the image:

EDIT INSTRUCTION: "${editPrompt}"

STRICT RULES:
- Apply ONLY the requested change — preserve EVERYTHING else exactly
- Maintain the exact same art style: ${style}
- Maintain the same color palette and overall composition
- Keep the solid background colour: ${solidBg}
- Preserve the same dimensions and framing
- Zero text, logos, or branding elements unless they were in the original
- The result must look like a professional continuation of the original image${styleContext ? `\n\nOriginal image context: "${styleContext}..."` : ""}

Output a single clean flattened RGB image at exactly ${artifact.width}×${artifact.height} pixels.`,
        width: artifact.width,
        height: artifact.height,
        mode: "illustration",
        referenceImages: [
          {
            buffer: originalBuffer,
            description: `SUBJECT REFERENCE — the original image to edit. Apply only the requested change while preserving all other aspects of this image exactly.`,
          },
        ],
      });

      // Delete any existing edited_png for this variant so we always show the latest edit
      await prisma.artifact.deleteMany({
        where: { variantId, kind: "edited_png" },
      });

      const storage = getStorageProvider();
      const editedPath = `jobs/${variant.jobId}/illustrations/${artifactId}_edited.png`;
      const url = await storage.upload(result.buffer, editedPath, result.mimeType);

      await prisma.artifact.create({
        data: {
          variantId,
          channel: artifact.channel,
          kind: "edited_png",
          url,
          width: artifact.width,
          height: artifact.height,
          mimeType: result.mimeType,
        },
      });

      console.log(`[Edit] Done → ${url} (${artifact.width}×${artifact.height})`);
    });

    return { artifactId, status: "edited" };
  }
);

/**
 * Phase 1: Pictogram mode — retrieve pictogram vault refs + run Claude with pictogram system prompt.
 * No templates used. Marks job as "planned" for spec review.
 */
export const generatePictogramJob = inngest.createFunction(
  {
    id: "generate-pictogram-job",
    retries: 2,
    onFailure: async ({ event }) => {
      const jobId = event.data.event?.data?.jobId as string | undefined;
      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "failed",
            errorMessage: String(event.data.error?.message || "Pictogram planning failed").slice(0, 500),
          },
        });
        console.error(`[PictogramPlanner] Job ${jobId} marked as FAILED`);
      }
    },
  },
  { event: "job/generate-pictogram" },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string;

    await step.run("mark-running", async () => {
      await prisma.job.update({ where: { id: jobId }, data: { status: "running" } });
    });

    const pictogramRefs = await step.run("retrieve-pictogram-refs", async () => {
      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

      const results = await searchVault({
        query: job.description,
        visualType: "pictogram",
        limit: 12,
      });

      const pictogramOnly = results.items.filter((i) => i.type === "pictogram");
      const refs = pictogramOnly.length > 0
        ? pictogramOnly
        : results.items.filter((i) => i.type === "illustration").slice(0, 4);

      console.log(`[PictogramVault] Found ${pictogramOnly.length} pictogram refs (fallback illustrations: ${refs.length - pictogramOnly.length})`);

      await prisma.job.update({
        where: { id: jobId },
        data: {
          retrievalBundle: JSON.parse(
            JSON.stringify({ items: refs, totalMatched: results.totalMatched })
          ),
        },
      });

      return refs;
    });

    await step.run("run-pictogram-planner", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });

      const enrichedItems = await enrichWithAnalysis(pictogramRefs);
      const rules = await buildRulesBlock("pictogram");

      console.log(`[PictogramRules] Injecting ${rules.ruleCount} rules (~${rules.estimatedTokens} tokens, v${rules.version})`);

      await prisma.job.update({
        where: { id: jobId },
        data: { rulesVersion: rules.version, rulesSnapshot: rules.text || null },
      });

      const formatRef = (ref: typeof enrichedItems[0]) => {
        let line = `- ${ref.id} [${ref.type}] tags=[${ref.tags.join(",")}]`;
        if (ref.analysis?.subjects?.length) line += `\n  Subjects: ${ref.analysis.subjects.join(", ")}`;
        if (ref.analysis?.description) line += `\n  Description: ${ref.analysis.description}`;
        if (ref.analysis?.styleNotes) line += `\n  Style: ${ref.analysis.styleNotes}`;
        if (ref.analysis?.colorPalette?.length) line += `\n  Colors: ${ref.analysis.colorPalette.join(", ")}`;
        if (ref.analysis?.mood) line += `\n  Mood: ${ref.analysis.mood}`;
        if (ref.notes) line += `\n  Notes: ${ref.notes}`;
        return line;
      };

      const subjectRefs = getSubjectRefs(job);
      const hasSubjectRef = subjectRefs.length > 0;
      const vaultLabel = hasSubjectRef
        ? "STYLE REFERENCES FROM VAULT (use for flat-vector toon style guidance — perspective angle, cel-shading approach, colour palette):"
        : "PICTOGRAM VAULT REFERENCES (pick 1-3 that best match the subject category — use them for 3D style, perspective, and colour treatment):";
      const vaultSummary = enrichedItems.length > 0
        ? `${vaultLabel}\n` + enrichedItems.map(formatRef).join("\n")
        : "No pictogram references available — rely on style description alone. Design a CB pictogram icon following brand guidelines: flat-vector toon style, slight 3D perspective angle, hard-edged cel-shading, purple dominant, solid dark background (#0F0A1A).";

      const userMessage = PICTOGRAM_USER_TEMPLATE({
        description: job.description,
        sizePreset: job.visualType || "1:1",
        vaultSummary,
        hasSubjectReference: hasSubjectRef,
        subjectReferences: subjectRefs,
      });

      const systemPrompt = buildPictogramSystemPrompt(rules.text);

      let rawText: string;

      if (process.env.USE_MOCK_PROVIDERS === "true" || !process.env.ANTHROPIC_API_KEY) {
        rawText = JSON.stringify({
          variants: [
            {
              variantLabel: "A",
              artDirection: {
                backgroundPrompt: `A CB pictogram icon — flat vector toon style on a solid dark background (#0F0A1A). The icon is constructed from clean geometric vector shapes viewed from a slight 3D perspective angle (isometric/3-quarter view). Toon cel-shading: 2-3 hard-edged flat tone planes per surface — a base fill, a hard highlight plane, and a shadow plane — no smooth gradient blending. Dominant CB purple (#8B4CF7) base fill with flat lighter purple (#C47EFF) highlight plane and flat deeper purple (#6B2FBF) shadow plane. Crisp vector edges, bold shape reading. No drop shadows, no halos — icon sits cleanly on the deep dark background. Icon centered, occupying 70% of canvas, vivid and saturated against the dark ground.`,
                style: "flat-vector-toon",
                mood: "Premium & Bold",
                palette: ["#8B4CF7", "#C47EFF", "#6B2FBF", "#0F0A1A"],
                solidBackground: "#0F0A1A",
                referenceInstructions: "Match the flat-vector toon style: slight 3D perspective angle, hard-edged cel-shading tones (not smooth gradients), CB purple palette. Render on solid dark background.",
              },
              referencesUsed: enrichedItems.slice(0, 1).map((r) => r.id),
              copy: { headline: "", subhead: "", cta: "" },
            },
            {
              variantLabel: "B",
              artDirection: {
                backgroundPrompt: `A CB pictogram icon — flat vector toon style, variant B with CB orange accent on solid dark background (#0F0A1A). Clean geometric vector shapes from a slight 3D perspective angle. Toon cel-shading: flat orange (#FF6B2F) base, flat warm highlight plane (#FFA57A), flat deeper shadow plane (#C44B0E) — hard edges, no smooth blending. Bold shape reading, crisp vector construction. No drop shadows, no halos. Icon centered, occupying 70% of canvas. Vivid saturated orange pops brilliantly against the dark background.`,
                style: "flat-vector-toon",
                mood: "Energetic & Warm",
                palette: ["#FF6B2F", "#FFA57A", "#C44B0E", "#0F0A1A"],
                solidBackground: "#0F0A1A",
                referenceInstructions: "Match the flat-vector toon style: slight 3D perspective, hard-edged cel-shading (not smooth gradients), apply orange palette on solid dark background.",
              },
              referencesUsed: enrichedItems.slice(0, 1).map((r) => r.id),
              copy: { headline: "", subhead: "", cta: "" },
            },
          ],
          reasoning: `Mock pictogram plan for "${job.description}"`,
        });
      } else {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{ role: "user", content: userMessage }],
          system: systemPrompt,
        });
        rawText = response.content[0].type === "text" ? response.content[0].text : "";
      }

      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("[PictogramPlanner] Invalid JSON from Claude:", cleaned.slice(0, 500));
        throw new Error("Pictogram planner returned invalid JSON");
      }

      const variantsRaw = Array.isArray(parsed.variants)
        ? (parsed.variants as Record<string, unknown>[])
        : [parsed as Record<string, unknown>];

      const labels: Array<"A" | "B"> = ["A", "B"];
      const variants = (job.variants || []) as VariantRecord[];

      for (let i = 0; i < Math.min(variantsRaw.length, 2); i++) {
        const vRaw = variantsRaw[i];
        const label = labels[i];

        const artRaw = (vRaw.artDirection || vRaw.art_direction || {}) as Record<string, unknown>;
        const artDirection = {
          backgroundPrompt: String(artRaw.backgroundPrompt || artRaw.background_prompt || artRaw.imagePrompt || ""),
          style: String(artRaw.style || "flat-vector-toon"),
          mood: String(artRaw.mood || ""),
          palette: Array.isArray(artRaw.palette) ? artRaw.palette : [],
          solidBackground: String(artRaw.solidBackground || artRaw.solid_background || "#0F0A1A"),
          referenceInstructions: String(artRaw.referenceInstructions || artRaw.reference_instructions || ""),
        };

        const refsUsed: string[] = Array.isArray(vRaw.referencesUsed)
          ? (vRaw.referencesUsed as string[])
          : Array.isArray(vRaw.references_used)
          ? (vRaw.references_used as string[])
          : [];

        const referencePaths: Record<string, string> = {};
        for (const refId of refsUsed) {
          const item = enrichedItems.find((e) => e.id === refId);
          if (item?.pathOrUrl) {
            referencePaths[refId] = item.pathOrUrl;
          }
        }

        const spec = {
          variantLabel: label,
          artDirection,
          referencesUsed: refsUsed,
          referencePaths,
          copy: typeof vRaw.copy === "object" && vRaw.copy !== null ? vRaw.copy : { headline: "", cta: "" },
        };

        const variant = variants.find((v: VariantRecord) => v.label === label);
        if (variant) {
          await prisma.variant.update({
            where: { id: variant.id },
            data: {
              plannerSpec: JSON.parse(JSON.stringify(spec)),
              status: "planned",
            },
          });
        }
      }

      console.log(`[PictogramPlanner] Planned ${Math.min(variantsRaw.length, 2)} variants for job ${jobId}`);
    });

    await step.run("mark-planned", async () => {
      await prisma.job.update({ where: { id: jobId }, data: { status: "planned" } });
    });

    return { jobId, status: "planned" };
  }
);

/**
 * Phase 2 (pictogram): Generate images from approved pictogram specs.
 */
export const generatePictogramImagesJob = inngest.createFunction(
  {
    id: "generate-pictogram-images-job",
    retries: 2,
    onFailure: async ({ event }) => {
      const jobId = event.data.event?.data?.jobId as string | undefined;
      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "failed",
            errorMessage: String(event.data.error?.message || "Pictogram image generation failed").slice(0, 500),
          },
        });
        console.error(`[PictogramImageGen] Job ${jobId} marked as FAILED`);
      }
    },
  },
  { event: "job/generate-pictogram-images" },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string;

    await step.run("mark-generating", async () => {
      await prisma.job.update({ where: { id: jobId }, data: { status: "generating" } });
    });

    const pictogramStyleRules = await step.run("load-style-rules", async () => {
      const rules = await prisma.promptRule.findMany({
        where: { enabled: true, mode: "pictogram" },
        orderBy: [{ confidence: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
        take: 15,
      });
      if (rules.length === 0) return "";

      const doRules = rules
        .filter((r) => ["do", "style", "positive", "composition"].includes(r.category))
        .map((r) => r.content);
      const dontRules = rules
        .filter((r) => ["dont", "color"].includes(r.category))
        .map((r) => r.content);

      const parts: string[] = [];
      if (doRules.length > 0) parts.push("PICTOGRAM STYLE RULES — FOLLOW THESE:\n" + doRules.map((r) => `• ${r}`).join("\n"));
      if (dontRules.length > 0) parts.push("AVOID:\n" + dontRules.map((r) => `• ${r}`).join("\n"));
      console.log(`[Rules→Gemini] Injecting ${rules.length} style rules into pictogram prompt`);
      return parts.join("\n\n");
    });

    await step.run("generate-pictogram-images", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });

      const { width, height } = getIllustrationSize(job.visualType || "1:1");
      const imageProvider = getImageProvider();
      const storage = getStorageProvider();

      for (const variant of job.variants as VariantRecord[]) {
        const spec = variant.plannerSpec as {
          variantLabel: string;
          artDirection: {
            backgroundPrompt?: string;
            style?: string;
            solidBackground?: string;
            referenceInstructions?: string;
          };
          referencesUsed?: string[];
        } | null;

        if (!spec?.artDirection?.backgroundPrompt) continue;

        await prisma.variant.update({ where: { id: variant.id }, data: { status: "generating" } });

        const referenceImages: ReferenceImage[] = [];

        // 1. Subject references (user-uploaded) — define the concepts to iconify
        const subjectRefs = getSubjectRefs(job);
        const totalSubjectRefs = subjectRefs.length;
        for (let ri = 0; ri < totalSubjectRefs; ri++) {
          const ref = subjectRefs[ri];
          const subjectBuffer = await loadRefBuffer(ref.url);
          if (!subjectBuffer) {
            console.warn(`[PictogramImageGen] Failed to load subject reference ${ri + 1}: ${ref.url}`);
            continue;
          }
          const noteClause = ref.note.trim() ? `\n\nCREATOR INSTRUCTIONS: "${ref.note.trim()}"` : "";
          const nOfM = totalSubjectRefs > 1 ? ` ${ri + 1} of ${totalSubjectRefs}` : "";
          const multiClause = totalSubjectRefs > 1
            ? `\n\nMULTI-REFERENCE COMPOSITION: You have ${totalSubjectRefs} subject references. Compose them all into a single icon scene — each reference defines a different element, character, or perspective of the same concept.`
            : "";
          referenceImages.push({
            buffer: subjectBuffer,
            description: `SUBJECT REFERENCE${nOfM} — depicts the concept to iconify. Translate into CB pictogram style: flat vector toon, slight 3D perspective angle, hard-edged cel-shading (NOT smooth gradients), CB purple (#8D52DA) where applicable, solid dark background (#0F0A1A). Do NOT reproduce literally.${noteClause}${multiClause}`,
          });
          console.log(`[PictogramImageGen] Loaded subject reference ${ri + 1}/${totalSubjectRefs} (${subjectBuffer.length} bytes)`);
        }

        // 2. Vault style references — icon style guidance
        const refIds = (spec.referencesUsed || []);
        if (refIds.length > 0) {
          const vaultItems = await prisma.assetVaultItem.findMany({
            where: { id: { in: refIds } },
            select: { id: true, pathOrUrl: true, notes: true, type: true, analysis: true },
          });

          for (const [styleIdx, item] of vaultItems.entries()) {
            const filePath = path.resolve(process.cwd(), item.pathOrUrl);
            const ext = path.extname(filePath).toLowerCase();
            if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;

            try {
              if (fs.existsSync(filePath)) {
                const buf = fs.readFileSync(filePath);
                const a = item.analysis as Record<string, unknown> | null;
                const subjects = Array.isArray(a?.subjects) ? (a.subjects as string[]).join(", ") : "";
                const style = typeof a?.styleNotes === "string" ? a.styleNotes : "";
                const desc = subjects ? `icon of ${subjects}` : (item.notes || "pictogram icon");
                const styleHint = style ? ` — style: ${style.slice(0, 100)}` : "";

                referenceImages.push({
                  buffer: buf,
                  description: `STYLE REFERENCE ${styleIdx + 1} — ${desc}${styleHint}. Use this CB pictogram for style guidance: flat-vector toon construction, 3D perspective angle, hard-edged cel-shading approach, colour palette, and overall icon quality. Match this toon style — crisp vector shapes, flat highlight/shadow planes, not smooth gradients.`,
                });
                console.log(`[PictogramImageGen] Loaded style ref ${styleIdx + 1}: ${item.id} (${buf.length} bytes)`);
              }
            } catch {
              console.warn(`[PictogramImageGen] Failed to load vault ref ${item.id}`);
            }
          }
        }

        const solidBg = spec.artDirection.solidBackground || "#0F0A1A";
        const refInstructions = spec.artDirection.referenceInstructions || "";

        let imagePrompt = spec.artDirection.backgroundPrompt!;
        imagePrompt += `\n\nBACKGROUND — ABSOLUTE: Solid dark background (#0F0A1A or #120D20) fills the entire canvas. NO white, NO transparency, NO light backgrounds, NO soft vignettes, NO gradients on the background. The dark background is part of the design.`;
        imagePrompt += `\n\nNO SHADOWS: Do NOT add drop shadows, soft halos, or glow effects around or beneath the icon. The icon sits cleanly on the dark ground with no shadow tricks.`;
        imagePrompt += `\n\nCRITICAL: NO text anywhere unless it is intrinsic to the object itself ('777' on slot reels, 'VIP' on VIP chip). Icon must be clearly readable at thumbnail size (64px). Colours must be VIVID and SATURATED to pop against the dark background.`;
        if (refInstructions) imagePrompt += `\n\n${refInstructions}`;
        if (pictogramStyleRules) imagePrompt += `\n\n${pictogramStyleRules}`;

        const result = await imageProvider.generateImage({
          prompt: imagePrompt,
          width,
          height,
          style: spec.artDirection.style || "flat-vector-toon",
          referenceImages,
          mode: "pictogram",
        });

        const artifactPath = `jobs/${jobId}/pictograms/${spec.variantLabel}_pictogram.png`;
        const url = await storage.upload(result.buffer, artifactPath, result.mimeType);

        await prisma.artifact.create({
          data: {
            variantId: variant.id,
            channel: "pictogram",
            kind: "final_png",
            url,
            width,
            height,
            mimeType: result.mimeType,
          },
        });

        const specPath = `jobs/${jobId}/specs/${spec.variantLabel}_pictogram_spec.json`;
        const specBuffer = Buffer.from(JSON.stringify(spec, null, 2));
        const specUrl = await storage.upload(specBuffer, specPath, "application/json");

        await prisma.artifact.create({
          data: {
            variantId: variant.id,
            channel: "all",
            kind: "spec_json",
            url: specUrl,
            width: 0,
            height: 0,
            mimeType: "application/json",
          },
        });

        console.log(`[PictogramImageGen] Variant ${spec.variantLabel} done — subjectRefs=${subjectRefs.length}, styleRefs=${refIds.length}`);
      }
    });

    await step.run("mark-ready", async () => {
      const job = await prisma.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { variants: true },
      });

      for (const variant of job.variants) {
        await prisma.variant.update({ where: { id: variant.id }, data: { status: "ready" } });
      }

      await prisma.job.update({ where: { id: jobId }, data: { status: "ready" } });
    });

    return { jobId, status: "ready" };
  }
);

// ---------------------------------------------------------------------------
// analyzeVaultItemJob — runs Claude vision analysis on a newly ingested vault item
// ---------------------------------------------------------------------------

export const analyzeVaultItemJob = inngest.createFunction(
  { id: "analyze-vault-item", retries: 2 },
  { event: "vault/analyze" },
  async ({ event, step }) => {
    const { vaultItemId } = event.data as { vaultItemId: string };

    await step.run("analyze-image", async () => {
      const item = await prisma.assetVaultItem.findUnique({ where: { id: vaultItemId } });
      if (!item) {
        console.warn(`[VaultAnalyze] Item not found: ${vaultItemId}`);
        return;
      }

      await prisma.assetVaultItem.update({
        where: { id: vaultItemId },
        data: { analysisStatus: "analyzing" },
      });

      // Load image: external URL or local /uploads path
      let imageBuffer: Buffer;
      if (item.pathOrUrl.startsWith("http")) {
        const res = await fetch(item.pathOrUrl);
        if (!res.ok) throw new Error(`Failed to fetch vault image: ${res.status}`);
        imageBuffer = Buffer.from(await res.arrayBuffer());
      } else {
        const localPath = path.resolve(process.cwd(), "public" + item.pathOrUrl);
        if (!fs.existsSync(localPath)) throw new Error(`Vault item not found on disk: ${localPath}`);
        imageBuffer = fs.readFileSync(localPath);
      }

      // Resize if over 4 MB to stay within Claude's 5 MB limit
      const MAX_BYTES = 4 * 1024 * 1024;
      let mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" = "image/png";
      if (imageBuffer.length > MAX_BYTES) {
        imageBuffer = await sharp(imageBuffer)
          .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        mimeType = "image/jpeg";
      }

      const base64 = imageBuffer.toString("base64");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
              { type: "text", text: VAULT_ANALYSIS_PROMPT },
            ],
          },
        ],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const analysis = JSON.parse(cleaned);

      await prisma.assetVaultItem.update({
        where: { id: vaultItemId },
        data: {
          analysis: JSON.parse(JSON.stringify(analysis)),
          analysisStatus: "done",
          analyzedAt: new Date(),
        },
      });

      clearVaultCache();
      console.log(`[VaultAnalyze] Analysis complete for ${vaultItemId}`);
    });

    return { vaultItemId, status: "analyzed" };
  }
);
