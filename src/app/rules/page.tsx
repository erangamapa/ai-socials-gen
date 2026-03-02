"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Rule {
  id: string;
  content: string;
  category: string;
  source: string;
  enabled: boolean;
  priority: number;
  sourceJobId: string | null;
  createdAt: string;
}

interface RulesData {
  rules: Rule[];
  stats: { total: number; active: number; estimatedTokens: number };
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

export default function RulesPage() {
  const [data, setData] = useState<RulesData | null>(null);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newPriority, setNewPriority] = useState(3);
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(() => {
    fetch("/api/rules").then((r) => r.json()).then(setData);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRule = async () => {
    if (!newContent.trim()) return;
    setIsAdding(true);
    await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent, category: newCategory, priority: newPriority }),
    });
    setNewContent("");
    setIsAdding(false);
    load();
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    await fetch(`/api/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    load();
  };

  const updatePriority = async (id: string, priority: number) => {
    await fetch(`/api/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority }),
    });
    load();
  };

  const deleteRule = async (id: string) => {
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    load();
  };

  if (!data) {
    return <main className="max-w-4xl mx-auto px-4 py-8"><div className="text-muted-foreground">Loading rules...</div></main>;
  }

  const tokenWarning = data.stats.estimatedTokens > 1000;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prompt Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Rules that shape how the AI planner generates creative specs. Max 15 injected per job.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold">{data.stats.active}</div>
            <div className="text-muted-foreground">Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{data.stats.total}</div>
            <div className="text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${tokenWarning ? "text-red-500" : ""}`}>
              ~{data.stats.estimatedTokens}
            </div>
            <div className="text-muted-foreground">Tokens</div>
          </div>
        </div>
      </div>

      {tokenWarning && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
          Token count is high ({data.stats.estimatedTokens}). Consider disabling low-priority rules to prevent prompt bloat.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="e.g. Always use dark backgrounds with high contrast text..."
            rows={2}
          />
          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority (1-5)</Label>
              <Select value={String(newPriority)} onValueChange={(v) => setNewPriority(Number(v))}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addRule} disabled={isAdding || !newContent.trim()}>
              {isAdding ? "Adding..." : "Add Rule"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {data.rules.map((rule) => (
          <div
            key={rule.id}
            className={`flex items-start gap-3 rounded-lg border p-3 transition-opacity ${
              rule.enabled ? "" : "opacity-50"
            }`}
          >
            <button
              onClick={() => toggleRule(rule.id, rule.enabled)}
              className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 transition-colors ${
                rule.enabled ? "bg-primary border-primary" : "border-muted-foreground"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm">{rule.content}</p>
              <div className="flex gap-2 mt-1.5 items-center">
                <Badge variant={CATEGORY_COLORS[rule.category] || "outline"} className="text-xs">
                  {rule.category}
                </Badge>
                <span className="text-xs text-muted-foreground">P{rule.priority}</span>
                <Badge variant="outline" className="text-xs">{rule.source}</Badge>
                {rule.sourceJobId && (
                  <a href={`/jobs/${rule.sourceJobId}`} className="text-xs text-blue-500 hover:underline">
                    Job
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-1 items-center flex-shrink-0">
              <Select value={String(rule.priority)} onValueChange={(v) => updatePriority(rule.id, Number(v))}>
                <SelectTrigger className="w-14 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 text-xs text-red-500" onClick={() => deleteRule(rule.id)}>
                Del
              </Button>
            </div>
          </div>
        ))}
        {data.rules.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No rules yet. Add your first rule above or generate one from job feedback.
          </div>
        )}
      </div>
    </main>
  );
}
