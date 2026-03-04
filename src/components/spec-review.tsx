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

interface VaultRefItem {
  id: string;
  type: string;
  tags: string[];
  pathOrUrl: string;
  notes?: string;
}

interface RetrievalBundle {
  items: VaultRefItem[];
  totalMatched: number;
}

interface SpecReviewProps {
  jobId: string;
  variants: VariantData[];
  jobMode?: string;
  // New: array of references
  subjectReferences?: Array<{ url: string; note: string }> | null;
  // Legacy (kept for backward compat — will be normalised into array)
  subjectReferenceUrl?: string | null;
  subjectReferenceNote?: string | null;
  retrievalBundle?: unknown;
  onApproved: () => void;
}

export function SpecReview({ jobId, variants, jobMode, subjectReferences, subjectReferenceUrl, subjectReferenceNote, retrievalBundle, onApproved }: SpecReviewProps) {
  // Normalise: prefer new array, fall back to legacy single fields
  const resolvedRefs: Array<{ url: string; note: string }> =
    subjectReferences && subjectReferences.length > 0
      ? subjectReferences.filter(r => r.url)
      : subjectReferenceUrl
      ? [{ url: subjectReferenceUrl, note: subjectReferenceNote ?? "" }]
      : [];
  const isIllustrationMode = jobMode === "illustration";
  const isPictogramMode = jobMode === "pictogram";
  const isStandaloneMode = isIllustrationMode || isPictogramMode;
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
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
        <p className="text-sm font-medium text-primary">
          {isIllustrationMode
            ? "Review the illustration spec below. Edit any prompts, then approve to generate your illustrations."
            : isPictogramMode
            ? "Review the pictogram spec below. Edit any prompts, then approve to generate your icons."
            : "Review the planner output below. Edit any copy or image prompts, then approve to start image generation."}
        </p>
      </div>

      {/* Subject / hero illustration references (supports 1 or many) */}
      {resolvedRefs.length > 0 && (
        <div className="space-y-2">
          {resolvedRefs.length > 1 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Subject References ({resolvedRefs.length}) — all sent to image generator
            </p>
          )}
          {resolvedRefs.map((ref, ri) => {
            const isHeroIllustration = ref.note.includes("GENERATED CB FLAT-VECTOR ILLUSTRATION");
            const isHeroPictogram = ref.note.includes("GENERATED CB PICTOGRAM ICON");
            const label = isHeroIllustration
              ? "Hero Illustration"
              : isHeroPictogram
              ? "Pictogram Icon"
              : resolvedRefs.length > 1
              ? `Subject Reference ${ri + 1}`
              : "Subject Reference";
            const sublabel = isHeroIllustration
              ? "Pre-styled illustration — composited AS-IS onto the chosen template."
              : isHeroPictogram
              ? "Pictogram icon — placed as a graphic element on the chosen template."
              : isPictogramMode
              ? "Sent to image generator as the concept reference — defines what to iconify."
              : resolvedRefs.length > 1
              ? `Reference ${ri + 1} of ${resolvedRefs.length} — composited together into the final scene.`
              : "Sent to image generator as the first reference — anchors the subject\u2019s likeness.";

            return (
              <div key={ri} className="flex items-start gap-3 rounded-lg border bg-secondary/5 border-secondary/20 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ref.url}
                  alt={label}
                  className="w-16 h-16 object-cover rounded-md border shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    {isHeroIllustration && (
                      <Badge variant="secondary" className="text-[10px]">
                        Compositing mode
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
                  {ref.note && (
                    <div className="mt-1.5 rounded-md bg-secondary/10 border border-secondary/20 px-2.5 py-1.5">
                      <p className="text-xs font-medium text-secondary mb-0.5">
                        {isHeroIllustration ? "Context passed to generator" : "Creator instructions"}
                      </p>
                      <p className="text-xs text-foreground/80 italic line-clamp-3">&ldquo;{ref.note}&rdquo;</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vault style references */}
      {(() => {
        const bundle = retrievalBundle as RetrievalBundle | null;
        const items = bundle?.items ?? [];
        if (items.length === 0) return null;

        const allSelectedIds = new Set(
          variants.flatMap((v) => {
            const raw = v.plannerSpec as Record<string, unknown> | null;
            return (raw?.referencesUsed as string[]) ?? [];
          })
        );

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Vault Style References</p>
              <Badge variant="outline" className="text-[10px]">
                {items.length} retrieved{bundle!.totalMatched > items.length ? ` of ${bundle!.totalMatched}` : ""}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {isPictogramMode
                ? "These icons/illustrations from the brand vault are sent as style references to guide the icon's rendering approach."
                : "These illustrations from the brand vault are sent as style references to guide the AI\u2019s rendering approach."}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((item) => {
                const src = item.pathOrUrl
                  ? `/api/vault/asset?path=${encodeURIComponent(item.pathOrUrl)}`
                  : null;
                const isSelected = allSelectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-primary/60 ring-1 ring-primary/20"
                        : "border-border/50 opacity-60"
                    }`}
                    title={`${item.type} — ${item.tags.join(", ")}${isSelected ? " (selected by planner)" : ""}`}
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={item.tags.join(", ")}
                        className="w-16 h-16 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center w-16 h-16 text-[10px] bg-muted text-muted-foreground">
                        {item.type}
                      </span>
                    )}
                    {isSelected && (
                      <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-[8px] text-primary-foreground font-bold">✓</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-end bg-linear-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-1">
                      <span className="text-[9px] text-white leading-tight line-clamp-2">
                        {item.tags.slice(0, 3).join(", ")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {specs.map((spec, idx) => (
        <Card key={spec.variantLabel}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 flex-wrap">
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
              {isIllustrationMode && (() => {
                const raw = variants[idx]?.plannerSpec as Record<string, unknown> | null;
                const art = raw?.artDirection as Record<string, unknown> | null;
                const solidBg = art?.solidBackground as string | undefined;
                if (!solidBg) return null;
                return (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-muted-foreground">Background:</span>
                    <div className="w-5 h-5 rounded-sm border shadow-sm" style={{ backgroundColor: solidBg }} title={solidBg} />
                    <span className="text-xs font-mono text-muted-foreground">{solidBg}</span>
                  </div>
                );
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const raw = variants[idx]?.plannerSpec as Record<string, unknown> | null;
              const templateId = (raw?.templateAssetId as string) || "";
              const refs = (raw?.referencesUsed as string[]) || [];
              if (!templateId && refs.length === 0) return null;

              if (isIllustrationMode && refs.length > 0) {
                // Illustration mode: show actual image thumbnails for the vault refs
                const styleRefs = refs.filter((r) => r !== templateId);
                // referencePaths maps DB id → public asset path (added by planner)
                const refPaths = (raw?.referencePaths as Record<string, string>) ?? {};

                return (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Style References ({styleRefs.length})
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {styleRefs.map((refId, ri) => {
                        const assetPath = refPaths[refId];
                        const src = assetPath
                          ? `/api/vault/asset?path=${encodeURIComponent(assetPath)}`
                          : null;
                        return (
                          <div key={refId} className="relative group">
                            {src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src}
                                alt={`Style ref ${ri + 1}`}
                                className="w-14 h-14 object-cover rounded border"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <span className="inline-flex items-center justify-center w-14 h-14 text-xs rounded border bg-muted text-muted-foreground">
                                Ref {ri + 1}
                              </span>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-white text-xs font-mono">{refId.slice(0, 8)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // Socials mode: show badges
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

            {!isIllustrationMode && (
              <>
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
              </>
            )}

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
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
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
