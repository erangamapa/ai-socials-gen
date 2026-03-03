"use client";

import { use, useState } from "react";
import Link from "next/link";
import { usePollJob } from "@/hooks/use-poll-job";
import { JobStatusBadge } from "@/components/job-status-badge";
import { ChannelBadges } from "@/components/channel-badges";
import { VariantCard } from "@/components/variant-card";
import { SpecReview } from "@/components/spec-review";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, BookOpen, RotateCcw, Loader2, CheckCheck, Ban } from "lucide-react";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { job, isLoading, error, mutate } = usePollJob(id);
  const [showRulesSnapshot, setShowRulesSnapshot] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isBulkAccepting, setIsBulkAccepting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading job...</div>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-destructive">Failed to load job</div>
        <Link href="/create">
          <Button variant="outline">Back to Create</Button>
        </Link>
      </main>
    );
  }

  const handleApproved = () => {
    mutate({ ...job, status: "generating" }, false);
    const interval = setInterval(async () => {
      const updated = await mutate();
      if (updated && (updated.status === "ready" || updated.status === "failed")) {
        clearInterval(interval);
      }
    }, 2000);
  };

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">
              {job.status === "planned" ? "Review Prompts" : job.mode === "illustration" ? "Illustration Review" : "Job Review"}
            </h1>
            <JobStatusBadge status={job.status} />
            {job.mode === "illustration" && (
              <Badge variant="secondary">Illustration</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm max-w-xl">{job.description}</p>
          {job.mode !== "illustration" && (
            <div className="mt-2">
              <ChannelBadges channels={job.channels} />
            </div>
          )}
          {job.mode === "illustration" && job.visualType && (
            <p className="mt-1 text-xs text-muted-foreground">Size: {job.visualType}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/create">
            <Button variant="outline" size="sm">
              New Job
            </Button>
          </Link>
          <Link href="/library">
            <Button variant="outline" size="sm">
              Library
            </Button>
          </Link>
        </div>
      </div>

      {job.status === "failed" && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          {job.errorMessage && (
            <p className="text-sm text-destructive mb-3">
              <span className="font-medium">Error:</span> {job.errorMessage}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
            disabled={isRetrying}
            onClick={async () => {
              setIsRetrying(true);
              try {
                const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
                if (res.ok) {
                  mutate({ ...job, status: "queued", errorMessage: null }, false);
                }
              } finally {
                setIsRetrying(false);
              }
            }}
          >
            {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Retry Job
          </Button>
        </div>
      )}

      {job.rulesSnapshot && (
        <div className="mb-6">
          <button
            onClick={() => setShowRulesSnapshot(!showRulesSnapshot)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRulesSnapshot ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <BookOpen className="h-4 w-4" />
            <span>Rules Snapshot (v{job.rulesVersion ?? "?"})</span>
          </button>
          {showRulesSnapshot && (
            <pre className="mt-2 p-4 bg-muted/30 border border-border rounded-lg text-xs text-muted-foreground whitespace-pre-wrap max-h-80 overflow-y-auto font-mono leading-relaxed">
              {job.rulesSnapshot}
            </pre>
          )}
        </div>
      )}

      {(job.status === "queued" || job.status === "running") && (
        <div className="mb-6 p-6 border rounded-lg text-center space-y-3">
          <div className="animate-pulse mb-2">
            <div className="h-4 w-4 rounded-full bg-secondary mx-auto" />
          </div>
          <p className="text-sm text-muted-foreground">
            {job.status === "queued"
              ? "Job is queued and will start shortly..."
              : "Claude is planning your variants — this may take a moment..."}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            disabled={isCancelling}
            onClick={async () => {
              setIsCancelling(true);
              try {
                const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
                if (res.ok) mutate();
              } finally {
                setIsCancelling(false);
              }
            }}
          >
            {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Cancel
          </Button>
        </div>
      )}

      {job.status === "generating" && (
        <div className="mb-6 p-6 border rounded-lg text-center space-y-3">
          <div className="animate-pulse mb-2">
            <div className="h-4 w-4 rounded-full bg-secondary mx-auto" />
          </div>
          <p className="text-sm text-muted-foreground">
            Generating images with Nano Banana — this may take a minute...
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            disabled={isCancelling}
            onClick={async () => {
              setIsCancelling(true);
              try {
                const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
                if (res.ok) mutate();
              } finally {
                setIsCancelling(false);
              }
            }}
          >
            {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Cancel
          </Button>
        </div>
      )}

      {job.status === "planned" && (
        <SpecReview
          jobId={job.id}
          variants={job.variants}
          jobMode={job.mode}
          subjectReferenceUrl={job.subjectReferenceUrl}
          subjectReferenceNote={job.subjectReferenceNote}
          retrievalBundle={job.retrievalBundle}
          onApproved={handleApproved}
        />
      )}

      {job.status === "ready" && (() => {
        const unreviewedVariants = job.variants.filter((v) => {
          const latest = v.feedback?.[0];
          return v.status === "ready" && !latest;
        });
        const showBulkActions = unreviewedVariants.length > 1;

        return (
          <div className="space-y-4">
            {showBulkActions && (
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={isBulkAccepting}
                  onClick={async () => {
                    setIsBulkAccepting(true);
                    try {
                      for (const v of unreviewedVariants) {
                        await fetch("/api/feedback", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ variantId: v.id, decision: "accept", reasons: [] }),
                        });
                      }
                      mutate();
                    } finally {
                      setIsBulkAccepting(false);
                    }
                  }}
                >
                  {isBulkAccepting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                  Accept All ({unreviewedVariants.length})
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-4 md:grid md:grid-cols-3">
              {job.variants.map((variant) => (
                <VariantCard
                  key={variant.id}
                  variant={variant}
                  jobMode={job.mode}
                  jobId={job.id}
                  onFeedbackSubmitted={() => mutate()}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </main>
  );
}
