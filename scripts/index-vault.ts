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

  return [...new Set(tags)];
}

function generateNotes(filename: string, type: string, subfolder?: string): string {
  const base = path.basename(filename, path.extname(filename));
  const ext = path.extname(filename).slice(1).toUpperCase();
  const subLabel = subfolder ? ` (${subfolder})` : "";
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
