"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shuffle, Upload, X, ImageIcon, Loader2, Sparkles, Plus } from "lucide-react";

const MAX_REFERENCES = 4;

interface SubjectReference {
  url: string;
  note: string;
  preview: string;
  uploading?: boolean;
  error?: string | null;
  locked?: boolean; // from social context flow
}

interface AngleReference {
  url: string;
  note: string;
  preview: string;
  uploading?: boolean;
  error?: string | null;
}

const CHANNEL_OPTIONS = [
  { id: "twitter", label: "Twitter / X", size: "1600×900" },
  { id: "ig_feed", label: "Instagram Feed", size: "1080×1350" },
] as const;

const SIZE_PRESETS = [
  { id: "1:1", label: "1:1 Square", size: "1080×1080", desc: "Universal" },
  { id: "4:5", label: "4:5 Portrait", size: "1080×1350", desc: "Instagram Feed" },
  { id: "16:9", label: "16:9 Landscape", size: "1600×900", desc: "Banner / Twitter" },
] as const;

const RANDOM_PROMPTS = [
  "Champions League matchday promo — big match energy, early odds callout for CB",
  "NBA playoffs semi-finals — highlight the best live betting odds available tonight",
  "Counter-Strike 2 Major tournament — esports promo with team rivalry angle",
  "UFC Fight Night — knockout odds promo, main event hype with fighter energy",
  "Premier League weekend fixtures — multi-match odds boost announcement",
  "Formula 1 Grand Prix — race day promo, fastest odds, podium excitement",
  "Dota 2 The International — esports championship, high stakes, massive prize pool",
  "Tennis Grand Slam — serve and volley action, live in-play betting promo",
  "Boxing world title fight — heavyweight showdown odds special, night of champions",
  "NFL Sunday highlights — touchdown odds and same-game parlays promotion",
  "Cricket World Cup — batting action promo, live match odds callout",
  "Ice Hockey Stanley Cup Playoffs — power play promo, puck drop tonight",
  "Rugby World Cup — scrum energy, try-scoring odds boost for the weekend",
  "Baseball World Series — home run promo, game 7 tension and excitement",
  "Volleyball Nations League — spike and serve action, live betting odds",
  "MMA cage fight night — ground and pound promo, late-night knockout special",
  "Cycling Tour de France — mountain stage promo, stage winner odds",
  "Golf Masters — hole-in-one odds promo, weekend leaderboard excitement",
  "Swimming World Championship — split-second finish, medal odds callout",
  "Snooker World Championship — maximum break odds, Crucible drama",
];

