/**
 * Upload local public/uploads assets to Vercel Blob and update DB URLs.
 *
 * Run: BLOB_READ_WRITE_TOKEN=xxx DIRECT_DATABASE_URL=xxx npx tsx scripts/upload-assets-to-blob.ts
 *
 * Requires:
 *   - BLOB_READ_WRITE_TOKEN (from Vercel Blob store)
 *   - DIRECT_DATABASE_URL or DATABASE_URL
 *
 * What it does:
 *   1. Walks public/uploads/ and uploads each file to Vercel Blob
 *   2. Builds map: /uploads/path → blob URL
 *   3. Updates Artifact.url, AssetVaultItem.pathOrUrl, Job.subjectReferenceUrl, Job.subjectReferences, Job.angleReference, Job.retrievalBundle
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";
import { put } from "@vercel/blob";

// Some env files (e.g. .env.vercel) have literal \n at end of values — strip it
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim().replace(/\\n$/, "");
const connectionString = (process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL)
  ?.trim()
  ?.replace(/\\n$/, "");

if (!BLOB_TOKEN) {
  console.error("Set BLOB_READ_WRITE_TOKEN (from Vercel Blob store)");
  process.exit(1);
}
if (!connectionString) {
  console.error("Set DIRECT_DATABASE_URL or DATABASE_URL");
  process.exit(1);
}

const UPLOADS_DIR = path.resolve(process.cwd(), "public/uploads");

function* walkDir(dir: string, base = ""): Generator<{ relPath: string; fullPath: string }> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkDir(full, rel);
    } else {
      yield { relPath: rel, fullPath: full };
    }
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".json": "application/json",
  };
  return map[ext] || "application/octet-stream";
}

async function main() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.error("public/uploads not found");
    process.exit(1);
  }

  const pathToBlobUrl = new Map<string, string>();
  let uploaded = 0;
  let skipped = 0;

  console.log("Uploading files from public/uploads to Vercel Blob...\n");

  for (const { relPath, fullPath } of walkDir(UPLOADS_DIR)) {
    const dbPath = `/uploads/${relPath}`;
    const buffer = fs.readFileSync(fullPath);
    const mimeType = getMimeType(fullPath);

    try {
      const blob = await put(relPath, buffer, {
        access: "public",
        contentType: mimeType,
        token: BLOB_TOKEN,
        allowOverwrite: true,
      });
      pathToBlobUrl.set(dbPath, blob.url);
      uploaded++;
      if (uploaded % 20 === 0) console.log(`  Uploaded ${uploaded}...`);
    } catch (e) {
      console.warn(`  Skip ${relPath}:`, (e as Error).message);
      skipped++;
    }
  }

  console.log(`\nUploaded ${uploaded} files, skipped ${skipped}.`);
  console.log(`Path map size: ${pathToBlobUrl.size}\n`);

  if (pathToBlobUrl.size === 0) {
    console.log("No files uploaded — nothing to update in DB.");
    return;
  }

  console.log("Connecting to database to update URLs...");
  const client = new pg.Client({ connectionString });
  await client.connect();

  // 1. Update Artifact.url
  const artifacts = await client.query<{ id: string; url: string }>(
    `SELECT id, url FROM "Artifact" WHERE url LIKE '/uploads/%'`
  );
  let artifactUpdates = 0;
  for (const row of artifacts.rows) {
    const newUrl = pathToBlobUrl.get(row.url);
    if (newUrl) {
      await client.query(`UPDATE "Artifact" SET url = $1 WHERE id = $2`, [newUrl, row.id]);
      artifactUpdates++;
    }
  }
  console.log(`Artifact: updated ${artifactUpdates} URLs`);

  // 2. Update AssetVaultItem.pathOrUrl
  const vaultItems = await client.query<{ id: string; pathOrUrl: string }>(
    `SELECT id, "pathOrUrl" FROM "AssetVaultItem" WHERE "pathOrUrl" LIKE '/uploads/%'`
  );
  let vaultUpdates = 0;
  for (const row of vaultItems.rows) {
    const newUrl = pathToBlobUrl.get(row.pathOrUrl);
    if (newUrl) {
      await client.query(`UPDATE "AssetVaultItem" SET "pathOrUrl" = $1 WHERE id = $2`, [
        newUrl,
        row.id,
      ]);
      vaultUpdates++;
    }
  }
  console.log(`AssetVaultItem: updated ${vaultUpdates} URLs`);

  // 3. Update Job.subjectReferenceUrl
  const jobsWithSubject = await client.query<{ id: string; subjectReferenceUrl: string }>(
    `SELECT id, "subjectReferenceUrl" FROM "Job" WHERE "subjectReferenceUrl" LIKE '/uploads/%'`
  );
  let jobSubjectUpdates = 0;
  for (const row of jobsWithSubject.rows) {
    const newUrl = pathToBlobUrl.get(row.subjectReferenceUrl);
    if (newUrl) {
      await client.query(`UPDATE "Job" SET "subjectReferenceUrl" = $1 WHERE id = $2`, [
        newUrl,
        row.id,
      ]);
      jobSubjectUpdates++;
    }
  }
  console.log(`Job.subjectReferenceUrl: updated ${jobSubjectUpdates} URLs`);

  // 4. Update Job.subjectReferences (JSON array of { url, note })
  const jobsWithRefs = await client.query<{ id: string; subjectReferences: unknown }>(
    `SELECT id, "subjectReferences" FROM "Job" WHERE "subjectReferences" IS NOT NULL`
  );
  let jobRefsUpdates = 0;
  for (const row of jobsWithRefs.rows) {
    const refs = row.subjectReferences as Array<{ url?: string; note?: string }> | null;
    if (!Array.isArray(refs)) continue;
    let changed = false;
    const updated = refs.map((r) => {
      const u = r.url && r.url.startsWith("/uploads/") ? pathToBlobUrl.get(r.url) : null;
      if (u) {
        changed = true;
        return { ...r, url: u };
      }
      return r;
    });
    if (changed) {
      await client.query(`UPDATE "Job" SET "subjectReferences" = $1 WHERE id = $2`, [
        JSON.stringify(updated),
        row.id,
      ]);
      jobRefsUpdates++;
    }
  }
  console.log(`Job.subjectReferences: updated ${jobRefsUpdates} rows`);

  // 5. Update Job.angleReference (JSON { url, note })
  const jobsWithAngle = await client.query<{ id: string; angleReference: unknown }>(
    `SELECT id, "angleReference" FROM "Job" WHERE "angleReference" IS NOT NULL`
  );
  let angleUpdates = 0;
  for (const row of jobsWithAngle.rows) {
    const ref = row.angleReference as { url?: string; note?: string } | null;
    if (!ref?.url || !ref.url.startsWith("/uploads/")) continue;
    const newUrl = pathToBlobUrl.get(ref.url);
    if (newUrl) {
      await client.query(`UPDATE "Job" SET "angleReference" = $1 WHERE id = $2`, [
        JSON.stringify({ ...ref, url: newUrl }),
        row.id,
      ]);
      angleUpdates++;
    }
  }
  console.log(`Job.angleReference: updated ${angleUpdates} URLs`);

  // 6. Update Job.retrievalBundle items that have pathOrUrl starting with /uploads/
  const jobsWithBundle = await client.query<{ id: string; retrievalBundle: unknown }>(
    `SELECT id, "retrievalBundle" FROM "Job" WHERE "retrievalBundle" IS NOT NULL`
  );
  let bundleUpdates = 0;
  for (const row of jobsWithBundle.rows) {
    const bundle = row.retrievalBundle as { items?: Array<{ pathOrUrl?: string }> } | null;
    if (!bundle?.items) continue;
    let changed = false;
    const updated = bundle.items.map((item) => {
      const p = item.pathOrUrl;
      if (p && p.startsWith("/uploads/")) {
        const u = pathToBlobUrl.get(p);
        if (u) {
          changed = true;
          return { ...item, pathOrUrl: u };
        }
      }
      return item;
    });
    if (changed) {
      await client.query(`UPDATE "Job" SET "retrievalBundle" = $1 WHERE id = $2`, [
        JSON.stringify({ ...bundle, items: updated }),
        row.id,
      ]);
      bundleUpdates++;
    }
  }
  console.log(`Job.retrievalBundle: updated ${bundleUpdates} rows`);

  await client.end();
  console.log("\nDone. Asset URLs migrated to Vercel Blob.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
