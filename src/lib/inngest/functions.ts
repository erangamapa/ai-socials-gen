import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { inngest } from "./client";
import { prisma } from "../db";
import { searchVaultSplit, enrichWithAnalysis, searchVault } from "../vault/vaultIndex";
import { getPlanner } from "../ai/claudePlanner";
import { getImageProvider } from "../ai/nanoBananaProvider";
import { getStorageProvider } from "../storage";
import { TEMPLATE_REGISTRY } from "../templates/registry";
import { Channel, CHANNEL_SIZES } from "../templates/types";
import { ReferenceImage } from "../ai/types";
import { buildRulesBlock } from "../ai/promptBuilder";
import { buildIllustrationSystemPrompt, ILLUSTRATION_USER_TEMPLATE } from "../ai/illustrationPrompts";

interface VariantRecord {
  id: string;
  label: string;
  jobId: string;
  status: string;
  plannerSpec: unknown;
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

      console.log(`[Rules] Injecting ${rules.ruleCount} rules (~${rules.estimatedTokens} tokens, v${rules.version})`);

      await prisma.job.update({
        where: { id: jobId },
        data: { rulesVersion: rules.version },
      });

      const planner = getPlanner();
      const output = await planner.plan({
        description: job.description,
        channels: job.channels,
        visualType: job.visualType,
        templateIds: TEMPLATE_REGISTRY.map((t) => t.id),
        rulesBlock: rules.text,
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
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
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

        console.log(`[ImageGen] Variant ${spec.variantLabel}: template=${spec.templateAssetId || "none"}, refs=${referenceImages.length} (1 tpl + ${referenceImages.length - 1} style)`);

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
        data: { rulesVersion: rules.version },
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

      const hasSubjectRef = !!job.subjectReferenceUrl;
      const vaultLabel = hasSubjectRef
        ? "STYLE REFERENCES FROM VAULT (use for rendering style only — line weight, colour approach, flat shading technique — NOT to define the subject):"
        : "ILLUSTRATION VAULT REFERENCES (pick 2-5 that share the same flat-vector visual style):";
      const vaultSummary = enrichedItems.length > 0
        ? `${vaultLabel}\n` + enrichedItems.map(formatRef).join("\n")
        : "No illustration references available — rely on style description alone.";

      const jobWithNote = job as typeof job & { subjectReferenceNote?: string | null };
      const userMessage = ILLUSTRATION_USER_TEMPLATE({
        description: job.description,
        sizePreset: job.visualType || "1:1",
        vaultSummary,
        hasSubjectReference: hasSubjectRef,
        subjectReferenceNote: jobWithNote.subjectReferenceNote ?? undefined,
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
                solidBackground: "#1A0B2E",
                referenceInstructions: "Match the clean vector style and bold color blocking.",
              },
              referencesUsed: enrichedItems.slice(0, 2).map((r) => r.id),
              copy: { headline: "", subhead: "", cta: "" },
            },
            {
              variantLabel: "B",
              artDirection: {
                backgroundPrompt: `Alternative angle — same character from a side-profile or three-quarter view, captured mid-action with strong foreshortening. 3D stylized with subtle volume shading, clean edges, stylized proportions. Deep orange and purple palette. Solid single-color background in dark midnight blue (#0B1120). Subject fills 65% of frame height with clear negative space. No text, no logos.`,
                style: "3D stylized",
                mood: "Premium & Sleek",
                palette: ["#7C3AED", "#FF6B2F", "#0B1120"],
                solidBackground: "#0B1120",
                referenceInstructions: "Match the 3D stylized shading approach.",
              },
              referencesUsed: enrichedItems.slice(0, 2).map((r) => r.id),
              copy: { headline: "", subhead: "", cta: "" },
            },
            {
              variantLabel: "C",
              artDirection: {
                backgroundPrompt: `Experimental composition — dramatic extreme close-up or overhead angle, pushing maximum visual impact. Neon yellow and electric blue palette on very dark background (#0D0D1A). High contrast, bold graphic shapes, slightly exaggerated proportions for intensity. Clean flat-vector style. Character occupies center frame, subject clearly isolated against solid background. Zero text or branding.`,
                style: "flat-vector",
                mood: "Vibrant & Experimental",
                palette: ["#F59E0B", "#2D4BE6", "#0D0D1A"],
                solidBackground: "#0D0D1A",
                referenceInstructions: "Push the color contrast and bold shapes.",
              },
              referencesUsed: enrichedItems.slice(0, 2).map((r) => r.id),
              copy: { headline: "", subhead: "", cta: "" },
            },
          ],
          reasoning: `Mock illustration plan for "${job.description}"`,
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
        console.error("[IllustrationPlanner] Invalid JSON from Claude:", cleaned.slice(0, 500));
        throw new Error("Illustration planner returned invalid JSON");
      }

      const variantsRaw = Array.isArray(parsed.variants)
        ? (parsed.variants as Record<string, unknown>[])
        : [parsed as Record<string, unknown>];

      const labels: Array<"A" | "B" | "C"> = ["A", "B", "C"];
      const variants = (job.variants || []) as VariantRecord[];

      for (let i = 0; i < Math.min(variantsRaw.length, 3); i++) {
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

      console.log(`[IllustrationPlanner] Planned ${Math.min(variantsRaw.length, 3)} variants for job ${jobId}`);
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

        // 1. Subject reference (user-uploaded photo) goes FIRST — anchors what is drawn
        if (job.subjectReferenceUrl) {
          try {
            let subjectBuffer: Buffer | null = null;

            if (job.subjectReferenceUrl.startsWith("/uploads/")) {
              const filePath = path.resolve(process.cwd(), "public" + job.subjectReferenceUrl);
              if (fs.existsSync(filePath)) {
                subjectBuffer = fs.readFileSync(filePath);
              }
            } else if (job.subjectReferenceUrl.startsWith("http")) {
              const res = await fetch(job.subjectReferenceUrl);
              if (res.ok) {
                subjectBuffer = Buffer.from(await res.arrayBuffer());
              }
            }

            if (subjectBuffer) {
              const noteClause = (job as { subjectReferenceNote?: string | null }).subjectReferenceNote?.trim()
                ? `\n\nCREATOR INSTRUCTIONS FOR THIS REFERENCE: "${(job as { subjectReferenceNote?: string | null }).subjectReferenceNote!.trim()}"`
                : "";
              referenceImages.push({
                buffer: subjectBuffer,
                description:
                  `SUBJECT REFERENCE — this is the real-world reference for the character or subject. Use it to capture their physique, pose direction, clothing, and likeness. Translate into the CB flat-vector illustration style — do NOT reproduce the photo literally. Stylize it into the brand aesthetic.${noteClause}`,
              });
              console.log(`[IllustrationImageGen] Loaded subject reference (${subjectBuffer.length} bytes)${noteClause ? " with creator note" : ""}`);
            }
          } catch {
            console.warn(`[IllustrationImageGen] Failed to load subject reference: ${job.subjectReferenceUrl}`);
          }
        }

        // 2. Vault style references follow — anchor the visual style
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

        console.log(`[IllustrationImageGen] Variant ${spec.variantLabel} done — subject=${!!job.subjectReferenceUrl}, refs=${refIds.length}`);
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
