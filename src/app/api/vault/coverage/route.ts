import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface TagFrequency {
  tag: string;
  count: number;
}

interface TypeCoverage {
  type: string;
  itemCount: number;
  tags: TagFrequency[];
}

/**
 * GET /api/vault/coverage
 * Returns tag frequency distribution across vault items grouped by type.
 * Use this to identify which topics/sports/angles are well-represented vs sparse.
 */
export async function GET() {
  try {
    const items = await prisma.assetVaultItem.findMany({
      select: { id: true, type: true, tags: true, analysisStatus: true },
    });

    // Group by type
    const byType = new Map<string, { itemCount: number; tagFreq: Map<string, number> }>();

    for (const item of items) {
      if (!byType.has(item.type)) {
        byType.set(item.type, { itemCount: 0, tagFreq: new Map() });
      }
      const group = byType.get(item.type)!;
      group.itemCount++;

      for (const tag of item.tags) {
        const normalized = tag.toLowerCase().trim();
        if (normalized.length < 2) continue;
        group.tagFreq.set(normalized, (group.tagFreq.get(normalized) ?? 0) + 1);
      }
    }

    const coverage: TypeCoverage[] = [];
    for (const [type, data] of byType.entries()) {
      const tags: TagFrequency[] = Array.from(data.tagFreq.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50); // top 50 tags per type

      coverage.push({ type, itemCount: data.itemCount, tags });
    }

    // Sort by item count descending
    coverage.sort((a, b) => b.itemCount - a.itemCount);

    return NextResponse.json({
      totalItems: items.length,
      analyzedItems: items.filter((i) => i.analysisStatus === "done").length,
      coverage,
    });
  } catch (error) {
    console.error("Failed to compute vault coverage:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
