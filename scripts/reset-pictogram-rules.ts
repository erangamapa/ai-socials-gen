import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PICTOGRAM_DEFAULT_RULES } from "../src/lib/ai/pictogramPrompts";

const pool = new pg.Pool({ connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  // Delete all default/seeded pictogram rules to start fresh
  const deleted = await prisma.promptRule.deleteMany({
    where: { mode: "pictogram", source: { in: ["default", "seed"] } },
  });
  console.log(`Deleted ${deleted.count} old default pictogram rules`);

  // Seed fresh corrected rules
  let seeded = 0;
  for (const rule of PICTOGRAM_DEFAULT_RULES) {
    await prisma.promptRule.create({
      data: {
        content: rule.content,
        category: rule.category,
        priority: rule.priority,
        mode: "pictogram",
        enabled: true,
        source: "default",
        confidence: 70,
      },
    });
    seeded++;
  }
  console.log(`Seeded ${seeded} updated pictogram rules based on Claude vision analysis`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
