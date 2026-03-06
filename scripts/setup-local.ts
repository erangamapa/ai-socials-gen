/**
 * Local setup: run migrations and seed the database.
 * Requires: database running (e.g. `npx prisma dev` in another terminal).
 *
 * Run: npx tsx scripts/setup-local.ts
 * Or:  npm run setup:local
 */
import "dotenv/config";
import { execSync } from "child_process";
import * as path from "path";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL or DIRECT_DATABASE_URL in .env");
  process.exit(1);
}

console.log("Running local setup...\n");

try {
  console.log("1. Generating Prisma client...");
  execSync("npx prisma generate", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });

  console.log("\n2. Applying database migrations...");
  execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });

  console.log("\n3. Seeding database (templates, vault, rules)...");
  execSync("npm run db:seed", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });

  console.log("\n✓ Local setup complete.");
  console.log("\nNext: Start the app with:");
  console.log("  Terminal 1: npm run dev");
  console.log("  Terminal 2: npm run inngest:dev");
  console.log("\nThen open http://localhost:3000");
} catch (e) {
  console.error("\nSetup failed. Make sure:");
  console.error("  - Database is running (run 'npx prisma dev' in another terminal)");
  console.error("  - .env has DATABASE_URL and DIRECT_DATABASE_URL");
  process.exit(1);
}
