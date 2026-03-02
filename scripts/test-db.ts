import "dotenv/config";
import pg from "pg";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
console.log("Connecting to:", url.replace(/:[^:@]+@/, ":***@"));

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  console.log("Connected!");

  const res = await client.query('SELECT count(*) as cnt FROM "AssetVaultItem"');
  console.log("AssetVaultItem count:", res.rows[0].cnt);

  const res2 = await client.query('SELECT "analysisStatus", count(*) as cnt FROM "AssetVaultItem" GROUP BY "analysisStatus"');
  console.log("Analysis status:", res2.rows);

  await client.end();
  console.log("Done");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
