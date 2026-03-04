"use client";

import { useState } from "react";
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
import { EditDialog } from "./edit-dialog";
import { VariantData, ArtifactData } from "@/hooks/use-poll-job";
import { ArrowRight, Loader2, CheckCircle2, XCircle, Pencil } from "lucide-react";

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

export function VariantCard({ variant, jobMode, onFeedbackSubmitted }: VariantCardProps) {
  const router = useRouter();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [acceptNotes, setAcceptNotes] = useState("");
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);

  const isIllustration = jobMode === "illustration";
  const isPictogram = jobMode === "pictogram";
  const isStandalone = isIllustration || isPictogram;
  const latestFeedback = variant.feedback?.[0];
  const hasAccepted = latestFeedback?.decision === "accept";
  const hasRejected = latestFeedback?.decision === "reject";

  const finals = variant.artifacts.filter((a) => a.kind === "final_png");
  const allEdits = variant.artifacts
    .filter((a) => a.kind === "edited_png")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const edited = allEdits[allEdits.length - 1];
  const expanded = variant.artifacts.find((a) => a.kind === "expanded_png");

  // Hero priority: edited > expanded > final
  const heroArtifact: ArtifactData | undefined = edited || expanded || finals[0];
  const secondaryArtifacts = finals.slice(1);

  const handleAcceptClick = () => {
    setAcceptNotes("");
    setAcceptDialogOpen(true);
  };

  const submitAccept = async () => {
    setIsAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: variant.id,
          decision: "accept",
          reasons: [],
          notes: acceptNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setAcceptDialogOpen(false);
      onFeedbackSubmitted();
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Failed to submit");
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

  const handleUseInSocial = () => {
    router.push(`/create?fromVariant=${variant.id}`);
  };

  // ── Card border styling ──────────────────────────────────────────────────
  const cardClass = [
    "rounded-xl border overflow-hidden flex flex-col transition-all",
    hasAccepted ? "border-accent/60 ring-1 ring-accent/15" : "",
    hasRejected ? "border-destructive/40 opacity-60" : "",
    !hasAccepted && !hasRejected ? "border-border" : "",
  ].join(" ");

  if (variant.status === "failed") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 overflow-hidden">
        <div className="px-4 py-6 flex flex-col items-center gap-3 text-center">
          <XCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">Variant {variant.label} — Generation Failed</p>
            {variant.errorMessage && (
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">{variant.errorMessage}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

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

            {/* Variant label overlay */}
            <span className="absolute bottom-2 left-2 text-xs font-bold px-2 py-1 rounded-md bg-black/55 text-white backdrop-blur-sm">
              {variant.label}
            </span>

            {/* Channel badge (socials, no edits/expand) */}
            {!isStandalone && !expanded && !edited && heroArtifact.kind === "final_png" && heroArtifact.channel && (
              <span className="absolute bottom-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-md bg-black/60 text-white backdrop-blur-sm">
                {CHANNEL_LABELS[heroArtifact.channel] || heroArtifact.channel}
              </span>
            )}

            {/* Edited badge */}
            {edited && (
              <span className="absolute bottom-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-md text-white bg-primary/80">
                Edited ✎
              </span>
            )}

            {/* Expanded badge */}
            {expanded && !edited && (
              <span className="absolute bottom-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-md text-white bg-secondary/80">
                Expanded ✦
              </span>
            )}

            {/* Accepted indicator */}
            {hasAccepted && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-accent/90 text-accent-foreground text-xs font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Accepted
              </div>
            )}
            {/* Rejected indicator */}
            {hasRejected && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-destructive/90 text-white text-xs font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
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
              {heroArtifact.width}×{heroArtifact.height}
            </span>
          )}
          {!isStandalone && finals.map((a) => (
            <Badge key={a.id} variant="outline" className="text-xs">
              {CHANNEL_LABELS[a.channel] || a.channel}
            </Badge>
          ))}
          {isIllustration && (
            <Badge variant="secondary" className="text-xs">Illustration</Badge>
          )}
          {isPictogram && (
            <Badge variant="secondary" className="text-xs">Pictogram</Badge>
          )}
        </div>

        {/* ── Action area ── */}
        <div className="px-4 pb-4 pt-3 space-y-3">

          {/* Before decision: Accept / Reject */}
          {variant.status === "ready" && !hasAccepted && !hasRejected && (
            <div className="flex gap-2">
              <Button onClick={handleAcceptClick} disabled={isAccepting} className="flex-1" size="sm">
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

          {/* After accept */}
          {hasAccepted && (
            <div className="space-y-2">
              {/* Open Studio — primary action for all editing/exporting */}
              {isStandalone && (
                <Button
                  onClick={() => setStudioOpen(true)}
                  size="sm"
                  variant="outline"
                  className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/5 hover:border-primary/70"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Open Studio
                </Button>
              )}

              {/* Use in Social — illustration and pictogram */}
              {isStandalone && (
                <Button
                  onClick={handleUseInSocial}
                  size="sm"
                  variant="default"
                  className="w-full gap-2 bg-linear-to-r from-secondary to-primary hover:from-secondary/90 hover:to-primary/90 text-primary-foreground border-0"
                >
                  Use in Social Post
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}

          {/* After reject: reconsider */}
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

      {/* Studio dialog */}
      <EditDialog
        open={studioOpen}
        onOpenChange={setStudioOpen}
        variant={variant}
        jobMode={jobMode ?? "illustration"}
        onEdited={onFeedbackSubmitted}
      />

      <FeedbackDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        variantId={variant.id}
        variantLabel={variant.label}
        jobMode={jobMode}
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
          {acceptError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {acceptError}
            </p>
          )}
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
