"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { VariantData } from "@/hooks/use-poll-job";

interface VariantSpec {
  variantLabel: string;
  copy: {
    headline: string;
    subhead?: string;
    cta: string;
    disclaimer?: string;
  };
  artDirection: {
    palette: string[];
    mood: string;
    style: string;
    backgroundPrompt: string;
  };
}

function findNested(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = findNested(val as Record<string, unknown>, ...keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function extractSpec(variant: VariantData): VariantSpec {
  const spec = variant.plannerSpec as Record<string, unknown> | null;
  if (!spec) {
    return {
      variantLabel: variant.label,
      copy: { headline: "", cta: "" },
      artDirection: { palette: [], mood: "", style: "", backgroundPrompt: "" },
    };
  }

  const copy = (spec.copy || spec.text || spec.messaging || {}) as Record<string, string>;
  const art = (spec.artDirection || spec.art_direction || spec.artdirection || spec.visual || {}) as Record<string, unknown>;

  const headline = copy.headline || (findNested(spec, "headline") as string) || "";
  const subhead = copy.subhead || copy.subheadline || copy.sub_head || (findNested(spec, "subhead", "subheadline") as string) || "";
  const cta = copy.cta || copy.callToAction || copy.call_to_action || (findNested(spec, "cta", "callToAction") as string) || "";
  const disclaimer = copy.disclaimer || "";

  const bgPrompt = (art.backgroundPrompt || art.background_prompt || art.imagePrompt || art.image_prompt || art.prompt || findNested(spec, "backgroundPrompt", "imagePrompt", "image_prompt") || "") as string;
  const mood = (art.mood || findNested(spec, "mood") || "") as string;
  const style = (art.style || findNested(spec, "style") || "") as string;
  const palette = (art.palette || art.colors || findNested(spec, "palette", "colors") || []) as string[];
  const refInstructions = (art.referenceInstructions || art.reference_instructions || findNested(spec, "referenceInstructions") || "") as string;

  return {
    variantLabel: variant.label,
    copy: { headline, subhead, cta, disclaimer },
    artDirection: {
      palette: Array.isArray(palette) ? palette : [],
      mood,
      style,
      backgroundPrompt: bgPrompt + (refInstructions ? `\n\n${refInstructions}` : ""),
    },
  };
}

interface SpecReviewProps {
  jobId: string;
  variants: VariantData[];
  onApproved: () => void;
}

export function SpecReview({ jobId, variants, onApproved }: SpecReviewProps) {
  const [specs, setSpecs] = useState<VariantSpec[]>(() =>
    variants.map(extractSpec)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSpec = (idx: number, path: string, value: string) => {
    setSpecs((prev) => {
      const next = [...prev];
      const spec = { ...next[idx] };

      if (path.startsWith("copy.")) {
        const field = path.replace("copy.", "");
        spec.copy = { ...spec.copy, [field]: value };
      } else if (path.startsWith("artDirection.")) {
        const field = path.replace("artDirection.", "");
        spec.artDirection = { ...spec.artDirection, [field]: value };
      }

      next[idx] = spec;
      return next;
    });
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants: specs }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }

      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Review the planner output below. Edit any copy or image prompts, then approve to start image generation.
        </p>
      </div>

      {specs.map((spec, idx) => (
        <Card key={spec.variantLabel}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3">
              <span>Variant {spec.variantLabel}</span>
              {spec.artDirection.palette.length > 0 && (
                <div className="flex gap-1">
                  {spec.artDirection.palette.slice(0, 5).map((hex, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-sm border"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const raw = variants[idx]?.plannerSpec as Record<string, unknown> | null;
              const templateId = (raw?.templateAssetId as string) || "";
              const refs = (raw?.referencesUsed as string[]) || [];
              if (!templateId && refs.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-2 items-center text-xs">
                  {templateId && (
                    <Badge variant="default" className="text-xs">Template: {templateId}</Badge>
                  )}
                  {refs.filter(r => r !== templateId).map((r) => (
                    <Badge key={r} variant="outline" className="text-xs">Ref: {r}</Badge>
                  ))}
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Headline</Label>
                <Textarea
                  value={spec.copy.headline}
                  onChange={(e) => updateSpec(idx, "copy.headline", e.target.value)}
                  rows={2}
                  className="font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">CTA</Label>
                <Textarea
                  value={spec.copy.cta}
                  onChange={(e) => updateSpec(idx, "copy.cta", e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Subhead</Label>
                <Textarea
                  value={spec.copy.subhead || ""}
                  onChange={(e) => updateSpec(idx, "copy.subhead", e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Disclaimer</Label>
                <Textarea
                  value={spec.copy.disclaimer || ""}
                  onChange={(e) => updateSpec(idx, "copy.disclaimer", e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Mood</Label>
                <Textarea
                  value={spec.artDirection.mood}
                  onChange={(e) => updateSpec(idx, "artDirection.mood", e.target.value)}
                  rows={1}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Style</Label>
                <Textarea
                  value={spec.artDirection.style}
                  onChange={(e) => updateSpec(idx, "artDirection.style", e.target.value)}
                  rows={1}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Image Generation Prompt
                <Badge variant="outline" className="ml-2 text-xs">sent to Nano Banana</Badge>
              </Label>
              <Textarea
                value={spec.artDirection.backgroundPrompt}
                onChange={(e) => updateSpec(idx, "artDirection.backgroundPrompt", e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            </div>

            <Separator />

            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Raw planner data (click to expand)
              </summary>
              <pre className="mt-2 text-xs font-mono bg-muted/50 rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap">
                {JSON.stringify(variants[idx]?.plannerSpec, null, 2) || "No data"}
              </pre>
            </details>
          </CardContent>
        </Card>
      ))}

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-3">
          {error}
        </div>
      )}

      <Button
        onClick={handleApprove}
        disabled={isSubmitting}
        className="w-full"
        size="lg"
      >
        {isSubmitting ? "Approving..." : "Approve & Generate Images"}
      </Button>
    </div>
  );
}
