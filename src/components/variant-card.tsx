"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "./job-status-badge";
import { ArtifactGrid } from "./artifact-grid";
import { FeedbackDialog } from "./feedback-dialog";
import { VariantData } from "@/hooks/use-poll-job";

interface VariantCardProps {
  variant: VariantData;
  onFeedbackSubmitted: () => void;
}

export function VariantCard({ variant, onFeedbackSubmitted }: VariantCardProps) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  const latestFeedback = variant.feedback?.[0];
  const hasAccepted = latestFeedback?.decision === "accept";
  const hasRejected = latestFeedback?.decision === "reject";

  const handleAccept = async () => {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId: variant.id,
        decision: "accept",
        reasons: [],
      }),
    });
    onFeedbackSubmitted();
  };

  return (
    <>
      <Card className={`overflow-hidden ${hasAccepted ? "border-green-500 ring-1 ring-green-500/30" : hasRejected ? "border-red-300 opacity-70" : ""}`}>
        <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b bg-muted/30">
          <CardTitle className="text-xl font-bold tracking-tight">Variant {variant.label}</CardTitle>
          <div className="flex items-center gap-3">
            <JobStatusBadge status={variant.status} />
            {hasAccepted && (
              <span className="text-sm text-green-600 font-semibold">✓ Accepted</span>
            )}
            {hasRejected && (
              <span className="text-sm text-red-500 font-semibold">✕ Rejected</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <ArtifactGrid artifacts={variant.artifacts} />

          {variant.status === "ready" && !hasAccepted && !hasRejected && (
            <div className="flex gap-3 pt-1">
              <Button onClick={handleAccept} className="flex-1" size="lg" variant="default">
                Accept
              </Button>
              <Button
                onClick={() => setRejectDialogOpen(true)}
                className="flex-1"
                size="lg"
                variant="outline"
              >
                Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <FeedbackDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        variantId={variant.id}
        variantLabel={variant.label}
        onSubmitted={onFeedbackSubmitted}
      />
    </>
  );
}