const ILLUSTRATION_PROMPTS = [
  "Cristiano Ronaldo mid-bicycle kick at peak arc, both feet off the ground, stadium silent before the net shakes — navy and CB gold palette",
  "MMA fighter closing with a lead-leg teep, predator energy, locked eyes, sweat frozen in the air — deep purple and charcoal",
  "NBA point guard crossover that snaps a defender's ankles, court lights blazing from below, pure street-level dominance — electric orange and midnight blue",
  "F1 driver victory moment stepping out of cockpit, fist raised to the sky, pit lane eruption behind — CB orange and racing white",
  "Heavyweight boxer landing an overhand right at full extension, sweat arc frozen mid-air, ring lights catching the blur — crimson on deep navy",
  "Premier League striker catching a volley first-touch, textbook form, boot at full extension toward camera, net about to ripple — scarlet and white",
  "Elite esports player at tournament stage, lit only by monitor glow, mechanical keyboard hand at peak keystroke — neon green on obsidian",
  "Rugby winger breaking a flying tackle, arm-off, hips dipped, try line just metres away — emerald and CB gold",
  "Tour de France climber out of the saddle on the final mountain pitch, legs at maximum power, crowd colour streaks on both sides — cobalt blue and yellow",
  "CS2 pro holding angle at a LAN final, rifle steady, the millisecond before the click that ends the match — CB orange on deep charcoal",
  "Championship sprinter in the finish-line lean, tape exploding across chest, pure velocity crystallised — track gold and deep purple",
  "UFC bantamweight spinning back kick landed at full extension, foot filling the foreground, opponent's reaction blurred behind — electric blue on black",
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

const PICTOGRAM_PROMPTS = [
  "Football — bold minimal icon, orange on dark purple",
  "Trophy cup — premium award icon, geometric style, CB gold palette",
  "Lightning bolt — energy and speed symbol, electric and direct",
  "Basketball — sport icon, clean geometric reduction, orange and blue",
  "Casino dice — two dice, graphic and bold, purple palette",
  "Boxing glove — sport pictogram, side profile, red and dark",
  "Tennis racket — simplified silhouette, strung face, clean lines",
  "Cricket bat — side view icon, minimal and bold, green and gold",
  "Racing helmet — F1 visor icon, side profile, blue and orange",
  "Dumbbell — gym/fitness icon, symmetric, chunky weights, bold stroke",
  "Star / rating badge — five-point geometric star, brand yellow",
  "Bitcoin coin — crypto symbol icon, orange circle, B mark in negative space",
  "Checkmark shield — security/trust badge, clean geometric tick in shield",
  "Crown — royalty icon, three-point crown, bold CB gold",
];

type Mode = "socials" | "illustration" | "pictogram";

interface SocialContext {
  subjectReferences?: Array<{ url: string; note: string }>;
  subjectReferenceUrl?: string;
  subjectReferenceNote?: string;
  description: string;
  suggestedChannels: string[];
  variantLabel: string;
  sourceJobDescription: string;
  isIllustration: boolean;
}

export function JobForm({ fromVariantId, fromJobId }: { fromVariantId?: string; fromJobId?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("illustration");
  const [description, setDescription] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [sizePreset, setSizePreset] = useState<string>("1:1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-reference upload state
  const [subjectRefs, setSubjectRefs] = useState<SubjectReference[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Angle reference upload state (single image, illustration mode only)
  const [angleRef, setAngleRef] = useState<AngleReference | null>(null);
  const [isAngleDragOver, setIsAngleDragOver] = useState(false);
  const angleFileInputRef = useRef<HTMLInputElement>(null);

  // Enhance prompt state
  const [isEnhancingBrief, setIsEnhancingBrief] = useState(false);
  const [enhancingRefIdx, setEnhancingRefIdx] = useState<number | null>(null);

  // "From illustration" pre-fill state
  const [socialContext, setSocialContext] = useState<SocialContext | null>(null);
  const [isContextLocked, setIsContextLocked] = useState(false);
  const [contextBannerDismissed, setContextBannerDismissed] = useState(false);

  // On mount: if fromVariantId is present, fetch and pre-fill
  useEffect(() => {
    if (!fromVariantId) return;
    (async () => {
      try {
        const res = await fetch(`/api/variants/${fromVariantId}/social-context`);
        if (!res.ok) return;
        const ctx: SocialContext = await res.json();
        setSocialContext(ctx);
        setMode("socials");
        setChannels(ctx.suggestedChannels);
        setDescription(ctx.description);
        // Support both new array format and legacy single fields
        const refs = ctx.subjectReferences && ctx.subjectReferences.length > 0
          ? ctx.subjectReferences
          : ctx.subjectReferenceUrl
          ? [{ url: ctx.subjectReferenceUrl, note: ctx.subjectReferenceNote ?? "" }]
          : [];
        if (refs.length > 0) {
          setSubjectRefs(refs.map(r => ({ url: r.url, note: r.note.slice(0, 2000), preview: r.url, locked: true })));
          setIsContextLocked(true);
        }
      } catch {
        // Silently fail — user can fill manually
      }
    })();
  }, [fromVariantId]);

  // On mount: if fromJobId is present, fetch that job and pre-fill all fields
  useEffect(() => {
    if (!fromJobId) return;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${fromJobId}`);
        if (!res.ok) return;
        const job = await res.json();
        setMode(job.mode as Mode);
        setDescription(job.description ?? "");
        setChannels(job.channels ?? []);
        // visualType values "1:1", "4:5", "16:9" map directly to sizePreset
        if (job.visualType && job.visualType !== "background-only") {
          setSizePreset(job.visualType);
        }
        // Subject references — support both array and legacy single fields
        const refs: Array<{ url: string; note: string }> =
          job.subjectReferences && job.subjectReferences.length > 0
            ? job.subjectReferences
            : job.subjectReferenceUrl
            ? [{ url: job.subjectReferenceUrl, note: job.subjectReferenceNote ?? "" }]
            : [];
        if (refs.length > 0) {
          setSubjectRefs(refs.map(r => ({ url: r.url, note: r.note.slice(0, 2000), preview: r.url })));
        }
        // Angle reference (illustration mode only)
        if (job.angleReference?.url) {
          setAngleRef({ url: job.angleReference.url, note: (job.angleReference.note ?? "").slice(0, 2000), preview: job.angleReference.url });
        }
      } catch {
        // Silently fail — user can fill manually
      }
    })();
  }, [fromJobId]);

  const handleShuffle = () => {
    const prompts = mode === "illustration" ? ILLUSTRATION_PROMPTS : mode === "pictogram" ? PICTOGRAM_PROMPTS : RANDOM_PROMPTS;
    let next = pickRandom(prompts);
    while (next === description && prompts.length > 1) next = pickRandom(prompts);
    setIsShuffle(true);
    setDescription(next);
    setTimeout(() => setIsShuffle(false), 400);
  };

  const enhanceBrief = async () => {
    if (!description.trim()) return;
    setIsEnhancingBrief(true);
    try {
      const res = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: description.trim(), mode, field: "brief" }),
      });
      if (!res.ok) throw new Error("Enhancement failed");
      const data = await res.json();
      if (data.enhanced) setDescription(data.enhanced);
    } catch { /* Silently fail */ }
    setIsEnhancingBrief(false);
  };

  const enhanceRefNote = async (idx: number) => {
    const note = subjectRefs[idx]?.note;
    if (!note?.trim()) return;
    setEnhancingRefIdx(idx);
    try {
      const res = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: note.trim(), mode, field: "reference" }),
      });
      if (!res.ok) throw new Error("Enhancement failed");
      const data = await res.json();
      if (data.enhanced) {
        setSubjectRefs(prev => prev.map((r, i) => i === idx ? { ...r, note: data.enhanced.slice(0, 2000) } : r));
      }
    } catch { /* Silently fail */ }
    setEnhancingRefIdx(null);
  };

  const toggleChannel = (channelId: string) => {
    setChannels((prev) =>
      prev.includes(channelId) ? prev.filter((c) => c !== channelId) : [...prev, channelId]
    );
  };

  const handleModeChange = (newMode: Mode) => {
    if (newMode === mode) return; // No-op if same mode — avoids clearing description on accidental re-click
    setMode(newMode);
    setDescription("");
    setError(null);
    if (newMode !== "illustration" && newMode !== "pictogram") {
      setSubjectRefs([]);
      setIsContextLocked(false);
    }
  };

  const uploadFiles = useCallback(async (files: File[]) => {
    const remaining = MAX_REFERENCES - subjectRefs.filter(r => !r.uploading).length;
    const toUpload = files.slice(0, remaining);
    if (toUpload.length === 0) return;

    // Add placeholder entries for each file immediately
    const placeholders: SubjectReference[] = toUpload.map(file => ({
      url: "",
      note: "",
      preview: URL.createObjectURL(file),
      uploading: true,
      error: null,
    }));
    setSubjectRefs(prev => [...prev, ...placeholders]);

    // Upload in parallel
    await Promise.all(toUpload.map(async (file, i) => {
      const idx = subjectRefs.filter(r => !r.uploading).length + i;
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/jobs/upload-reference", { method: "POST", body: formData });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Upload failed");
        }
        const data = await res.json();
        setSubjectRefs(prev => {
          // Find the placeholder (still uploading, same index position)
          const uploadingIdxs = prev.reduce<number[]>((acc, r, pi) => r.uploading ? [...acc, pi] : acc, []);
          const targetIdx = uploadingIdxs[i] ?? idx;
          return prev.map((r, pi) => pi === targetIdx ? { ...r, url: data.url, uploading: false } : r);
        });
      } catch (err) {
        setSubjectRefs(prev => {
          const uploadingIdxs = prev.reduce<number[]>((acc, r, pi) => r.uploading ? [...acc, pi] : acc, []);
          const targetIdx = uploadingIdxs[i] ?? idx;
          return prev.map((r, pi) => pi === targetIdx ? { ...r, uploading: false, error: err instanceof Error ? err.message : "Upload failed" } : r);
        });
      }
    }));
  }, [subjectRefs]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) uploadFiles(files);
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
      if (files.length > 0) uploadFiles(files);
    },
    [uploadFiles]
  );

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);

  const removeRef = (idx: number) => {
    setSubjectRefs(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        setIsContextLocked(false);
        setSocialContext(null);
      }
      return next;
    });
  };

  const updateRefNote = (idx: number, note: string) => {
    setSubjectRefs(prev => prev.map((r, i) => i === idx ? { ...r, note: note.slice(0, 2000) } : r));
  };

  const uploadAngleRef = useCallback(async (file: File) => {
    setAngleRef({ url: "", note: "", preview: URL.createObjectURL(file), uploading: true, error: null });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/jobs/upload-reference", { method: "POST", body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Upload failed");
      }
      const data = await res.json();
      setAngleRef(prev => prev ? { ...prev, url: data.url, uploading: false } : prev);
    } catch (err) {
      setAngleRef(prev => prev ? { ...prev, uploading: false, error: err instanceof Error ? err.message : "Upload failed" } : prev);
    }
  }, []);

  const handleAngleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files ?? []).find(f => f.type.startsWith("image/"));
    if (file) uploadAngleRef(file);
    e.target.value = "";
  };

  const handleAngleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsAngleDragOver(false);
      const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
      if (file) uploadAngleRef(file);
    },
    [uploadAngleRef]
  );

  const canAddMore = subjectRefs.length < MAX_REFERENCES;
  const isAnyUploading = subjectRefs.some(r => r.uploading) || (angleRef?.uploading ?? false);

  const handleSubmit = async () => {
    setError(null);

    // Read from DOM to avoid stale state (e.g. after Enhance updates async)
    const desc = (descriptionRef.current?.value ?? description).trim();
    if (!desc) {
      setError("Please enter a description");
      return;
    }
    if (mode === "socials" && channels.length === 0) {
      setError("Please select at least one channel");
      return;
    }
    if (isAnyUploading) {
      setError("Please wait for uploads to finish");
      return;
    }

    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        description: desc,
        mode,
        visualType: (mode === "illustration" || mode === "pictogram") ? sizePreset : "background-only",
        channels: (mode === "illustration" || mode === "pictogram") ? [] : channels,
      };

      // Attach references for illustration/pictogram mode, OR when context-locked (socials from illustration)
      const refsToSend = subjectRefs.filter(r => r.url && !r.error);
      if (refsToSend.length > 0 && (mode === "illustration" || mode === "pictogram" || isContextLocked)) {
        body.subjectReferences = refsToSend.map(r => ({ url: r.url, note: r.note.trim() }));
      }

      // Attach angle reference (illustration mode only)
      if (mode === "illustration" && angleRef?.url && !angleRef.error) {
        body.angleReference = { url: angleRef.url, note: angleRef.note.trim() };
      }

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = typeof errData.error === "string" ? errData.error : "Failed to create job";
        throw new Error(msg);
      }

      const data = await res.json();
      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Create New Job</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* "From illustration" context banner */}
        {socialContext && !contextBannerDismissed && (
          <div className="flex items-start gap-3 rounded-lg bg-secondary/10 border border-secondary/20 p-3">
            <Sparkles className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                Creating social from Variant {socialContext.variantLabel}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {socialContext.sourceJobDescription}
              </p>
              <p className="text-xs text-muted-foreground/70">
                The accepted illustration is pre-loaded as the hero subject — the social agent will pick a brand template and compose it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setContextBannerDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Mode selector */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {(["socials", "illustration", "pictogram"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  mode === m
                    ? "bg-secondary/25 text-foreground border-secondary/50 ring-1 ring-secondary/30"
                    : "hover:bg-muted/60 border-border text-muted-foreground"
                }`}
              >
                {m === "socials" ? "Social Post" : m === "illustration" ? "Illustration" : "Pictogram"}
              </button>
            ))}
          </div>
          {mode === "illustration" && (
            <p className="text-xs text-muted-foreground">
              Generates standalone character illustrations — no template, solid background, suitable for cutout use.
            </p>
          )}
          {mode === "pictogram" && (
            <p className="text-xs text-muted-foreground">
              Generates minimal geometric icons — single concept, bold shapes, flat fill, reads clearly at any size.
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="description">
              {mode === "illustration" ? "Illustration Brief" : mode === "pictogram" ? "Pictogram Brief" : "Description / Brief"}
            </Label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => enhanceBrief()}
                disabled={!description.trim() || isEnhancingBrief}
                  className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors rounded-md px-2 py-1 hover:bg-primary/10 disabled:opacity-40 disabled:pointer-events-none"
                title="Enhance with CB brand energy"
              >
                {isEnhancingBrief ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isEnhancingBrief ? "Enhancing..." : "Enhance"}
              </button>
              <button
                type="button"
                onClick={handleShuffle}
                className="flex items-center gap-1.5 text-xs text-foreground/70 font-medium hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-muted/60"
                title="Generate a random brief"
              >
                <Shuffle className={`h-3.5 w-3.5 transition-transform duration-300 ${isShuffle ? "rotate-180" : ""}`} />
                Random brief
              </button>
            </div>
          </div>
          <Textarea
            ref={descriptionRef}
            id="description"
            placeholder={
              mode === "illustration"
                ? "Describe the character or subject, e.g. 'Lionel Messi mid-dribble, explosive speed, electric blue palette'..."
                : mode === "pictogram"
                ? "Describe the icon concept, e.g. 'Football icon — bold silhouette, CB orange on dark purple'..."
                : "Describe the social post you need, e.g. 'Champions League matchday promo for CB with exciting odds callout'..."
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Channels (socials only) */}
        {mode === "socials" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {CHANNEL_OPTIONS.map((ch) => (
                <label
                  key={ch.id}
                  className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={channels.includes(ch.id)}
                    onCheckedChange={() => toggleChannel(ch.id)}
                  />
                  <div>
                    <div className="font-medium text-sm">{ch.label}</div>
                    <div className="text-xs text-muted-foreground">{ch.size}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Size preset (illustration and pictogram) */}
        {(mode === "illustration" || mode === "pictogram") && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSizePreset(preset.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    sizePreset === preset.id
                      ? "border-primary/60 bg-primary/10 ring-1 ring-primary/20 text-foreground"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <div className="font-medium text-sm">{preset.label}</div>
                  <div className="text-xs text-muted-foreground">{preset.size}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Angle reference — illustration mode only */}
        {mode === "illustration" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Angle Reference</Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload an image whose camera angle you want replicated. The AI will analyze the exact perspective and apply it to all illustration variants, overriding the default worm&apos;s-eye / foreshortened lunge angles.
            </p>

            {angleRef ? (
              <div className="rounded-lg border bg-muted/30 border-border overflow-hidden">
                <div className="flex items-start gap-3 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={angleRef.preview}
                    alt="Angle reference"
                    className="w-16 h-16 object-cover rounded-md border shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Angle Ref
                      </span>
                      {angleRef.uploading && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                        </span>
                      )}
                      {!angleRef.uploading && angleRef.url && !angleRef.error && (
                        <span className="text-xs text-accent">Ready</span>
                      )}
                      {angleRef.error && (
                        <span className="text-xs text-destructive">{angleRef.error}</span>
                      )}
                    </div>
                    {!angleRef.uploading && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">
                          Angle note <span className="opacity-60">(optional)</span>
                        </span>
                        <Textarea
                          value={angleRef.note}
                          onChange={e => setAngleRef(prev => prev ? { ...prev, note: e.target.value.slice(0, 2000) } : prev)}
                          placeholder={`e.g. "Match this exact low courtside angle" or "Replicate the overhead bird's-eye view"`}
                          rows={2}
                          className="resize-none text-sm"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAngleRef(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded shrink-0"
                    title="Remove angle reference"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => angleFileInputRef.current?.click()}
                onDrop={handleAngleDrop}
                onDragOver={e => { e.preventDefault(); setIsAngleDragOver(true); }}
                onDragLeave={() => setIsAngleDragOver(false)}
                className={`border-2 border-dashed rounded-lg cursor-pointer transition-all text-center p-4 ${
                  isAngleDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-4 w-4" />
                  <span className="text-sm">
                    {isAngleDragOver ? "Drop image here" : "Drop an image or click to browse"}
                  </span>
                </div>
              </div>
            )}

            <input
              ref={angleFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAngleFileSelect}
            />
          </div>
        )}

        {/* Subject references — illustration/pictogram mode OR socials pre-filled from illustration */}
        {(mode === "illustration" || mode === "pictogram" || isContextLocked) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Subject References</Label>
              <span className="text-xs text-muted-foreground">
                {subjectRefs.length}/{MAX_REFERENCES} · Optional
              </span>
            </div>

            {/* Uploaded references list */}
            {subjectRefs.length > 0 && (
              <div className="space-y-3">
                {subjectRefs.map((ref, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border overflow-hidden ${ref.locked ? "bg-secondary/5 border-secondary/20" : "bg-muted/30 border-border"}`}
                  >
                    <div className="flex items-start gap-3 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ref.preview}
                        alt={`Reference ${idx + 1}`}
                        className="w-16 h-16 object-cover rounded-md border shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Ref {idx + 1}
                          </span>
                          {ref.locked && (
                            <span className="text-xs text-secondary">Accepted illustration</span>
                          )}
                          {ref.uploading && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                            </span>
                          )}
                          {!ref.uploading && ref.url && !ref.error && !ref.locked && (
                            <span className="text-xs text-accent">Ready</span>
                          )}
                          {ref.error && (
                            <span className="text-xs text-destructive">{ref.error}</span>
                          )}
                        </div>
                        {!ref.uploading && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {ref.locked ? "Illustration instructions" : "Instructions for this reference"}
                                <span className="ml-1 opacity-60">(optional)</span>
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => enhanceRefNote(idx)}
                                  disabled={!ref.note.trim() || enhancingRefIdx === idx}
                                  className="flex items-center gap-1 text-xs text-primary font-medium hover:text-primary/80 transition-colors rounded px-1.5 py-0.5 hover:bg-primary/10 disabled:opacity-40 disabled:pointer-events-none"
                                >
                                  {enhancingRefIdx === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                  {enhancingRefIdx === idx ? "Enhancing…" : "Enhance"}
                                </button>
                                <span className="text-xs text-muted-foreground">{ref.note.length}/2000</span>
                              </div>
                            </div>
                            <Textarea
                              value={ref.note}
                              onChange={e => updateRefNote(idx, e.target.value)}
                              placeholder={
                                idx === 0
                                  ? `e.g. "Left fighter — red shorts, aggressive stance" or "Use the face and pose, CB orange kit"`
                                  : `e.g. "Right fighter — blue gloves, defensive posture" or "Environment inspiration — ignore the subjects"`
                              }
                              rows={2}
                              className="resize-none text-sm"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRef(idx)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded shrink-0"
                        title="Remove this reference"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Drop zone / Add more button */}
            {canAddMore && (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-lg cursor-pointer transition-all text-center ${
                  subjectRefs.length > 0 ? "p-4" : "p-6"
                } ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                }`}
              >
                {subjectRefs.length > 0 ? (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Plus className="h-4 w-4" />
                    <span className="text-sm">Add another reference ({subjectRefs.length}/{MAX_REFERENCES})</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      {isDragOver ? (
                        <ImageIcon className="h-5 w-5 text-primary" />
                      ) : (
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {isDragOver ? "Drop images here" : "Drop images or click to browse"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Up to {MAX_REFERENCES} references · JPEG, PNG, WebP, max 4MB each
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground italic max-w-xs">
                      {mode === "pictogram"
                        ? "Add reference photos for the icon concept — the AI extracts and stylises them"
                        : "Add players, fighters, athletes — the AI composes the scene from all references"}
                    </p>
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
            {error}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || isAnyUploading}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
          size="lg"
        >
          {isSubmitting
            ? "Creating Job..."
            : mode === "illustration"
            ? "Generate Illustrations"
            : mode === "pictogram"
            ? "Generate Pictograms"
            : "Generate"}
        </Button>
      </CardContent>
    </Card>
  );
}
