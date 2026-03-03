"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronDown, Trash2, ExternalLink } from "lucide-react";
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
  hitCount: number;
  successCount: number;
  confidence: number;
  lastUsedAt: string | null;
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
  synthesis: "AI synthesis",
  default: "default",
};

const MODE_CONFIG: Record<AgentMode, { label: string; description: string }> = {
  socials: {
    label: "Social Post Agent",
    description: "Rules for generating social media posts with templates, brand backgrounds, and compositions",
  },
  illustration: {
    label: "Illustration Agent",
    description: "Rules for generating standalone character illustrations with solid backgrounds and cutout-ready output",
  },
};

const CATEGORY_ORDER = ["do", "style", "composition", "color", "typography", "dont", "general", "positive"];

const CATEGORY_LABELS: Record<string, string> = {
  do: "Do",
  dont: "Don't",
  style: "Style",
  composition: "Composition",
  color: "Color",
  typography: "Typography",
  general: "General",
  positive: "Positive",
};

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 70 ? "bg-accent" : value >= 40 ? "bg-primary" : "bg-destructive";
  return (
    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden" title={`Confidence: ${value}%`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function RuleRow({
  rule,
  onToggle,
  onUpdatePriority,
  onDelete,
}: {
  rule: Rule;
  onToggle: (id: string, enabled: boolean) => void;
  onUpdatePriority: (id: string, priority: number) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={[
        "group flex items-start gap-3 rounded-lg border p-3 transition-all duration-300",
        rule.enabled
          ? "border-border bg-card"
          : "border-border/40 bg-muted/20",
      ].join(" ")}
    >
      {/* Toggle switch */}
      <button
        onClick={() => onToggle(rule.id, rule.enabled)}
        className="mt-0.5 shrink-0 relative w-9 h-5 rounded-full transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          backgroundColor: rule.enabled
            ? "var(--accent)"
            : "var(--muted)",
        }}
        aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
      >
        <span
          className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300"
          style={{
            transform: rule.enabled ? "translateX(16px)" : "translateX(0)",
          }}
        />
      </button>

      {/* Content */}
      <div className={`flex-1 min-w-0 transition-opacity duration-300 ${rule.enabled ? "" : "opacity-50"}`}>
        <p className="text-sm leading-relaxed">{rule.content}</p>
        <div className="flex gap-2 mt-2 items-center flex-wrap">
          <Badge variant="outline" className="text-xs">
            {SOURCE_LABELS[rule.source] || rule.source}
          </Badge>
          <span className="text-xs text-muted-foreground">P{rule.priority}</span>
          <ConfidenceBar value={rule.confidence} />
          <span
            className={`text-[11px] font-medium tabular-nums ${
              rule.confidence >= 70
                ? "text-accent"
                : rule.confidence >= 40
                ? "text-primary"
                : "text-destructive"
            }`}
          >
            {rule.confidence}%
          </span>
          {rule.hitCount > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums" title={`${rule.successCount} successes / ${rule.hitCount} hits`}>
              {rule.successCount}/{rule.hitCount} hits
            </span>
          )}
          {rule.sourceJobId && (
            <a
              href={`/jobs/${rule.sourceJobId}`}
              className="inline-flex items-center gap-0.5 text-[11px] text-secondary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              job
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 items-center shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        <Select
          value={String(rule.priority)}
          onValueChange={(v) => onUpdatePriority(rule.id, Number(v))}
        >
          <SelectTrigger className="w-14 h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((p) => (
              <SelectItem key={p} value={String(p)}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(rule.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function RulesList({
  rules,
  modeConfig,
  onToggle,
  onUpdatePriority,
  onDelete,
}: {
  rules: Rule[];
  modeConfig: { label: string };
  onToggle: (id: string, enabled: boolean) => void;
  onUpdatePriority: (id: string, priority: number) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsedDisabled, setCollapsedDisabled] = useState(false);

  const { enabledGroups, disabledRules } = useMemo(() => {
    const enabled = rules.filter((r) => r.enabled);
    const disabled = rules.filter((r) => !r.enabled);

    enabled.sort((a, b) => {
      const catA = CATEGORY_ORDER.indexOf(a.category);
      const catB = CATEGORY_ORDER.indexOf(b.category);
      if (catA !== catB) return catA - catB;
      return b.confidence - a.confidence;
    });

    disabled.sort((a, b) => b.confidence - a.confidence);

    const groups: Record<string, Rule[]> = {};
    for (const r of enabled) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    }

    const sortedCategories = Object.keys(groups).sort(
      (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
    );

    return {
      enabledGroups: sortedCategories.map((cat) => ({ category: cat, rules: groups[cat] })),
      disabledRules: disabled,
    };
  }, [rules]);

  if (rules.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground space-y-2">
        <p className="text-sm">No rules yet for the {modeConfig.label}.</p>
        <p className="text-xs">
          Rules are auto-created from feedback (accept/reject) or you can add them manually above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enabled rules grouped by category */}
      {enabledGroups.map(({ category, rules: groupRules }) => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant={CATEGORY_COLORS[category] || "outline"}
              className="text-xs"
            >
              {CATEGORY_LABELS[category] || category}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {groupRules.length} rule{groupRules.length !== 1 ? "s" : ""}
            </span>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="space-y-1.5">
            {groupRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={onToggle}
                onUpdatePriority={onUpdatePriority}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Disabled rules section */}
      {disabledRules.length > 0 && (
        <div>
          <button
            onClick={() => setCollapsedDisabled((v) => !v)}
            className="flex items-center gap-2 mb-2 group/header w-full text-left"
          >
            <div className="flex-1 h-px bg-border/30" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider shrink-0">
              Disabled ({disabledRules.length})
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                collapsedDisabled ? "-rotate-90" : ""
              }`}
            />
            <div className="flex-1 h-px bg-border/30" />
          </button>
          {!collapsedDisabled && (
            <div className="space-y-1.5">
              {disabledRules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onToggle={onToggle}
                  onUpdatePriority={onUpdatePriority}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const synthesize = async () => {
    setIsSynthesizing(true);
    setSynthesisResult(null);
    try {
      const res = await fetch("/api/rules/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: activeMode }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSynthesisResult(`Error: ${result.error || "Synthesis failed"}`);
      } else {
        setSynthesisResult(
          `${result.created} rules created, ${result.disabled} superseded. ${result.reasoning}`
        );
        load(activeMode);
      }
    } catch {
      setSynthesisResult("Network error during synthesis");
    }
    setIsSynthesizing(false);
  };

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
    setActionError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent,
          category: newCategory,
          priority: newPriority,
          mode: activeMode,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to add rule");
      setNewContent("");
      load(activeMode);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add rule");
    } finally {
      setIsAdding(false);
    }
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error("Failed to toggle rule");
      load(activeMode);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to toggle rule");
    }
  };

  const updatePriority = async (id: string, priority: number) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) throw new Error("Failed to update priority");
      load(activeMode);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update priority");
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rule");
      load(activeMode);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete rule");
    }
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
                  ? "border-secondary/50 bg-secondary/10 ring-1 ring-secondary/30"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{cfg.label}</span>
                {stats && (
                  <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-accent/15 text-accent border-accent/30">
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
                <span className={`text-2xl font-bold ${tokenWarning ? "text-primary" : ""}`}>
                  ~{currentModeStats?.estimatedTokens ?? 0}
                </span>
                <span className="text-muted-foreground ml-1.5">Tokens</span>
              </div>
            </div>
            <Button
              onClick={synthesize}
              disabled={isSynthesizing}
              variant="outline"
              className="gap-2"
            >
              {isSynthesizing ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Synthesizing...
                </>
              ) : (
                "Synthesize Rules"
              )}
            </Button>
          </div>

          {synthesisResult && (
            <div className={`rounded-lg border p-3 text-sm ${
              synthesisResult.startsWith("Error")
                ? "bg-destructive/10 border-destructive/20 text-destructive"
                : "bg-accent/10 border-accent/20 text-foreground"
            }`}>
              {synthesisResult}
            </div>
          )}

          {actionError && (
            <div className="rounded-lg border p-3 text-sm bg-destructive/10 border-destructive/20 text-destructive">
              {actionError}
            </div>
          )}

          {tokenWarning && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-primary">
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

          {/* Rules list — grouped by category, enabled first */}
          <RulesList
            rules={data.rules}
            modeConfig={modeConfig}
            onToggle={toggleRule}
            onUpdatePriority={updatePriority}
            onDelete={deleteRule}
          />
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
