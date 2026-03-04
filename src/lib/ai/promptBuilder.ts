import { prisma } from "../db";
import * as crypto from "crypto";

const PRIORITY_RULES_CAP = 5;  // manual/seeded high-priority rules always included
const FEEDBACK_RULES_CAP = 10; // confidence-ranked feedback rules fill the rest

interface RulesBlock {
  text: string;
  version: number;
  ruleCount: number;
  estimatedTokens: number;
  ruleIds: string[];
}

export async function buildRulesBlock(mode: string = "socials"): Promise<RulesBlock> {
  // Tier 1: top priority rules (manual/seeded) — always included up to cap
  const priorityRules = await prisma.promptRule.findMany({
    where: { enabled: true, mode, priority: { gte: 4 } },
    orderBy: [{ priority: "desc" }, { confidence: "desc" }, { createdAt: "desc" }],
    take: PRIORITY_RULES_CAP,
  });

  const priorityIds = new Set(priorityRules.map((r) => r.id));

  // Tier 2: remaining confidence-ranked feedback rules
  const feedbackRules = await prisma.promptRule.findMany({
    where: { enabled: true, mode, id: { notIn: [...priorityIds] } },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    take: FEEDBACK_RULES_CAP,
  });

  const rules = [...priorityRules, ...feedbackRules];

  if (rules.length > 0) {
    await prisma.promptRule.updateMany({
      where: { id: { in: rules.map((r) => r.id) } },
      data: { lastUsedAt: new Date() },
    });
  }

  if (rules.length === 0) {
    return { text: "", version: 0, ruleCount: 0, estimatedTokens: 0, ruleIds: [] };
  }

  const doRules = rules.filter((r) => r.category === "do" || r.category === "style" || r.category === "positive");
  const dontRules = rules.filter((r) => r.category === "dont" || r.category === "color" || r.category === "composition" || r.category === "typography");
  const generalRules = rules.filter((r) => r.category === "general");

  const sections: string[] = [];

  if (doRules.length > 0) {
    sections.push("DO:\n" + doRules.map((r) => `  - ${r.content}`).join("\n"));
  }
  if (dontRules.length > 0) {
    sections.push("DON'T:\n" + dontRules.map((r) => `  - ${r.content}`).join("\n"));
  }
  if (generalRules.length > 0) {
    sections.push("RULES:\n" + generalRules.map((r) => `  - ${r.content}`).join("\n"));
  }

  const recentRejects = await prisma.feedback.findMany({
    where: {
      decision: "reject",
      variant: { job: { mode } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { reasons: true, notes: true },
  });

  if (recentRejects.length > 0) {
    const rejectPatterns = recentRejects
      .map((f) => {
        const parts = [...f.reasons];
        if (f.notes) parts.push(f.notes);
        return parts.join(", ");
      })
      .filter(Boolean);

    if (rejectPatterns.length > 0) {
      sections.push("RECENT REJECTIONS (avoid these patterns):\n" + rejectPatterns.map((p) => `  - ${p}`).join("\n"));
    }
  }

  const recentAccepts = await prisma.feedback.findMany({
    where: {
      decision: "accept",
      variant: { job: { mode } },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { variant: { select: { plannerSpec: true } } },
  });

  if (recentAccepts.length > 0) {
    const acceptSummaries = recentAccepts
      .map((f) => {
        const spec = f.variant?.plannerSpec as Record<string, unknown> | null;
        if (!spec) return null;
        const art = spec.artDirection as Record<string, string> | undefined;
        return art?.mood || art?.style || null;
      })
      .filter(Boolean);

    if (acceptSummaries.length > 0) {
      sections.push("RECENTLY ACCEPTED STYLES (lean towards these):\n" + acceptSummaries.map((s) => `  - ${s}`).join("\n"));
    }
  }

  const text = sections.length > 0
    ? `\nLEARNED RULES & FEEDBACK (${rules.length} active rules):\n${sections.join("\n\n")}`
    : "";

  const hash = crypto.createHash("md5").update(text).digest("hex");
  // Use a 32-bit signed-safe integer for version to satisfy Postgres Int constraints
  const rawVersion = parseInt(hash.slice(0, 8), 16);
  const INT32_MAX = 2147483647;
  const version = rawVersion % INT32_MAX;
  const estimatedTokens = Math.ceil(text.length / 4);

  return { text, version, ruleCount: rules.length, estimatedTokens, ruleIds: rules.map((r) => r.id) };
}

const REASON_TO_RULE: Record<string, { content: string; category: string }> = {
  // ── Socials reasons ──
  "Off-brand palette": { content: "Avoid off-brand color combinations; use only official CB palette hex values", category: "dont" },
  "Too busy / low clarity": { content: "Keep compositions clean with clear visual hierarchy; avoid visual clutter", category: "dont" },
  "Wrong vibe": { content: "Match the energy and mood to the brief; avoid generic or mismatched tones", category: "general" },
  "Poor composition": { content: "Ensure balanced composition with clear focal point and proper element spacing", category: "composition" },
  "Not enough text-safe area": { content: "Reserve generous text-safe areas; graphic elements must not crowd text zones", category: "composition" },
  "Typography issues": { content: "Follow typography rules strictly: Midnight Sans Heavy ALL CAPS for headlines, Inter for body", category: "typography" },
  "Bad subject quality": { content: "Generate high-quality, detailed graphic elements; avoid low-fidelity or blurry subjects", category: "style" },
  "Wrong channel sizing": { content: "Ensure elements are properly sized and positioned for the target channel dimensions", category: "composition" },

  // ── Illustration reasons ──
  "Wrong style / not flat-vector": { content: "Strictly maintain flat-vector art style with clean bold lines, solid color fills, and no photorealistic rendering", category: "style" },
  "Poor anatomy / proportions": { content: "Ensure anatomically correct proportions with natural body positioning; avoid distorted or awkward limb placement", category: "style" },
  "Wrong pose / energy": { content: "Match pose energy to the brief — dynamic, powerful, sport-specific; avoid static or low-energy poses", category: "style" },
  "Background issues": { content: "Keep background as solid colour only — no gradients, no patterns, no textures, no environment details", category: "composition" },

  // ── Pictogram reasons ──
  "Wrong style / not flat-vector toon": { content: "Strictly maintain flat-vector toon style: clean geometric shapes from a slight 3D perspective angle, hard-edged cel-shading (2-3 flat tone planes per surface), NOT smooth gradients, NOT volumetric CGI, NOT photorealism", category: "style" },
  "Poor shape clarity": { content: "Ensure the icon concept is immediately recognisable at small sizes — clear silhouette, no ambiguity", category: "composition" },
  "Wrong scale / proportions": { content: "Icon must occupy 65-75% of canvas with generous breathing room on all sides; avoid cramped or oversized icons", category: "composition" },
};

export function reasonToRule(reason: string): { content: string; category: string } | null {
  return REASON_TO_RULE[reason] || null;
}

const DECAY_STALE_DAYS = 14;
const DECAY_MIN_CONFIDENCE = 20;
const DECAY_MIN_HITS_FOR_RATE_CHECK = 5;
const DECAY_MIN_SUCCESS_RATE = 0.2;

/**
 * Auto-disable rules that are stale, ineffective, or low-confidence.
 * Returns the IDs of rules that were decayed.
 */
export async function decayRules(): Promise<string[]> {
  const staleDate = new Date(Date.now() - DECAY_STALE_DAYS * 24 * 60 * 60 * 1000);

  const staleRules = await prisma.promptRule.findMany({
    where: {
      enabled: true,
      source: { not: "manual" },
      OR: [
        { lastUsedAt: { lt: staleDate } },
        { confidence: { lt: DECAY_MIN_CONFIDENCE } },
      ],
    },
    select: { id: true, content: true, confidence: true, lastUsedAt: true },
  });

  const ineffectiveRules = await prisma.promptRule.findMany({
    where: {
      enabled: true,
      source: { not: "manual" },
      hitCount: { gte: DECAY_MIN_HITS_FOR_RATE_CHECK },
    },
    select: { id: true, content: true, hitCount: true, successCount: true },
  });

  const ineffectiveIds = ineffectiveRules
    .filter((r) => r.successCount / r.hitCount < DECAY_MIN_SUCCESS_RATE)
    .map((r) => r.id);

  const allIds = [...new Set([...staleRules.map((r) => r.id), ...ineffectiveIds])];

  if (allIds.length === 0) return [];

  await prisma.promptRule.updateMany({
    where: { id: { in: allIds } },
    data: { enabled: false },
  });

  console.log(`[RuleDecay] Disabled ${allIds.length} rules: ${allIds.join(", ")}`);
  return allIds;
}
