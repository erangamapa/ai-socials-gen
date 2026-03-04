import { VaultItem, VaultIndexSchema, VaultSearchParams, VaultSearchResult, EnrichedVaultItem } from "./types";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../db";

let cachedIndex: VaultItem[] | null = null;
let cachedAnalysis: Map<string, { subjects: string[]; description: string; styleNotes: string; usageScore: number }> | null = null;
let cachedGeneratedItems: VaultItem[] | null = null;
let generatedItemsCachedAt = 0;
const GENERATED_ITEMS_TTL_MS = 60_000;

export function loadVaultIndex(): VaultItem[] {
  if (cachedIndex) return cachedIndex;

  const indexPath = path.resolve(process.cwd(), "assets/vault/index.json");
  const raw = fs.readFileSync(indexPath, "utf-8");
  const parsed = JSON.parse(raw);
  cachedIndex = VaultIndexSchema.parse(parsed);
  return cachedIndex;
}

export function clearVaultCache(): void {
  cachedIndex = null;
  cachedAnalysis = null;
  cachedGeneratedItems = null;
  generatedItemsCachedAt = 0;
}

/** Load auto-ingested vault items (accepted illustrations/pictograms) from DB with TTL cache. */
async function loadGeneratedVaultItems(): Promise<VaultItem[]> {
  const now = Date.now();
  if (cachedGeneratedItems && now - generatedItemsCachedAt < GENERATED_ITEMS_TTL_MS) {
    return cachedGeneratedItems;
  }

  const rows = await prisma.assetVaultItem.findMany({
    where: { id: { startsWith: "vault-gen-" } },
    select: { id: true, type: true, pathOrUrl: true, tags: true, channelHints: true, notes: true },
  });

  cachedGeneratedItems = rows.map((row) => ({
    id: row.id,
    type: row.type as VaultItem["type"],
    pathOrUrl: row.pathOrUrl,
    tags: row.tags,
    channelHints: row.channelHints,
    notes: row.notes ?? undefined,
  }));
  generatedItemsCachedAt = now;
  return cachedGeneratedItems;
}

