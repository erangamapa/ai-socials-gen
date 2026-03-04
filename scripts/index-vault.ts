import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const VAULT_ROOT = path.resolve(__dirname, "../assets/vault");

interface VaultEntry {
  id: string;
  type: string;
  pathOrUrl: string;
  tags: string[];
  channelHints: string[];
  notes: string;
}

const FOLDER_TYPE_MAP: Record<string, string> = {
  illustrations: "illustration",
  pictograms: "pictogram",
  backgrounds: "background",
  "previous-posts": "previous_post",
  fonts: "font",
};

const BRAND_SUBFOLDER_MAP: Record<string, string> = {
  logo: "brand_element",
  notch: "brand_element",
  brandmark: "brand_element",
};

function inferChannelHints(filename: string): string[] {
  const lower = filename.toLowerCase();
  const hints: string[] = [];
  if (lower.includes("twitter") || lower.includes("tw")) hints.push("twitter");
  if (lower.includes("ig") || lower.includes("instagram")) {
    if (lower.includes("story")) {
      hints.push("ig_story");
    } else if (lower.includes("feed")) {
      hints.push("ig_feed");
    } else {
      hints.push("ig_feed");
    }
  }
  if (lower.includes("email") || lower.includes("header")) hints.push("email_header");
  if (hints.length === 0) hints.push("twitter", "ig_feed", "ig_story", "email_header");
  return hints;
}

