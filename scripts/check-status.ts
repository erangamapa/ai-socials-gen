import "dotenv/config";
import pg from "pg";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  const res = await client.query('SELECT "analysisStatus", count(*) as cnt FROM "AssetVaultItem" GROUP BY "analysisStatus"');
  console.log("Analysis status:");
  for (const row of res.rows) {
    console.log(`  ${row.analysisStatus}: ${row.cnt}`);
  }
  const total = await client.query('SELECT count(*) as cnt FROM "AssetVaultItem"');
  console.log(`Total: ${total.rows[0].cnt}`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
