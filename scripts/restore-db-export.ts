/**
 * Restore data from db-export.sql (COPY blocks only).
 * Run: npx tsx scripts/restore-db-export.ts
 * Requires DIRECT_DATABASE_URL or DATABASE_URL.
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DIRECT_DATABASE_URL or DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

function extractCopyBlocks(content: string): Array<{ table: string; sql: string; data: string }> {
  const blocks: Array<{ table: string; sql: string; data: string }> = [];
  const copyRegex = /COPY public\."(\w+)" \([^)]+\) FROM stdin;\n([\s\S]*?)^\\\.$/gm;
  let m;
  while ((m = copyRegex.exec(content)) !== null) {
    blocks.push({ table: m[1], sql: m[0].split("\n")[0] + "\n", data: m[2] });
  }
  return blocks;
}

async function runCopy(client: pg.Client, copySql: string, data: string) {
  return new Promise<void>((resolve, reject) => {
    const stream = client.query(copyFrom(copySql));
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    stream.write(data, "utf8");
    stream.end();
  });
}

async function main() {
  const dumpPath = path.resolve(__dirname, "../db-export.sql");
  const content = fs.readFileSync(dumpPath, "utf-8");

  const blocks = extractCopyBlocks(content);
  // Only restore job-related data (templates/vault were just seeded; skip PromptRule/TemplateStats - may have dupes)
  const order = ["Job", "Variant", "Artifact", "Feedback"];
  const toRestore = order.filter((t) => blocks.some((b) => b.table === t));

  await client.connect();

  for (const table of toRestore) {
    const block = blocks.find((b) => b.table === table);
    if (!block) continue;
    try {
      const copyCmd = block.sql.trim();
      await runCopy(client, copyCmd, block.data);
      console.log(`  Restored ${table}`);
    } catch (e) {
      console.error(`  Error restoring ${table}:`, e);
    }
  }

  await client.end();
  console.log("Restore complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
