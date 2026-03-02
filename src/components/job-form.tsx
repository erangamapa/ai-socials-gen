"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shuffle, Upload, X, ImageIcon, Loader2 } from "lucide-react";

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
  "Lionel Messi mid-dribble, explosive speed, electric blue and gold colour scheme",
  "UFC heavyweight fighter in victory pose, arms raised, intense expression",
  "Basketball player dunking with authority, dramatic low-angle, orange and purple palette",
  "Tennis player serving at full extension, white and electric blue, stadium lights",
  "Formula 1 driver in helmet, visor down, dramatic side profile, racing suit",
  "Cricket batsman mid-sweep shot, dynamic foreshortening, green and gold",
  "Boxer mid-combination, sweat flying, dark dramatic lighting, red gloves",
  "Footballer celebrating a goal, sliding knee, arms wide, dramatic expression",
  "Snowboarder mid-trick, airborne, mountain peak background, cool blue tones",
  "Sprinter at full pace, finish line tape breaking, gold and navy",
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

type Mode = "socials" | "illustration";

export function JobForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("socials");
  const [description, setDescription] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [sizePreset, setSizePreset] = useState<string>("1:1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subject reference upload state
  const [subjectReferenceUrl, setSubjectReferenceUrl] = useState<string | null>(null);
  const [subjectReferenceNote, setSubjectReferenceNote] = useState<string>("");
  const [subjectPreview, setSubjectPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleShuffle = () => {
    const prompts = mode === "illustration" ? ILLUSTRATION_PROMPTS : RANDOM_PROMPTS;
    let next = pickRandom(prompts);
    while (next === description && prompts.length > 1) next = pickRandom(prompts);
    setIsShuffle(true);
    setDescription(next);
    setTimeout(() => setIsShuffle(false), 400);
  };

  const toggleChannel = (channelId: string) => {
    setChannels((prev) =>
      prev.includes(channelId) ? prev.filter((c) => c !== channelId) : [...prev, channelId]
    );
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setDescription("");
    setError(null);
    // Clear upload when switching away from illustration
    if (newMode !== "illustration") {
      setSubjectReferenceUrl(null);
      setSubjectPreview(null);
      setSubjectReferenceNote("");
    }
  };

  const uploadFile = useCallback(async (file: File) => {
    setUploadError(null);
    setIsUploading(true);

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setSubjectPreview(objectUrl);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/jobs/upload-reference", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Upload failed");
      }

      const data = await res.json();
      setSubjectReferenceUrl(data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setSubjectPreview(null);
      setSubjectReferenceUrl(null);
      URL.revokeObjectURL(objectUrl);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) uploadFile(file);
    },
    [uploadFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const clearSubjectReference = () => {
    setSubjectReferenceUrl(null);
    setSubjectPreview(null);
    setSubjectReferenceNote("");
    setUploadError(null);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!description.trim()) {
      setError("Please enter a description");
      return;
    }
    if (mode === "socials" && channels.length === 0) {
      setError("Please select at least one channel");
      return;
    }

    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        description,
        mode,
        visualType: mode === "illustration" ? sizePreset : "background-only",
        channels: mode === "illustration" ? [] : channels,
      };

      if (mode === "illustration" && subjectReferenceUrl) {
        body.subjectReferenceUrl = subjectReferenceUrl;
        if (subjectReferenceNote.trim()) {
          body.subjectReferenceNote = subjectReferenceNote.trim();
        }
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

        {/* Mode selector */}
        <div className="space-y-2">
          <Label>Mode</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["socials", "illustration"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  mode === m
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted/60 border-border"
                }`}
              >
                {m === "socials" ? "Social Post" : "Illustration"}
              </button>
            ))}
            <button
              type="button"
              disabled
              className="rounded-lg border px-4 py-2.5 text-sm font-medium opacity-35 cursor-not-allowed border-border"
              title="Coming soon"
            >
              Pictogram
            </button>
          </div>
          {mode === "illustration" && (
            <p className="text-xs text-muted-foreground">
              Generates standalone character illustrations — no template, solid background, suitable for cutout use.
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="description">
              {mode === "illustration" ? "Illustration Brief" : "Description / Brief"}
            </Label>
            <button
              type="button"
              onClick={handleShuffle}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-muted/60"
              title="Generate a random brief"
            >
              <Shuffle className={`h-3.5 w-3.5 transition-transform duration-300 ${isShuffle ? "rotate-180" : ""}`} />
              Random brief
            </button>
          </div>
          <Textarea
            id="description"
            placeholder={
              mode === "illustration"
                ? "Describe the character or subject, e.g. 'Lionel Messi mid-dribble, explosive speed, electric blue palette'..."
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
            <Label>Output Channels</Label>
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

        {/* Size preset (illustration only) */}
        {mode === "illustration" && (
          <div className="space-y-3">
            <Label>Output Size</Label>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSizePreset(preset.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    sizePreset === preset.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="font-medium text-sm">{preset.label}</div>
                  <div className="text-xs text-muted-foreground">{preset.size}</div>
                  <div className="text-xs text-muted-foreground">{preset.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subject reference upload (illustration only) */}
        {mode === "illustration" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Subject Reference</Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>

            {subjectPreview ? (
              <div className="space-y-3">
                <div className="relative rounded-lg border overflow-hidden bg-muted/30">
                  <div className="flex items-start gap-3 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={subjectPreview}
                      alt="Subject reference"
                      className="w-20 h-20 object-cover rounded-md border shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Subject reference uploaded</p>
                      {isUploading && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Uploading...
                        </div>
                      )}
                      {subjectReferenceUrl && !isUploading && (
                        <p className="text-xs text-green-600 mt-1">Ready — will be sent to image generator as first reference</p>
                      )}
                      {uploadError && (
                        <p className="text-xs text-red-500 mt-1">{uploadError}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={clearSubjectReference}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                      title="Remove reference"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {!isUploading && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="subject-note" className="text-xs font-medium">
                        Reference instructions
                        <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <span className="text-xs text-muted-foreground">{subjectReferenceNote.length}/500</span>
                    </div>
                    <Textarea
                      id="subject-note"
                      value={subjectReferenceNote}
                      onChange={(e) => setSubjectReferenceNote(e.target.value.slice(0, 500))}
                      placeholder={`What should the AI do with this reference?\ne.g. "Use the face and stance but dress him in CB orange"\nor "Keep the fighting pose, make it more aggressive, purple palette"\nor "Capture the athlete's build, dramatic low-angle, ignore background"`}
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-lg p-6 cursor-pointer transition-all text-center ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    {isUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : isDragOver ? (
                      <ImageIcon className="h-5 w-5 text-primary" />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {isDragOver ? "Drop image here" : "Drop image or click to browse"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Player photo, fighter, athlete, or any subject — JPEG, PNG, WebP, max 4MB
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground italic max-w-xs">
                    The AI captures their likeness and translates it into CB illustration style
                  </p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />

            {uploadError && !subjectPreview && (
              <p className="text-xs text-red-500">{uploadError}</p>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-3">
            {error}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || isUploading}
          className="w-full"
          size="lg"
        >
          {isSubmitting
            ? "Creating Job..."
            : mode === "illustration"
            ? "Generate Illustrations"
            : "Generate"}
        </Button>
      </CardContent>
    </Card>
  );
}
