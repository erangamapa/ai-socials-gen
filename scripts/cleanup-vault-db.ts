import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();

  const allRows = await client.query('SELECT id, "pathOrUrl", "analysisStatus" FROM "AssetVaultItem" ORDER BY id');
  console.log(`Total DB entries: ${allRows.rows.length}`);

  let removed = 0;
  let reset = 0;

  for (const row of allRows.rows) {
    const fullPath = path.resolve(process.cwd(), row.pathOrUrl);
    if (!fs.existsSync(fullPath)) {
      await client.query('DELETE FROM "AssetVaultItem" WHERE id = $1', [row.id]);
      console.log(`  DELETED (file missing): ${row.id} -> ${row.pathOrUrl}`);
      removed++;
    } else if (row.analysisStatus === "failed") {
      await client.query('UPDATE "AssetVaultItem" SET "analysisStatus" = $1 WHERE id = $2', ["pending", row.id]);
      console.log(`  RESET: ${row.id}`);
      reset++;
    }
  }

  const remaining = await client.query('SELECT count(*) as cnt FROM "AssetVaultItem"');
  const pending = await client.query('SELECT count(*) as cnt FROM "AssetVaultItem" WHERE "analysisStatus" = $1', ["pending"]);

  console.log(`\nRemoved ${removed} phantom entries, reset ${reset} failed entries`);
  console.log(`Remaining: ${remaining.rows[0].cnt} entries, ${pending.rows[0].cnt} pending analysis`);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
