"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AgentMode = "socials" | "illustration";

interface Rule {
  id: string;
  content: string;
  category: string;
  source: string;
  mode: string;
  enabled: boolean;
  priority: number;
  sourceJobId: string | null;
  createdAt: string;
}

interface ModeStats {
  total: number;
  active: number;
  estimatedTokens: number;
}

interface RulesData {
  rules: Rule[];
  stats: {
    total: number;
    active: number;
    estimatedTokens: number;
    byMode: {
      socials: ModeStats;
      illustration: ModeStats;
    };
  };
}

const CATEGORIES = ["do", "dont", "general", "style", "composition", "color", "typography"];

const CATEGORY_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  do: "default",
  dont: "destructive",
  style: "secondary",
  composition: "secondary",
  general: "outline",
  color: "secondary",
  typography: "secondary",
  positive: "default",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "manual",
  feedback: "feedback",
  positive: "positive",
  default: "default",
};

const MODE_CONFIG: Record<AgentMode, { label: string; description: string; color: string }> = {
  socials: {
    label: "Social Post Agent",
    description: "Rules for generating social media posts with templates, brand backgrounds, and compositions",
    color: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
  },
  illustration: {
    label: "Illustration Agent",
    description: "Rules for generating standalone character illustrations with solid backgrounds and cutout-ready output",
    color: "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400",
  },
};

function RulesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialMode = (searchParams.get("mode") as AgentMode) || "socials";
  const [activeMode, setActiveMode] = useState<AgentMode>(
    initialMode === "illustration" ? "illustration" : "socials"
  );
  const [data, setData] = useState<RulesData | null>(null);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newPriority, setNewPriority] = useState(3);
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback((mode: AgentMode) => {
    fetch(`/api/rules?mode=${mode}`)
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    load(activeMode);
  }, [activeMode, load]);

  const switchMode = (mode: AgentMode) => {
    setActiveMode(mode);
    setData(null);
    router.replace(`/rules?mode=${mode}`, { scroll: false });
  };

  const addRule = async () => {
    if (!newContent.trim()) return;
    setIsAdding(true);
    await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: newContent,
        category: newCategory,
        priority: newPriority,
        mode: activeMode,
      }),
    });
    setNewContent("");
    setIsAdding(false);
    load(activeMode);
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    await fetch(`/api/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    load(activeMode);
  };

  const updatePriority = async (id: string, priority: number) => {
    await fetch(`/api/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority }),
    });
    load(activeMode);
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    load(activeMode);
  };

  const currentModeStats = data?.stats.byMode[activeMode];
  const tokenWarning = (currentModeStats?.estimatedTokens ?? 0) > 1000;
  const modeConfig = MODE_CONFIG[activeMode];

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Rules</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Rules are injected into each agent&apos;s system prompt. Max 15 active rules per agent per job.
        </p>
      </div>

      {/* Mode tab switcher */}
      <div className="grid grid-cols-2 gap-3">
        {(["socials", "illustration"] as AgentMode[]).map((mode) => {
          const cfg = MODE_CONFIG[mode];
          const stats = data?.stats.byMode[mode];
          const isActive = activeMode === mode;
          return (
            <button
              key={mode}
              onClick={() => switchMode(mode)}
              className={`rounded-xl border p-4 text-left transition-all ${
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{cfg.label}</span>
                {stats && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                    {stats.active} active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{cfg.description}</p>
              {stats && (
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{stats.total} rules</span>
                  <span>~{stats.estimatedTokens} tokens</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {!data ? (
        <div className="text-muted-foreground text-sm py-4">Loading rules...</div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-2xl font-bold">{currentModeStats?.active ?? 0}</span>
                <span className="text-muted-foreground ml-1.5">Active</span>
              </div>
              <div>
                <span className="text-2xl font-bold">{currentModeStats?.total ?? 0}</span>
                <span className="text-muted-foreground ml-1.5">Total</span>
              </div>
              <div>
                <span className={`text-2xl font-bold ${tokenWarning ? "text-amber-500" : ""}`}>
                  ~{currentModeStats?.estimatedTokens ?? 0}
                </span>
                <span className="text-muted-foreground ml-1.5">Tokens</span>
              </div>
            </div>
          </div>

          {tokenWarning && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
              Token count is high ({currentModeStats?.estimatedTokens}). Consider disabling low-priority rules to prevent prompt bloat.
            </div>
          )}

          {/* Add rule */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Add Rule to {modeConfig.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder={
                  activeMode === "illustration"
                    ? "e.g. Always use dramatic low-angle perspective for maximum impact..."
                    : "e.g. Always use dark backgrounds with high contrast text..."
                }
                rows={2}
              />
              <div className="flex gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Priority (1–5)</Label>
                  <Select value={String(newPriority)} onValueChange={(v) => setNewPriority(Number(v))}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addRule} disabled={isAdding || !newContent.trim()}>
                  {isAdding ? "Adding..." : "Add Rule"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rules list */}
          <div className="space-y-2">
            {data.rules.map((rule) => (
              <div
                key={rule.id}
                className={`flex items-start gap-3 rounded-lg border p-3 transition-opacity ${
                  rule.enabled ? "" : "opacity-40"
                }`}
              >
                <button
                  onClick={() => toggleRule(rule.id, rule.enabled)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 shrink-0 transition-colors ${
                    rule.enabled ? "bg-primary border-primary" : "border-muted-foreground"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{rule.content}</p>
                  <div className="flex gap-2 mt-1.5 items-center flex-wrap">
                    <Badge
                      variant={CATEGORY_COLORS[rule.category] || "outline"}
                      className="text-xs"
                    >
                      {rule.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">P{rule.priority}</span>
                    <Badge variant="outline" className="text-xs">
                      {SOURCE_LABELS[rule.source] || rule.source}
                    </Badge>
                    {rule.sourceJobId && (
                      <a
                        href={`/jobs/${rule.sourceJobId}`}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        from job
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 items-center shrink-0">
                  <Select
                    value={String(rule.priority)}
                    onValueChange={(v) => updatePriority(rule.id, Number(v))}
                  >
                    <SelectTrigger className="w-14 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-red-500 hover:text-red-600"
                    onClick={() => deleteRule(rule.id)}
                  >
                    Del
                  </Button>
                </div>
              </div>
            ))}

            {data.rules.length === 0 && (
              <div className="text-center py-10 text-muted-foreground space-y-2">
                <p className="text-sm">No rules yet for the {modeConfig.label}.</p>
                <p className="text-xs">
                  Rules are auto-created from feedback (accept/reject) or you can add them manually above.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

export default function RulesPage() {
  return (
    <Suspense fallback={<main className="max-w-4xl mx-auto px-4 py-8"><div className="text-muted-foreground">Loading...</div></main>}>
      <RulesPageInner />
    </Suspense>
  );
}
