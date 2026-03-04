"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface TagFrequency {
  tag: string;
  count: number;
}

interface TypeCoverage {
  type: string;
  itemCount: number;
  tags: TagFrequency[];
}

interface CoverageData {
  totalItems: number;
  analyzedItems: number;
  coverage: TypeCoverage[];
}

const TYPE_LABELS: Record<string, string> = {
  illustration: "Illustrations",
  pictogram: "Pictograms",
  template: "Templates",
  previous_post: "Previous Posts",
};

function TagCloud({ tags }: { tags: TagFrequency[] }) {
  const maxCount = Math.max(...tags.map((t) => t.count), 1);
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => {
        const opacity = Math.max(0.3, Math.min(1, t.count / maxCount));
        return (
          <span
            key={t.tag}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20"
            style={{ opacity }}
            title={`${t.count} item${t.count !== 1 ? "s" : ""}`}
          >
            {t.tag}
            <span className="text-[10px] text-primary/60 font-normal">{t.count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function VaultCoveragePage() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vault/coverage")
      .then((r) => r.json())
      .then((d: CoverageData) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">Failed to load coverage: {error}</p>
      </main>
    );
  }

  const analysisRate = Math.round((data.analyzedItems / Math.max(data.totalItems, 1)) * 100);

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Vault Coverage Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {data.totalItems} total items · {data.analyzedItems} analyzed ({analysisRate}%)
        </p>
      </div>

      {data.coverage.map((group) => (
        <Card key={group.type}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3">
              <span>{TYPE_LABELS[group.type] ?? group.type}</span>
              <Badge variant="secondary">{group.itemCount} items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {group.tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tags found.</p>
            ) : (
              <TagCloud tags={group.tags} />
            )}
          </CardContent>
        </Card>
      ))}

      {data.coverage.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          No vault items found. Add some illustrations to get started.
        </div>
      )}
    </main>
  );
}
