"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface AgentStats {
  jobs: number;
  feedback: { accept: number; reject: number };
  rules: { active: number; total: number };
  lastJobAt: string | null;
}

interface Stats {
  agents?: {
    socials: AgentStats;
    illustration: AgentStats;
  };
  vault: {
    totalFiles: number;
    byType: Record<string, number>;
    dbRows: { type: string; count: number }[];
    topTags: { tag: string; count: number }[];
  };
  analysis: {
    total: number;
    done: number;
    pending: number;
    analyzing: number;
    failed: number;
    percent: number;
    brandIntelligence: {
      topColors: { hex: string; count: number }[];
      topMoods: { mood: string; count: number }[];
      topSubjects: { subject: string; count: number }[];
    };
  };
  templates: {
    count: number;
    ids: { id: string; name: string; channels: string[] }[];
  };
  jobs: {
    total: number;
    byStatus: { status: string; count: number }[];
  };
  variants: { total: number };
  artifacts: { total: number };
  feedback: {
    total: number;
    byDecision: { decision: string; count: number }[];
  };
  system: {
    mockProviders: boolean;
    storageProvider: string;
    hasAnthropicKey: boolean;
    hasNanoBananaKey: boolean;
    nodeVersion: string;
  };
  brand?: {
    name: string;
    tagline: string;
    brandIdea: string;
    colors: { name: string; hex: string }[];
    launchPrimaries: string[];
    typography: {
      primary: { family: string; weights: string[]; style: string };
      secondary: { family: string; weights: string[]; style: string };
    };
    tov: { name: string; description: string }[];
    behaviors: string[];
    messaging: Record<string, string>;
  };
}

function StatCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function DevPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeLog, setAnalyzeLog] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    fetch("/api/dev/stats")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data);
      })
      .catch((err) => setError(err.message || "Failed to load stats"));
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalyzeLog("Starting analysis...");

    try {
      const res = await fetch("/api/dev/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 10 }),
      });
      const data = await res.json();

      if (data.error) {
        setAnalyzeLog(`Error: ${data.error}`);
      } else {
        setAnalyzeLog(
          `Batch complete: ${data.succeeded} succeeded, ${data.failed} failed. Progress: ${data.progress.done}/${data.progress.total} (${data.progress.percent}%)`
        );
        loadStats();
      }
    } catch {
      setAnalyzeLog("Network error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (error) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-red-500">{error}</div>
      </main>
    );
  }

  if (!stats) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-muted-foreground">Loading dev stats...</div>
      </main>
    );
  }

  const sys = stats.system ?? { mockProviders: false, storageProvider: "unknown", hasAnthropicKey: false, hasNanoBananaKey: false, nodeVersion: "" };
  const analysis = stats.analysis ?? { total: 0, done: 0, pending: 0, analyzing: 0, failed: 0, percent: 0, brandIntelligence: { topColors: [], topMoods: [], topSubjects: [] } };

  const pipelineSteps = [
    { name: "Vault Retrieval", desc: "Keyword/tag search across indexed assets", status: "active" },
    { name: "Claude Planner", desc: "Structured JSON creative spec generation", status: sys.mockProviders ? "mock" : sys.hasAnthropicKey ? "active" : "no-key" },
    { name: "Nano Banana (Image Gen)", desc: "Plate generation (bg/illustration/pictogram)", status: sys.mockProviders ? "mock" : sys.hasNanoBananaKey ? "active" : "no-key" },
    { name: "Composer", desc: "Template-based composition with text + notch overlay", status: "active" },
    { name: "QA Checks", desc: "Safe zone / notch overlap / text overflow validation", status: "active" },
    { name: "Storage", desc: `Artifact upload (${sys.storageProvider})`, status: "active" },
  ];

  const bi = analysis.brandIntelligence;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dev Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">System diagnostics, agent capabilities, and brand intelligence</p>
      </div>

      {/* Agent Health */}
      {stats.agents && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(["socials", "illustration"] as const).map((mode) => {
            const agent = stats.agents![mode];
            const label = mode === "socials" ? "Social Post Agent" : "Illustration Agent";
            const accent = mode === "socials"
              ? "border-blue-500/30 bg-blue-500/5"
              : "border-violet-500/30 bg-violet-500/5";
            const badgeColor = mode === "socials"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300";
            const lastUsed = agent.lastJobAt
              ? new Date(agent.lastJobAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
              : "never";
            const trainedClass = (agent.feedback.accept + agent.feedback.reject) > 0 ? "" : "opacity-60";
            return (
              <div key={mode} className={`rounded-xl border p-5 space-y-4 ${accent}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-base">{label}</span>
                    <div className="text-xs text-muted-foreground mt-0.5">Last used: {lastUsed}</div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badgeColor} ${trainedClass}`}>
                    {(agent.feedback.accept + agent.feedback.reject) > 0 ? "Trained" : "Untrained"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-background/60 border px-3 py-2">
                    <div className="text-xl font-bold">{agent.jobs}</div>
                    <div className="text-xs text-muted-foreground">Jobs</div>
                  </div>
                  <div className="rounded-lg bg-background/60 border px-3 py-2">
                    <div className="text-xl font-bold text-green-600 dark:text-green-400">{agent.feedback.accept}</div>
                    <div className="text-xs text-muted-foreground">Accepts</div>
                  </div>
                  <div className="rounded-lg bg-background/60 border px-3 py-2">
                    <div className="text-xl font-bold text-red-500 dark:text-red-400">{agent.feedback.reject}</div>
                    <div className="text-xs text-muted-foreground">Rejects</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{agent.rules.active}</span>
                    <span className="text-muted-foreground ml-1">active rules</span>
                    <span className="text-muted-foreground ml-2">({agent.rules.total} total)</span>
                  </div>
                  <a
                    href={`/rules?mode=${mode}`}
                    className="text-xs font-medium underline underline-offset-4 hover:opacity-80"
                  >
                    Configure Rules →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top-level stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard title="Vault Assets" value={stats.vault.totalFiles} />
        <StatCard title="Analyzed" value={`${analysis.percent}%`} sub={`${analysis.done}/${analysis.total}`} />
        <StatCard title="Templates" value={stats.templates.count} />
        <StatCard title="Jobs" value={stats.jobs.total} />
        <StatCard title="Artifacts" value={stats.artifacts.total} />
        <StatCard title="Feedback" value={stats.feedback.total} />
      </div>

      {/* Brand Identity */}
      {stats.brand && (
        <Card>
          <CardHeader>
            <CardTitle>{stats.brand.name} Brand Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-bold">{stats.brand.tagline}</span>
              <span className="text-sm text-muted-foreground">{stats.brand.brandIdea}</span>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Official Color Palette</div>
              <div className="flex flex-wrap gap-1.5">
                {stats.brand.colors.map(({ name, hex }) => (
                  <div key={name} className="flex items-center gap-1 rounded border px-1.5 py-0.5" title={name}>
                    <div className="w-3.5 h-3.5 rounded-sm border" style={{ backgroundColor: hex }} />
                    <span className="text-xs font-mono">{hex}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <span className="text-xs text-muted-foreground">Launch primaries:</span>
                {stats.brand.launchPrimaries.map((hex) => (
                  <div key={hex} className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: hex }} />
                    <span className="text-xs font-mono">{hex}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium mb-1">Primary Typeface</div>
                <div className="text-sm">{stats.brand.typography.primary.family}</div>
                <div className="text-xs text-muted-foreground">{stats.brand.typography.primary.weights.join(", ")} / {stats.brand.typography.primary.style}</div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Secondary Typeface</div>
                <div className="text-sm">{stats.brand.typography.secondary.family}</div>
                <div className="text-xs text-muted-foreground">{stats.brand.typography.secondary.weights.join(", ")}</div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="text-sm font-medium mb-2">Tone of Voice</div>
              <div className="grid grid-cols-2 gap-3">
                {stats.brand.tov.map((p) => (
                  <div key={p.name} className="rounded-lg border p-3">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {stats.brand.behaviors.map((b) => (
                <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
              ))}
            </div>

            <div className="text-xs text-muted-foreground italic">
              Composition and layout style evolves from analyzed previous posts in the vault.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Asset Analysis */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Asset Analysis (Brand Training)</CardTitle>
          <Button onClick={runAnalysis} disabled={isAnalyzing || analysis.pending === 0} size="sm">
            {isAnalyzing ? "Analyzing..." : analysis.pending === 0 ? "All Done" : `Analyze Next 10`}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{analysis.done} of {analysis.total} assets analyzed</span>
              <span className="font-medium">{analysis.percent}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${analysis.percent}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>Done: {analysis.done}</span>
              <span>Pending: {analysis.pending}</span>
              {analysis.analyzing > 0 && <span>Analyzing: {analysis.analyzing}</span>}
              {analysis.failed > 0 && <span className="text-red-500">Failed: {analysis.failed}</span>}
            </div>
          </div>

          {analyzeLog && (
            <div className="text-sm bg-muted/50 rounded-md p-3 font-mono">{analyzeLog}</div>
          )}
        </CardContent>
      </Card>

      {/* Brand Intelligence */}
      {analysis.done > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Brand Intelligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Colors */}
            {bi.topColors.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Detected Color Palette ({bi.topColors.length} colors)</div>
                <div className="flex flex-wrap gap-2">
                  {bi.topColors.map(({ hex, count }) => (
                    <div key={hex} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
                      <div className="w-4 h-4 rounded-sm border" style={{ backgroundColor: hex }} />
                      <span className="text-xs font-mono">{hex}</span>
                      <span className="text-xs text-muted-foreground">x{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Moods */}
            {bi.topMoods.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Recurring Moods</div>
                <div className="flex flex-wrap gap-1.5">
                  {bi.topMoods.map(({ mood, count }) => (
                    <Badge key={mood} variant="secondary" className="text-xs">
                      {mood} <span className="ml-1 opacity-60">({count})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Subjects */}
            {bi.topSubjects.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Recurring Subjects</div>
                <div className="flex flex-wrap gap-1.5">
                  {bi.topSubjects.map(({ subject, count }) => (
                    <Badge key={subject} variant="outline" className="text-xs">
                      {subject} <span className="ml-1 opacity-60">({count})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Generation Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pipelineSteps.map((step, i) => (
              <div key={step.name} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{step.name}</div>
                  <div className="text-xs text-muted-foreground">{step.desc}</div>
                </div>
                <Badge
                  variant={step.status === "active" ? "default" : step.status === "mock" ? "secondary" : "destructive"}
                >
                  {step.status === "active" ? "Active" : step.status === "mock" ? "Mock" : "No Key"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Vault breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Asset Vault</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {Object.entries(stats.vault.byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{type.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 bg-primary rounded-full"
                        style={{ width: `${Math.max(20, (count / stats.vault.totalFiles) * 200)}px` }}
                      />
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
            <Separator />
            <div>
              <div className="text-sm font-medium mb-2">Top Tags</div>
              <div className="flex flex-wrap gap-1">
                {stats.vault.topTags.map(({ tag, count }) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag} <span className="ml-1 opacity-50">{count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card>
          <CardHeader>
            <CardTitle>Template Library</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.templates.ids.map((tpl) => (
                <div key={tpl.id} className="flex items-center justify-between">
                  <span className="text-sm">{tpl.name}</span>
                  <div className="flex gap-1">
                    {tpl.channels.map((ch) => (
                      <Badge key={ch} variant="outline" className="text-xs">
                        {ch === "twitter" ? "X" : ch === "ig_feed" ? "IG" : ch === "ig_story" ? "Story" : "Email"}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Job stats */}
        <Card>
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.jobs.total === 0 ? (
              <div className="text-sm text-muted-foreground">No jobs created yet</div>
            ) : (
              <div className="space-y-2">
                {stats.jobs.byStatus.map(({ status, count }) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{status}</span>
                    <span className="text-sm font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {stats.feedback.total > 0 && (
              <>
                <Separator className="my-3" />
                <div className="text-sm font-medium mb-2">Feedback</div>
                <div className="space-y-1">
                  {stats.feedback.byDecision.map(({ decision, count }) => (
                    <div key={decision} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{decision}</span>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* System config */}
        <Card>
          <CardHeader>
            <CardTitle>System Config</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mock Providers</span>
                <Badge variant={sys.mockProviders ? "secondary" : "default"}>
                  {sys.mockProviders ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Storage</span>
                <span className="font-medium">{sys.storageProvider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Anthropic Key</span>
                <Badge variant={sys.hasAnthropicKey ? "default" : "outline"}>
                  {sys.hasAnthropicKey ? "Set" : "Missing"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gemini Key</span>
                <Badge variant={sys.hasNanoBananaKey ? "default" : "outline"}>
                  {sys.hasNanoBananaKey ? "Set" : "Missing"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Node.js</span>
                <span className="font-mono text-xs">{sys.nodeVersion}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
