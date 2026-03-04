import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const total = await prisma.assetVaultItem.count({ where: { type: "pictogram" } });
  const done = await prisma.assetVaultItem.count({ where: { type: "pictogram", analysisStatus: "done" } });
  const pending = await prisma.assetVaultItem.count({ where: { type: "pictogram", analysisStatus: { not: "done" } } });

  console.log(`Pictograms: ${done}/${total} analyzed | ${pending} pending\n`);

  const ids = [
    "vault-pictograms-dice", "vault-pictograms-vip", "vault-pictograms-slots",
    "vault-pictograms-mma", "vault-pictograms-crypto", "vault-pictograms-chips-cb",
    "vault-pictograms-sports-1", "vault-pictograms-utility", "vault-pictograms-gaming",
    "vault-pictograms-cash-drop", "vault-pictograms-chips-stack",
  ];

  const samples = await prisma.assetVaultItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, analysis: true },
  });

  for (const s of samples) {
    const a = s.analysis as Record<string, unknown> | null;
    if (!a) continue;
    console.log(`[${s.id}]`);
    console.log(`  description: ${a.description}`);
    console.log(`  mood: ${a.mood}`);
    console.log(`  styleNotes: ${a.styleNotes}`);
    console.log(`  colorPalette: ${JSON.stringify(a.colorPalette)}`);
    console.log(`  subjects: ${JSON.stringify(a.subjects)}`);
    console.log();
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
