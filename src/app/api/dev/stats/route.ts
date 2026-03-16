import { NextResponse } from "next/server";
import { getPrisma, resetPrisma } from "@/lib/db";
import { TEMPLATE_REGISTRY } from "@/lib/templates/registry";
import { loadVaultIndex } from "@/lib/vault/vaultIndex";
import { BRAND, getBrandColorList } from "@/lib/brand/guidelines";

// Approximate pricing constants
// Claude Sonnet 4 (claude-sonnet-4-20250514): $3/MTok in, $15/MTok out
// Estimated ~5k input + 2.5k output tokens per planner call
const CLAUDE_COST_PER_JOB = 0.0525; // ($3 * 5000 + $15 * 2500) / 1_000_000

// Gemini Flash image generation (gemini-3.1-flash-image-preview): ~$0.02 per image
const IMAGEN_COST_PER_VARIANT = 0.02;

interface AnalysisJson {
  description?: string;
  colorPalette?: string[];
  mood?: string;
  subjects?: string[];
}

export async function GET() {
  let prisma = getPrisma();
  try {
    const [
      jobCount,
      jobsByStatus,
      variantCount,
      artifactCount,
      feedbackCount,
      feedbackByDecision,
      vaultDbCount,
      analysisStatusCounts,
      jobsByMode,
      rulesByMode,
      lastSocialsJob,
      lastIllustrationJob,
      lastPictogramJob,
    ] = await Promise.all([
      prisma.job.count(),
      prisma.job.groupBy({ by: ["status"], _count: true }),
      prisma.variant.count(),
      prisma.artifact.count(),
      prisma.feedback.count(),
      prisma.feedback.groupBy({ by: ["decision"], _count: true }),
      prisma.assetVaultItem.groupBy({ by: ["type"], _count: true }),
      prisma.assetVaultItem.groupBy({ by: ["analysisStatus"], _count: true }),
      prisma.job.groupBy({ by: ["mode"], _count: true }),
      prisma.promptRule.groupBy({ by: ["mode", "enabled"], _count: true }),
      prisma.job.findFirst({ where: { mode: "socials" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.job.findFirst({ where: { mode: "illustration" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.job.findFirst({ where: { mode: "pictogram" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);

    // Per-mode variant counts (for image cost estimation)
    const [socialsVariants, illustrationVariants, pictogramVariants] = await Promise.all([
      prisma.variant.count({ where: { job: { mode: "socials" } } }),
      prisma.variant.count({ where: { job: { mode: "illustration" } } }),
      prisma.variant.count({ where: { job: { mode: "pictogram" } } }),
    ]);

    // Per-mode feedback: join through variants → jobs
    const [socialsFeedback, illustrationFeedback, pictogramFeedback] = await Promise.all([
      prisma.feedback.findMany({
        where: { variant: { job: { mode: "socials" } } },
        select: { decision: true },
      }),
      prisma.feedback.findMany({
        where: { variant: { job: { mode: "illustration" } } },
        select: { decision: true },
      }),
      prisma.feedback.findMany({
        where: { variant: { job: { mode: "pictogram" } } },
        select: { decision: true },
      }),
    ]);

    const analyzedItems = await prisma.assetVaultItem.findMany({
      where: { analysisStatus: "done" },
      select: { id: true, type: true, analysis: true },
    });

    const allColors: Record<string, number> = {};
    const allMoods: Record<string, number> = {};
    const allSubjects: Record<string, number> = {};

    for (const item of analyzedItems) {
      const a = item.analysis as AnalysisJson | null;
      if (!a) continue;

      if (a.colorPalette) {
        for (const c of a.colorPalette) {
          allColors[c] = (allColors[c] || 0) + 1;
        }
      }
      if (a.mood) {
        for (const m of a.mood.split(",").map((s: string) => s.trim()).filter(Boolean)) {
          allMoods[m] = (allMoods[m] || 0) + 1;
        }
      }
      if (a.subjects) {
        for (const s of a.subjects) {
          allSubjects[s] = (allSubjects[s] || 0) + 1;
        }
      }
    }

    const topColors = Object.entries(allColors).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([hex, count]) => ({ hex, count }));
    const topMoods = Object.entries(allMoods).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([mood, count]) => ({ mood, count }));
    const topSubjects = Object.entries(allSubjects).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([subject, count]) => ({ subject, count }));

    const vaultIndex = loadVaultIndex();
    const vaultByType: Record<string, number> = {};
    for (const item of vaultIndex) {
      vaultByType[item.type] = (vaultByType[item.type] || 0) + 1;
    }

    const allTags: Record<string, number> = {};
    for (const item of vaultIndex) {
      for (const tag of item.tags) {
        allTags[tag] = (allTags[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(allTags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([tag, count]) => ({ tag, count }));

    const totalAssets = await prisma.assetVaultItem.count();
    const analysisByStatus: Record<string, number> = {};
    for (const row of analysisStatusCounts) {
      analysisByStatus[row.analysisStatus] = row._count;
    }

    // Build per-mode agent stats
    function buildAgentStats(
      mode: string,
      feedbackRows: { decision: string }[],
      lastJob: { createdAt: Date } | null,
      variantsGenerated: number
    ) {
      const jobRow = jobsByMode.find((r) => r.mode === mode);
      const modeRules = rulesByMode.filter((r) => r.mode === mode);
      const activeRulesRow = modeRules.find((r) => r.enabled === true);
      const totalRulesCount = modeRules.reduce((s, r) => s + r._count, 0);
      const activeRulesCount = activeRulesRow?._count ?? 0;
      const jobsCount = jobRow?._count ?? 0;

      const claudeCost = jobsCount * CLAUDE_COST_PER_JOB;
      const imagenCost = variantsGenerated * IMAGEN_COST_PER_VARIANT;

      return {
        jobs: jobsCount,
        feedback: {
          accept: feedbackRows.filter((f) => f.decision === "accept").length,
          reject: feedbackRows.filter((f) => f.decision === "reject").length,
        },
        rules: {
          active: activeRulesCount,
          total: totalRulesCount,
        },
        lastJobAt: lastJob?.createdAt?.toISOString() ?? null,
        estimatedCost: {
          claudeUsd: claudeCost,
          imagenUsd: imagenCost,
          totalUsd: claudeCost + imagenCost,
          variantsGenerated,
        },
      };
    }

    const agents = {
      socials: buildAgentStats("socials", socialsFeedback, lastSocialsJob, socialsVariants),
      illustration: buildAgentStats("illustration", illustrationFeedback, lastIllustrationJob, illustrationVariants),
      pictogram: buildAgentStats("pictogram", pictogramFeedback, lastPictogramJob, pictogramVariants),
    };

    return NextResponse.json({
      agents,
      vault: {
        totalFiles: vaultIndex.length,
        byType: vaultByType,
        dbRows: vaultDbCount.map((r) => ({ type: r.type, count: r._count })),
        topTags,
      },
      analysis: {
        total: totalAssets,
        done: analysisByStatus["done"] || 0,
        pending: analysisByStatus["pending"] || 0,
        analyzing: analysisByStatus["analyzing"] || 0,
        failed: analysisByStatus["failed"] || 0,
        percent: totalAssets > 0 ? Math.round(((analysisByStatus["done"] || 0) / totalAssets) * 100) : 0,
        brandIntelligence: {
          topColors,
          topMoods,
          topSubjects,
        },
      },
      templates: {
        count: TEMPLATE_REGISTRY.length,
        ids: TEMPLATE_REGISTRY.map((t) => ({ id: t.id, name: t.name, channels: t.spec.channels })),
      },
      jobs: {
        total: jobCount,
        byStatus: jobsByStatus.map((r) => ({ status: r.status, count: r._count })),
      },
      variants: { total: variantCount },
      artifacts: { total: artifactCount },
      feedback: {
        total: feedbackCount,
        byDecision: feedbackByDecision.map((r) => ({ decision: r.decision, count: r._count })),
      },
      system: {
        mockProviders: process.env.USE_MOCK_PROVIDERS === "true",
        storageProvider: process.env.BLOB_STORAGE_PROVIDER || "local",
      },
      brand: {
        name: BRAND.name,
        tagline: BRAND.tagline,
        brandIdea: BRAND.brandIdea,
        colors: getBrandColorList(),
        launchPrimaries: BRAND.colors.launchPrimaries,
        typography: {
          primary: { family: BRAND.typography.primary.family, weights: BRAND.typography.primary.weights, style: BRAND.typography.primary.style },
          secondary: { family: BRAND.typography.secondary.family, weights: BRAND.typography.secondary.weights, style: BRAND.typography.secondary.style },
        },
        tov: BRAND.toneOfVoice.principles.map((p) => ({ name: p.name, description: p.description })),
        behaviors: BRAND.brandBehaviors,
        messaging: BRAND.messaging,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("terminated") || msg.includes("SASL") || msg.includes("reach")) {
      console.warn("DB connection failed, resetting pool and retrying...");
      prisma = resetPrisma();
      try {
        const total = await prisma.assetVaultItem.count();
        return NextResponse.json({ retry: true, dbConnected: true, assetCount: total });
      } catch (retryErr) {
        console.error("Retry also failed:", retryErr);
      }
    }
    console.error("Dev stats error:", msg);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
