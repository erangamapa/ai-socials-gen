"use client";

import { use } from "react";
import Link from "next/link";
import { usePollJob } from "@/hooks/use-poll-job";
import { JobStatusBadge } from "@/components/job-status-badge";
import { ChannelBadges } from "@/components/channel-badges";
import { VariantCard } from "@/components/variant-card";
import { SpecReview } from "@/components/spec-review";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { job, isLoading, error, mutate } = usePollJob(id);

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

      {job.status === "failed" && job.errorMessage && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <span className="font-medium">Error:</span> {job.errorMessage}
          </p>
        </div>
      )}

      {(job.status === "queued" || job.status === "running") && (
        <div className="mb-6 p-6 border rounded-lg text-center">
          <div className="animate-pulse mb-2">
            <div className="h-4 w-4 rounded-full bg-secondary mx-auto" />
          </div>
          <p className="text-sm text-muted-foreground">
            {job.status === "queued"
              ? "Job is queued and will start shortly..."
              : "Claude is planning your variants — this may take a moment..."}
          </p>
        </div>
      )}

      {job.status === "generating" && (
        <div className="mb-6 p-6 border rounded-lg text-center">
          <div className="animate-pulse mb-2">
            <div className="h-4 w-4 rounded-full bg-secondary mx-auto" />
          </div>
          <p className="text-sm text-muted-foreground">
            Generating images with Nano Banana — this may take a minute...
          </p>
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

      {job.status === "ready" && (
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
      )}
    </main>
  );
}
