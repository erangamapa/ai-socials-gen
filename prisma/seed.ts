import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { TEMPLATE_REGISTRY } from "../src/lib/templates/registry";
import * as fs from "fs";
import * as path from "path";

import pg from "pg";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface VaultEntry {
  id: string;
  type: string;
  pathOrUrl: string;
  tags: string[];
  channelHints: string[];
  notes: string;
}

async function main() {
  console.log("Seeding templates...");
  for (const tpl of TEMPLATE_REGISTRY) {
    await prisma.template.upsert({
      where: { id: tpl.id },
      update: { name: tpl.name, spec: JSON.parse(JSON.stringify(tpl.spec)) },
      create: { id: tpl.id, name: tpl.name, spec: JSON.parse(JSON.stringify(tpl.spec)) },
    });
  }
  console.log(`  Upserted ${TEMPLATE_REGISTRY.length} templates`);

  console.log("Seeding asset vault items...");
  const indexPath = path.resolve(__dirname, "../assets/vault/index.json");
  const vaultItems: VaultEntry[] = JSON.parse(fs.readFileSync(indexPath, "utf-8"));

  for (const item of vaultItems) {
    await prisma.assetVaultItem.upsert({
      where: { id: item.id },
      update: {
        type: item.type,
        pathOrUrl: item.pathOrUrl,
        tags: item.tags,
        channelHints: item.channelHints,
        notes: item.notes,
      },
      create: {
        id: item.id,
        type: item.type,
        pathOrUrl: item.pathOrUrl,
        tags: item.tags,
        channelHints: item.channelHints,
        notes: item.notes,
      },
    });
  }
  console.log(`  Upserted ${vaultItems.length} vault items`);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
