/**
 * Seed default illustration PromptRules.
 * Run once with: npx ts-node --project tsconfig.scripts.json scripts/seed-illustration-rules.ts
 * (or: npx tsx scripts/seed-illustration-rules.ts)
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { ILLUSTRATION_DEFAULT_RULES } from "../src/lib/ai/illustrationPrompts";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  console.log(`Seeding ${ILLUSTRATION_DEFAULT_RULES.length} illustration PromptRules...`);

  let created = 0;
  let skipped = 0;

  for (const rule of ILLUSTRATION_DEFAULT_RULES) {
    const existing = await prisma.promptRule.findFirst({
      where: { content: rule.content, mode: "illustration" },
    });

    if (existing) {
      console.log(`  SKIP (exists): ${rule.content.slice(0, 60)}...`);
      skipped++;
      continue;
    }

    await prisma.promptRule.create({
      data: {
        content: rule.content,
        category: rule.category,
        source: "default",
        enabled: true,
        priority: rule.priority,
        mode: "illustration",
      },
    });

    console.log(`  CREATED [${rule.category} p${rule.priority}]: ${rule.content.slice(0, 60)}...`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
