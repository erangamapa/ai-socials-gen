import * as fs from "fs";
import * as path from "path";
import { inngest } from "./client";
import { prisma } from "../db";
import { searchVaultSplit, enrichWithAnalysis } from "../vault/vaultIndex";
import { getPlanner } from "../ai/claudePlanner";
import { getImageProvider } from "../ai/nanoBananaProvider";
import { getStorageProvider } from "../storage";
import { TEMPLATE_REGISTRY } from "../templates/registry";
import { Channel, CHANNEL_SIZES } from "../templates/types";
import { ReferenceImage } from "../ai/types";
import { buildRulesBlock } from "../ai/promptBuilder";

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
      const rules = await buildRulesBlock();

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
      const rules = await prisma.promptRule.findMany({
        where: { enabled: true },
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
