/**
 * Production setup: run migrations and seed the database.
 * Requires: DATABASE_URL and DIRECT_DATABASE_URL set (e.g. Neon connection string).
 *
 * Run: DIRECT_DATABASE_URL=xxx DATABASE_URL=xxx npx tsx scripts/setup-prod.ts
 * Or:  vercel env pull && npm run setup:prod
 */
import "dotenv/config";
import { execSync } from "child_process";
import * as path from "path";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL or DIRECT_DATABASE_URL");
  process.exit(1);
}

console.log("Running production setup...\n");

try {
  console.log("1. Generating Prisma client...");
  execSync("npx prisma generate", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });

  console.log("\n2. Applying database migrations...");
  execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });

  console.log("\n3. Seeding database (templates, vault, rules)...");
  execSync("npm run db:seed", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });

  console.log("\n✓ Production setup complete.");
} catch (e) {
  console.error("\nSetup failed.");
  process.exit(1);
}
