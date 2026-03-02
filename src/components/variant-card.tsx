"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FeedbackDialog } from "./feedback-dialog";
import { VariantData, ArtifactData } from "@/hooks/use-poll-job";
import { Download, Expand, ArrowRight, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";

const CHANNEL_LABELS: Record<string, string> = {
  twitter: "Twitter / X",
  ig_feed: "IG Feed",
  ig_story: "IG Story",
  email_header: "Email",
  illustration: "Illustration",
};

interface VariantCardProps {
  variant: VariantData;
  jobMode?: string;
  jobId: string;
  onFeedbackSubmitted: () => void;
}

export function VariantCard({ variant, jobMode, jobId, onFeedbackSubmitted }: VariantCardProps) {
  const router = useRouter();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [acceptNotes, setAcceptNotes] = useState("");
  const [isAccepting, setIsAccepting] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [justExpanded, setJustExpanded] = useState(false);
  const expandPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevExpandedRef = useRef<string | undefined>(undefined);

  const isIllustration = jobMode === "illustration";
  const latestFeedback = variant.feedback?.[0];
  const hasAccepted = latestFeedback?.decision === "accept";
  const hasRejected = latestFeedback?.decision === "reject";

  const finals = variant.artifacts.filter((a) => a.kind === "final_png");
  const expanded = variant.artifacts.find((a) => a.kind === "expanded_png");
  const heroArtifact: ArtifactData | undefined =
    (expanded && !showOriginal) ? expanded : finals[0];
  const secondaryArtifacts = finals.slice(1);

  const startExpandPolling = useCallback(() => {
    if (expandPollRef.current) return;
    expandPollRef.current = setInterval(() => {
      onFeedbackSubmitted();
    }, 3000);
  }, [onFeedbackSubmitted]);

  // Detect when expanded_png first appears — stop polling + show success flash
  useEffect(() => {
    if (expanded && !prevExpandedRef.current) {
      if (expandPollRef.current) {
        clearInterval(expandPollRef.current);
        expandPollRef.current = null;
      }
      setIsExpanding(false);
      setJustExpanded(true);
      const timer = setTimeout(() => setJustExpanded(false), 3000);
      return () => clearTimeout(timer);
    }
    prevExpandedRef.current = expanded?.id;
  }, [expanded]);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (expandPollRef.current) clearInterval(expandPollRef.current);
    };
  }, []);

  const handleAcceptClick = () => {
    setAcceptNotes("");
    setAcceptDialogOpen(true);
  };

  const submitAccept = async () => {
    setIsAccepting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: variant.id,
          decision: "accept",
          reasons: [],
          notes: acceptNotes.trim() || undefined,
        }),
      });
      setAcceptDialogOpen(false);
      onFeedbackSubmitted();
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReconsider = async () => {
    await fetch("/api/feedback", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId: variant.id }),
    });
    onFeedbackSubmitted();
  };

  const handleExpand = async () => {
    if (!finals[0]) return;
    setExpandError(null);
    setIsExpanding(true);

    try {
      const res = await fetch(`/api/artifacts/${finals[0].id}/expand`, {
        method: "POST",
      });

      if (res.status === 409) {
        // Already expanded (or in-flight) — just re-poll to pick up the result
        onFeedbackSubmitted();
        startExpandPolling();
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Expand failed");
      }

      startExpandPolling();
    } catch (err) {
      setIsExpanding(false);
      setExpandError(err instanceof Error ? err.message : "Expand failed");
    }
  };

  const handleUseInSocial = () => {
    router.push(`/create?fromVariant=${variant.id}`);
  };

  const downloadUrl = (artifact: ArtifactData) => artifact.url;

  // ── Card border styling ──────────────────────────────────────────────────
  const cardClass = [
    "rounded-xl border overflow-hidden flex flex-col transition-all",
    hasAccepted ? "border-green-500 shadow-[0_0_0_1px_rgba(34,197,94,0.2)]" : "",
    hasRejected ? "border-red-300 opacity-60" : "",
    !hasAccepted && !hasRejected ? "border-border" : "",
  ].join(" ");

  return (
    <>
      <div className={cardClass}>
        {/* ── Hero image — full bleed ── */}
        {heroArtifact ? (
          <div className="relative overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={heroArtifact.id}
              src={heroArtifact.url}
              alt={`Variant ${variant.label}`}
              className="w-full h-auto block transition-opacity duration-500 ease-out"
              style={{ aspectRatio: `${heroArtifact.width}/${heroArtifact.height}` }}
            />

            {/* Expanding shimmer overlay */}
            {isExpanding && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 backdrop-blur-[2px]">
                <div className="absolute inset-0 animate-pulse bg-linear-to-r from-transparent via-white/10 to-transparent" />
                <Loader2 className="h-8 w-8 text-white animate-spin" />
                <span className="text-sm font-medium text-white drop-shadow-md">
                  Expanding canvas...
                </span>
                <span className="text-[11px] text-white/70">
                  Recovering cropped edges — this may take a minute
                </span>
              </div>
            )}

            {/* Variant label overlay */}
            <span className="absolute bottom-2 left-2 text-xs font-bold px-2 py-1 rounded-md bg-black/55 text-white backdrop-blur-sm">
              {variant.label}
            </span>

            {/* Expanded badge (enhanced on first appearance) */}
            {expanded && !showOriginal && (
              <span
                className={[
                  "absolute bottom-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-md text-white transition-all duration-700",
                  justExpanded
                    ? "bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.6)] scale-110"
                    : "bg-violet-600",
                ].join(" ")}
              >
                {justExpanded ? "Expanded!" : "Expanded"} ✦
              </span>
            )}

            {/* Viewing original indicator */}
            {expanded && showOriginal && (
              <span className="absolute bottom-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-md bg-black/60 text-white/80 backdrop-blur-sm">
                Original
              </span>
            )}

            {/* Accepted indicator */}
            {hasAccepted && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/90 text-white text-xs font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Accepted
              </div>
            )}
            {/* Rejected indicator */}
            {hasRejected && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-500/90 text-white text-xs font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                <XCircle className="h-3.5 w-3.5" />
                Rejected
              </div>
            )}
          </div>
        ) : (
          <div className="bg-muted flex items-center justify-center h-48">
            <span className="text-muted-foreground/50 text-sm">Generating...</span>
          </div>
        )}

        {/* ── Secondary artifacts (socials multi-channel) ── */}
        {secondaryArtifacts.length > 0 && (
          <div className="px-3 pt-2 space-y-2">
            {secondaryArtifacts.map((art) => (
              <div key={art.id} className="relative rounded-md overflow-hidden border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={art.url}
                  alt={art.channel}
                  className="w-full h-auto block"
                  style={{ aspectRatio: `${art.width}/${art.height}` }}
                />
                <div className="absolute bottom-1.5 left-1.5">
                  <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur-sm">
                    {CHANNEL_LABELS[art.channel] || art.channel}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Meta row ── */}
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap border-t border-border/50 bg-muted/20">
          {heroArtifact && (
            <span className="text-xs text-muted-foreground">
              {expanded && finals[0] ? (
                showOriginal ? (
                  <>{finals[0].width}×{finals[0].height}</>
                ) : (
                  <>
                    <span className="line-through opacity-50">{finals[0].width}×{finals[0].height}</span>
                    {" → "}
                    <span className="text-violet-600 dark:text-violet-400 font-medium">{expanded.width}×{expanded.height}</span>
                  </>
                )
              ) : (
                <>{heroArtifact.width}×{heroArtifact.height}</>
              )}
            </span>
          )}
          {!isIllustration && finals[0] && (
            <Badge variant="outline" className="text-xs">
              {CHANNEL_LABELS[finals[0].channel] || finals[0].channel}
            </Badge>
          )}
          {isIllustration && (
            <Badge variant="outline" className="text-xs border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300">
              Illustration
            </Badge>
          )}
        </div>

        {/* ── Action area ── */}
        <div className="px-4 pb-4 pt-3 space-y-3">

          {/* Before decision: Accept / Reject */}
          {variant.status === "ready" && !hasAccepted && !hasRejected && (
            <div className="flex gap-2">
              <Button
                onClick={handleAcceptClick}
                disabled={isAccepting}
                className="flex-1"
                size="sm"
              >
                Accept
              </Button>
              <Button
                onClick={() => setRejectDialogOpen(true)}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Reject
              </Button>
            </div>
          )}

          {/* After accept: post-accept action bar */}
          {hasAccepted && (finals[0] || expanded) && (
            <div className="space-y-2">
              {/* Before/after toggle (only when expanded exists) */}
              {isIllustration && expanded && finals[0] && (
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className="w-full flex items-center justify-center gap-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md border border-dashed border-border/60 hover:border-border"
                >
                  {showOriginal ? (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      Viewing original — click to see expanded
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      Viewing expanded — click to see original
                    </>
                  )}
                </button>
              )}

              {/* Primary actions */}
              <div className="flex gap-2">
                {/* Download (whichever is currently displayed) */}
                <a
                  href={downloadUrl(expanded && !showOriginal ? expanded : finals[0]!)}
                  download={`variant-${variant.label}${expanded && !showOriginal ? "-expanded" : ""}.png`}
                  className="flex-1"
                >
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    {expanded && !showOriginal ? "Download Expanded" : "Download"}
                  </Button>
                </a>

                {/* Expand (illustration only, not yet expanded) */}
                {isIllustration && !expanded && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExpand}
                    disabled={isExpanding}
                    className="flex-1 gap-1.5"
                    title="Expand canvas by ~28% to recover any cropped edges"
                  >
                    {isExpanding ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Expanding...
                      </>
                    ) : (
                      <>
                        <Expand className="h-3.5 w-3.5" />
                        Expand
                      </>
                    )}
                  </Button>
                )}

                {/* Download the other version when expanded exists */}
                {isIllustration && expanded && finals[0] && (
                  <a
                    href={downloadUrl(showOriginal ? expanded : finals[0])}
                    download={`variant-${variant.label}${showOriginal ? "-expanded" : "-original"}.png`}
                    className="flex-1"
                  >
                    <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground text-xs">
                      <Download className="h-3 w-3" />
                      {showOriginal ? "Expanded" : "Original"}
                    </Button>
                  </a>
                )}
              </div>

              {/* Expand error */}
              {expandError && (
                <p className="text-xs text-red-500">{expandError}</p>
              )}

              {/* Use in Social — illustration only */}
              {isIllustration && (
                <Button
                  onClick={handleUseInSocial}
                  size="sm"
                  variant="default"
                  className="w-full gap-2 bg-linear-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white border-0"
                >
                  Use in Social Post
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}

          {/* After reject: greyed out + reconsider */}
          {hasRejected && (
            <button
              type="button"
              onClick={handleReconsider}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 underline underline-offset-2"
            >
              Reconsider
            </button>
          )}
        </div>
      </div>

      <FeedbackDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        variantId={variant.id}
        variantLabel={variant.label}
        onSubmitted={onFeedbackSubmitted}
      />

      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Accept Variant {variant.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="accept-notes">What worked? (optional)</Label>
            <Textarea
              id="accept-notes"
              placeholder="e.g. Great pose energy, colours are on brand..."
              value={acceptNotes}
              onChange={(e) => setAcceptNotes(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Positive notes help the AI learn what to repeat in future generations.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setAcceptDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitAccept} disabled={isAccepting}>
              {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