async function loadAnalysisCache(): Promise<Map<string, { subjects: string[]; description: string; styleNotes: string; usageScore: number }>> {
  if (cachedAnalysis) return cachedAnalysis;

  const rows = await prisma.assetVaultItem.findMany({
    select: { id: true, analysis: true, analysisStatus: true, usageScore: true },
  });

  cachedAnalysis = new Map();
  for (const row of rows) {
    const a = row.analysis as Record<string, unknown> | null;
    const hasDoneAnalysis = row.analysisStatus === "done" && a;
    cachedAnalysis.set(row.id, {
      subjects: hasDoneAnalysis && Array.isArray(a.subjects) ? (a.subjects as string[]).map((s) => s.toLowerCase()) : [],
      description: hasDoneAnalysis && typeof a.description === "string" ? a.description.toLowerCase() : "",
      styleNotes: hasDoneAnalysis && typeof a.styleNotes === "string" ? a.styleNotes.toLowerCase() : "",
      usageScore: row.usageScore ?? 0,
    });
  }
  return cachedAnalysis;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

const SPORT_SYNONYMS: Record<string, string[]> = {
  football: ["soccer", "football player", "striker", "goalkeeper", "midfielder"],
  soccer: ["football", "football player", "striker", "goalkeeper"],
  basketball: ["basketball player", "nba", "dunk", "court"],
  nba: ["basketball", "basketball player"],
  tennis: ["tennis player", "racket", "court"],
  baseball: ["baseball player", "batter", "pitcher"],
  hockey: ["hockey player", "goaltender", "ice hockey", "puck"],
  boxing: ["boxer", "fighter", "boxing ring"],
  mma: ["fighter", "martial arts", "ufc"],
  cricket: ["cricket player", "batsman", "bowler"],
  dota: ["esports", "gaming", "moba"],
  csgo: ["counter-strike", "esports", "fps", "gaming"],
  "counter-strike": ["csgo", "esports", "fps"],
  esports: ["gaming", "dota", "csgo", "counter-strike"],
  fifa: ["football", "soccer", "football player"],
  "champions league": ["football", "soccer", "football player", "champions"],
  "premier league": ["football", "soccer", "football player"],
};

function expandQuery(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  const fullQuery = tokens.join(" ");

  for (const [key, synonyms] of Object.entries(SPORT_SYNONYMS)) {
    if (fullQuery.includes(key) || tokens.some((t) => t === key)) {
      for (const s of synonyms) expanded.add(s);
    }
  }
  return [...expanded];
}

function scoreItem(
  item: VaultItem,
  queryTokens: string[],
  expandedTokens: string[],
  params: VaultSearchParams,
  analysisData?: { subjects: string[]; description: string; styleNotes: string; usageScore: number },
): number {
  let score = 0;

  const tagSet = new Set(item.tags.map((t) => t.toLowerCase()));
  const notesTokens = item.notes ? tokenize(item.notes) : [];

  for (const qt of queryTokens) {
    for (const tag of tagSet) {
      if (tag === qt) score += 3;
      else if (tag.includes(qt) || qt.includes(tag)) score += 1;
    }
    for (const nt of notesTokens) {
      if (nt === qt) score += 1;
    }
  }

  if (analysisData) {
    for (const qt of expandedTokens) {
      for (const subject of analysisData.subjects) {
        if (subject === qt) score += 5;
        else if (subject.includes(qt) || qt.includes(subject)) score += 3;
      }

      if (analysisData.description.includes(qt)) score += 2;
      if (analysisData.styleNotes.includes(qt)) score += 1;
    }

    // usageScore bonus: accepted references rank higher; rejected ones rank lower
    // Cap the influence to ±5 to avoid stale data dominating fresh signals
    const usageBonus = Math.min(Math.max(analysisData.usageScore, -5), 5);
    score += usageBonus;
  }

  if (params.visualType) {
    const typeMap: Record<string, string> = {
      "background-only": "previous_post",
      illustration: "illustration",
      pictogram: "pictogram",
    };
    if (item.type === typeMap[params.visualType]) score += 2;
  }

  if (params.channels?.length) {
    const overlap = item.channelHints.filter((ch) => params.channels!.includes(ch));
    score += overlap.length;
  }

  return score;
}

export interface SplitVaultResult {
  templates: VaultItem[];
  illustrations: VaultItem[];
  otherRefs: VaultItem[];
  totalMatched: number;
}

export async function searchVaultSplit(params: VaultSearchParams): Promise<SplitVaultResult> {
  const seedItems = loadVaultIndex();
  const generatedItems = await loadGeneratedVaultItems();
  // Merge: generated items supplement seed items (seed takes precedence if same id)
  const seedIds = new Set(seedItems.map((i) => i.id));
  const index = [...seedItems, ...generatedItems.filter((g) => !seedIds.has(g.id))];

  const analysisMap = await loadAnalysisCache();
  const queryTokens = tokenize(params.query);
  const expandedTokens = expandQuery(queryTokens);

  const templates = index.filter((i) => i.type === "template");
  const nonTemplates = index.filter((i) => i.type !== "template");

  const scoredTemplates = templates
    .map((item) => ({ item, score: scoreItem(item, queryTokens, expandedTokens, params, analysisMap.get(item.id)) }))
    .sort((a, b) => b.score - a.score);

  const channelTemplates = params.channels?.length
    ? scoredTemplates.filter(({ item }) => item.channelHints.some((ch) => params.channels!.includes(ch)))
    : scoredTemplates;

  const topTemplates = (channelTemplates.length > 0 ? channelTemplates : scoredTemplates).slice(0, 4).map(({ item }) => item);

  const scoredOther = nonTemplates
    .map((item) => ({ item, score: scoreItem(item, queryTokens, expandedTokens, params, analysisMap.get(item.id)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const illustrations = scoredOther
    .filter(({ item }) => item.type === "illustration")
    .slice(0, 8)
    .map(({ item }) => item);

  const others = scoredOther
    .filter(({ item }) => item.type !== "illustration")
    .slice(0, 4)
    .map(({ item }) => item);

  return {
    templates: topTemplates,
    illustrations,
    otherRefs: others,
    totalMatched: scoredTemplates.length + scoredOther.length,
  };
}

export async function searchVault(params: VaultSearchParams): Promise<VaultSearchResult> {
  const seedItems = loadVaultIndex();
  const generatedItems = await loadGeneratedVaultItems();
  const seedIds = new Set(seedItems.map((i) => i.id));
  const index = [...seedItems, ...generatedItems.filter((g) => !seedIds.has(g.id))];

  const analysisMap = await loadAnalysisCache();
  const queryTokens = tokenize(params.query);
  const expandedTokens = expandQuery(queryTokens);
  const limit = params.limit ?? 10;

  const scored = index
    .map((item) => ({ item, score: scoreItem(item, queryTokens, expandedTokens, params, analysisMap.get(item.id)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    items: scored.slice(0, limit).map(({ item }) => item),
    totalMatched: scored.length,
  };
}

export async function enrichWithAnalysis(items: VaultItem[]): Promise<EnrichedVaultItem[]> {
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id);
  const dbItems = await prisma.assetVaultItem.findMany({
    where: { id: { in: ids }, analysisStatus: "done" },
    select: { id: true, analysis: true },
  });

  const analysisMap = new Map<string, unknown>();
  for (const row of dbItems) {
    if (row.analysis) analysisMap.set(row.id, row.analysis);
  }

  return items.map((item) => ({
    ...item,
    analysis: (analysisMap.get(item.id) as EnrichedVaultItem["analysis"]) ?? null,
  }));
}
