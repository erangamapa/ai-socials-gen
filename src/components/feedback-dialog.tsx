"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const SOCIALS_REJECT_REASONS = [
  "Off-brand palette",
  "Too busy / low clarity",
  "Wrong vibe",
  "Poor composition",
  "Not enough text-safe area",
  "Typography issues",
  "Bad subject quality",
  "Wrong channel sizing",
] as const;

const ILLUSTRATION_REJECT_REASONS = [
  "Off-brand palette",
  "Wrong style / not flat-vector",
  "Poor anatomy / proportions",
  "Wrong pose / energy",
  "Bad subject quality",
  "Too busy / low clarity",
  "Background issues",
  "Wrong vibe",
] as const;

const PICTOGRAM_REJECT_REASONS = [
  "Off-brand palette",
  "Wrong style / not flat-vector toon",
  "Poor shape clarity",
  "Wrong scale / proportions",
  "Background issues",
  "Too busy / low clarity",
  "Wrong vibe",
  "Bad subject quality",
] as const;

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variantId: string;
  variantLabel: string;
  jobMode?: string;
  onSubmitted: () => void;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  variantId,
  variantLabel,
  jobMode,
  onSubmitted,
}: FeedbackDialogProps) {
  const rejectReasons =
    jobMode === "pictogram"
      ? PICTOGRAM_REJECT_REASONS
      : jobMode === "illustration"
      ? ILLUSTRATION_REJECT_REASONS
      : SOCIALS_REJECT_REASONS;

  const [reasons, setReasons] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleReason = (reason: string) => {
    setReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleSubmit = async () => {
    if (reasons.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId,
          decision: "reject",
          reasons,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setReasons([]);
      setNotes("");
      setSubmitError(null);
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Reject {jobMode === "illustration" ? "Illustration" : jobMode === "pictogram" ? "Pictogram" : "Variant"} {variantLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select reason(s)</Label>
            <div className="space-y-2">
              {rejectReasons.map((reason) => (
                <label
                  key={reason}
                  className="flex items-center gap-3 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={reasons.includes(reason)}
                    onCheckedChange={() => toggleReason(reason)}
                  />
                  <span className="text-sm">{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Additional feedback..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {submitError && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {submitError}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={reasons.length === 0 || isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