function inferTags(filename: string, folder: string, subfolder?: string): string[] {
  const tags: string[] = [];

  tags.push(folder.replace(/-/g, "_"));
  if (subfolder) tags.push(subfolder);

  const base = path.basename(filename, path.extname(filename));
  const tokens = base
    .replace(/[=@_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !["new", "png", "svg", "3x"].includes(t));

  for (const token of tokens) {
    if (!tags.includes(token)) tags.push(token);
  }

  const lower = filename.toLowerCase();
  if (lower.includes("slide")) tags.push("slide");
  if (lower.includes("glow")) tags.push("glow", "effect");
  if (lower.includes("slot")) tags.push("casino", "slots");
  if (lower.includes("perspective")) tags.push("3d", "perspective");
  if (lower.includes("framing")) tags.push("framing", "composition");
  if (lower.includes("notch")) tags.push("notch", "overlay");
  if (lower.includes("logo") || lower.includes("brandmark")) tags.push("branding");
  if (lower.includes("core")) tags.push("primary");
  if (lower.includes("expressive")) tags.push("expressive", "dynamic");
  if (lower.includes("stacked")) tags.push("stacked", "vertical");

  // Pictogram-specific enrichment
  if (folder === "pictograms") {
    tags.push("3d_icon", "isometric", "cb_purple");
    if (lower.includes("sports") || lower.includes("mma") || lower.includes("soccer") || lower.includes("tennis") || lower.includes("basketball") || lower.includes("football") || lower.includes("baseball")) tags.push("sports");
    if (lower.includes("casino") || lower.includes("dice") || lower.includes("card") || lower.includes("chip") || lower.includes("roulette")) tags.push("casino");
    if (lower.includes("slot")) tags.push("slots", "casino");
    if (lower.includes("crypto") || lower.includes("bitcoin") || lower.includes("coin")) tags.push("crypto", "blockchain");
    if (lower.includes("vip")) tags.push("vip", "premium", "exclusive");
    if (lower.includes("utility") || lower.includes("calendar") || lower.includes("shield") || lower.includes("trophy")) tags.push("utility");
    if (lower.includes("gaming") || lower.includes("esports") || lower.includes("controller")) tags.push("esports", "gaming");
    if (lower.includes("mma") || lower.includes("boxing") || lower.includes("glove")) tags.push("combat", "mma");
    if (lower.includes("cash") || lower.includes("money") || lower.includes("drop")) tags.push("promotion", "bonus");
    if (lower.includes("vip") || lower.includes("chips-cb")) tags.push("cb_branded");
  }

  return [...new Set(tags)];
}

const PICTOGRAM_CONCEPT_MAP: Record<string, string> = {
  "dice": "Pair of purple 3D dice in isometric view — gambling/casino symbol",
  "dice-1": "Single purple 3D die showing a face — casino/chance symbol",
  "dice-2": "Purple 3D dice pair variant — rolling/luck symbol",
  "calendar": "Purple 3D spiral-bound calendar — events/scheduling symbol",
  "calendar-1": "Calendar variant 1 — date/event symbol",
  "calendar-2": "Calendar variant 2 — schedule symbol",
  "card": "Playing card in 3D perspective — casino/poker symbol",
  "card-1": "Playing card variant 1 — ace/face card symbol",
  "card-2": "Playing card variant 2 — card game symbol",
  "card-3": "Playing card variant 3 — gambling card symbol",
  "cash-drop": "Dark purple 3D box/vault with glowing neon green stripe and dollar sign — cash prize symbol",
  "cash-drop-1": "Cash drop variant 1 — prize/reward symbol",
  "cash-drop-2": "Cash drop variant 2 — money/drop symbol",
  "cash-drop-3": "Cash drop variant 3 — cash prize symbol",
  "cash-drop-4": "Cash drop variant 4 — money box symbol",
  "cash-drop-5": "Cash drop variant 5 — reward symbol",
  "cash-drop-6": "Cash drop variant 6 — cash drop symbol",
  "cash-drop-7": "Cash drop variant 7 — prize box symbol",
  "chips-bitcoin": "3D casino chip with Bitcoin symbol — crypto/bitcoin gambling chip",
  "chips-bitcoin-1": "Bitcoin chip variant 1",
  "chips-bitcoin-2": "Bitcoin chip variant 2",
  "chips-cb": "Purple 3D casino chip with CB brandmark (||||) — official CB chip",
  "chips-cb-1": "CB chip variant 1",
  "chips-dollar": "3D casino chip with dollar symbol — dollar/fiat chip",
  "chips-dollar-1": "Dollar chip variant 1",
  "chips-dollar-2": "Dollar chip variant 2",
  "chips-stack": "Stack of 3D casino chips — high value/gambling symbol",
  "chips-stack-1": "Chip stack variant 1",
  "chips-stack-2": "Chip stack variant 2",
  "chips-stack-3": "Chip stack variant 3",
  "chips-stack-4": "Chip stack variant 4",
  "competitions": "Trophy/competition symbol — tournament/contest",
  "competitions-1": "Competition variant 1 — tournament symbol",
  "country": "Globe/flag symbol — country/region",
  "country-1": "Country variant 1 — geo symbol",
  "crypto": "Dark navy 3D coin with CB blue stripe design — crypto/blockchain symbol",
  "crypto-1": "Crypto coin variant 1",
  "crypto-2": "Crypto coin variant 2",
  "crypto-3": "Crypto coin variant 3",
  "crypto-4": "Crypto coin variant 4",
  "magnet": "3D magnet symbol — attract/pull/bonus",
  "mma": "Red 3D boxing gloves hanging — MMA/boxing/combat sports symbol",
  "mma-1": "MMA/boxing variant 1",
  "mma-2": "MMA/boxing variant 2",
  "mma-3": "MMA/boxing variant 3",
  "mma-4": "MMA/boxing variant 4",
  "mma-5": "MMA/boxing variant 5",
  "slots": "Purple 3D slot machine with 777 and red siren — casino slots symbol",
  "slots-1": "Slot machine variant 1",
  "slots-2": "Slot machine variant 2",
  "sports": "Sports equipment collection — general sports symbol",
  "sports-1": "3D baseball — white sphere with red stitching, isometric view",
  "sports-2": "Sports variant 2 — sports equipment icon",
  "sports-3": "Sports variant 3 — sports equipment icon",
  "sports-4": "Sports variant 4 — sports equipment icon",
  "sports-5": "Sports variant 5 — sports equipment icon",
  "sports-6": "Sports variant 6 — sports equipment icon",
  "sports-7": "Sports variant 7 — sports equipment icon",
  "sports-8": "Sports variant 8 — sports equipment icon",
  "sports-9": "Sports variant 9 — sports equipment icon",
  "sports-10": "Sports variant 10 — sports equipment icon",
  "sports-11": "Sports variant 11 — sports equipment icon",
  "sports-12": "Sports variant 12 — sports equipment icon",
  "sports-13": "Sports variant 13 — sports equipment icon",
  "sports-14": "Sports variant 14 — sports equipment icon",
  "sports-15": "Sports variant 15 — sports equipment icon",
  "sports-16": "Sports variant 16 — sports equipment icon",
  "sports-17": "Sports variant 17 — sports equipment icon",
  "sports-18": "Sports variant 18 — sports equipment icon",
  "utility": "Purple 3D browser/UI screen in isometric view — utility/app symbol",
  "utility-1": "Utility variant 1 — functional/UI symbol",
  "utility-2": "Utility variant 2 — functional symbol",
  "utility-3": "Utility variant 3 — utility icon",
  "utility-4": "Utility variant 4 — utility icon",
  "utility-5": "Utility variant 5 — utility icon",
  "utility-6": "Utility variant 6 — utility icon",
  "utility-7": "Utility variant 7 — utility icon",
  "utility-8": "Utility variant 8 — utility icon",
  "utility-9": "Utility variant 9 — utility icon",
  "utility-10": "Utility variant 10 — utility icon",
  "utility-11": "Utility variant 11 — large/detailed utility icon",
  "vip": "Black and gold 3D VIP casino chip with 'VIP' text — exclusive/premium symbol",
  "vip-1": "VIP variant 1 — premium/exclusive symbol",
  "vip-2": "VIP variant 2 — VIP symbol",
  "vip-3": "VIP variant 3 — VIP symbol",
  "gaming": "Gaming/esports controller symbol — video games",
  "gaming-1": "Gaming variant 1 — esports symbol",
  "gaming-2": "Gaming variant 2 — gaming symbol",
  "gaming-3": "Gaming variant 3 — gaming symbol",
  "others": "Miscellaneous symbol — other category",
  "others-1": "Others variant 1",
  "others-2": "Others variant 2",
  "others-3": "Others variant 3",
  "others-4": "Others variant 4",
  "others-5": "Others variant 5",
  "others-6": "Others variant 6",
  "others-7": "Others variant 7",
  "others-8": "Others variant 8",
  "others-9": "Others variant 9",
  "others-10": "Others variant 10",
  "others-11": "Others variant 11",
  "others-12": "Others variant 12",
  "others-13": "Others variant 13",
};

function generateNotes(filename: string, type: string, subfolder?: string): string {
  const base = path.basename(filename, path.extname(filename));
  const ext = path.extname(filename).slice(1).toUpperCase();
  const subLabel = subfolder ? ` (${subfolder})` : "";

  if (type === "pictogram") {
    const key = base.toLowerCase();
    const concept = PICTOGRAM_CONCEPT_MAP[key];
    if (concept) {
      return `CB 3D pictogram icon [${ext}]: ${concept}. Style: 3D isometric, CB purple gradient, soft shadow, transparent background, premium game-asset quality.`;
    }
    const humanName = base.replace(/-/g, " ");
    return `CB 3D pictogram icon [${ext}]: ${humanName} — 3D isometric style, CB purple gradient fills, soft highlights and shadows, transparent background, ready for compositing.`;
  }

  return `${type}${subLabel}: ${base} [${ext}]`;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function scanVault(): VaultEntry[] {
  const entries: VaultEntry[] = [];

  const topFolders = fs.readdirSync(VAULT_ROOT, { withFileTypes: true });

  for (const dir of topFolders) {
    if (!dir.isDirectory()) continue;

    const folderPath = path.join(VAULT_ROOT, dir.name);

    if (dir.name === "templates") {
      const channelFolders = fs.readdirSync(folderPath, { withFileTypes: true });
      for (const chDir of channelFolders) {
        if (!chDir.isDirectory()) continue;
        const channel = chDir.name;
        const chPath = path.join(folderPath, channel);
        const files = fs.readdirSync(chPath).filter((f) => !f.startsWith("."));
        for (const file of files) {
          const relPath = `assets/vault/templates/${channel}/${file}`;
          const id = `vault-template-${channel}-${slugify(path.basename(file, path.extname(file)))}`;
          const nameTags = path.basename(file, path.extname(file))
            .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
            .filter((t) => t.length > 1);
          entries.push({
            id,
            type: "template",
            pathOrUrl: relPath,
            tags: ["template", channel, ...nameTags],
            channelHints: [channel],
            notes: `Template for ${channel}: ${path.basename(file, path.extname(file))}`,
          });
        }
      }
      continue;
    }

    if (dir.name === "brand-elements") {
      const subfolders = fs.readdirSync(folderPath, { withFileTypes: true });
      for (const sub of subfolders) {
        if (!sub.isDirectory()) continue;
        const subPath = path.join(folderPath, sub.name);
        const files = fs.readdirSync(subPath).filter((f) => !f.startsWith("."));
        for (const file of files) {
          const relPath = `assets/vault/brand-elements/${sub.name}/${file}`;
          const id = `vault-brand-${sub.name}-${slugify(path.basename(file, path.extname(file)))}`;
          entries.push({
            id,
            type: "brand_element",
            pathOrUrl: relPath,
            tags: inferTags(file, "brand-elements", sub.name),
            channelHints: ["twitter", "ig_feed", "ig_story", "email_header"],
            notes: generateNotes(file, "brand_element", sub.name),
          });
        }
      }
      continue;
    }

    const type = FOLDER_TYPE_MAP[dir.name];
    if (!type) continue;

    const files = fs.readdirSync(folderPath).filter((f) => !f.startsWith("."));
    for (const file of files) {
      const relPath = `assets/vault/${dir.name}/${file}`;
      const id = `vault-${slugify(dir.name)}-${slugify(path.basename(file, path.extname(file)))}`;
      entries.push({
        id,
        type,
        pathOrUrl: relPath,
        tags: inferTags(file, dir.name),
        channelHints: inferChannelHints(file),
        notes: generateNotes(file, type),
      });
    }
  }

  return entries;
}

async function main() {
  console.log("Scanning vault...");
  const entries = scanVault();

  const stats: Record<string, number> = {};
  for (const e of entries) {
    stats[e.type] = (stats[e.type] || 0) + 1;
  }
  console.log("\nVault inventory:");
  for (const [type, count] of Object.entries(stats).sort()) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`  TOTAL: ${entries.length}`);

  console.log("\nWriting index.json...");
  const indexPath = path.join(VAULT_ROOT, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(entries, null, 2));
  console.log(`  Written ${entries.length} entries to ${indexPath}`);

  const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (dbUrl) {
    console.log("\nSeeding database...");
    const pool = new pg.Pool({ connectionString: dbUrl });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
      for (const item of entries) {
        await prisma.assetVaultItem.upsert({
          where: { id: item.id },
          update: {
            type: item.type,
            pathOrUrl: item.pathOrUrl,
            tags: item.tags,
            channelHints: item.channelHints,
            notes: item.notes,
          },
          create: {
            id: item.id,
            type: item.type,
            pathOrUrl: item.pathOrUrl,
            tags: item.tags,
            channelHints: item.channelHints,
            notes: item.notes,
          },
        });
      }
      console.log(`  Upserted ${entries.length} items into AssetVaultItem table`);
    } finally {
      await prisma.$disconnect();
    }
  } else {
    console.log("\nNo DATABASE_URL found — skipping DB seed (index.json still written)");
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
