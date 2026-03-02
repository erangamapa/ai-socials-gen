"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "./job-status-badge";
import { ChannelBadges } from "./channel-badges";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ArtifactThumb {
  id: string;
  url: string;
  width: number;
  height: number;
  channel: string;
}

interface LibraryVariant {
  id: string;
  label: string;
  status: string;
  feedback: { decision: string }[];
  artifacts: ArtifactThumb[];
}

interface LibraryJob {
  id: string;
  description: string;
  channels: string[];
  visualType: string;
  status: string;
  mode: string;
  subjectReferenceUrl: string | null;
  subjectReferenceNote: string | null;
  createdAt: string;
  variants: LibraryVariant[];
}

interface LibraryResponse {
  items: LibraryJob[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Variant thumbnail strip ─────────────────────────────────────────────────

function VariantThumbs({
  variants,
  jobStatus,
}: {
  variants: LibraryVariant[];
  jobStatus: string;
}) {
  const hasImages = variants.some((v) => (v.artifacts ?? []).length > 0);

  if (!hasImages) {
    return (
      <div className="flex gap-1.5 h-36 items-stretch">
        {["A", "B", "C"].map((label) => (
          <div
            key={label}
            className="flex-1 rounded-lg bg-muted flex flex-col items-center justify-center gap-1.5 border border-border/50"
          >
            <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest">
              {label}
            </span>
            {jobStatus === "generating" && (
              <span className="w-3 h-3 rounded-full bg-purple-400 animate-pulse" />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      {variants.map((v) => {
        const art = (v.artifacts ?? [])[0];
        const decision = (v.feedback ?? [])[0]?.decision;
        const ringClass =
          decision === "accept"
            ? "ring-2 ring-green-500"
            : decision === "reject"
            ? "ring-2 ring-red-400"
            : "";

        return (
          <div
            key={v.id}
            className={`flex-1 relative rounded-lg overflow-hidden border ${ringClass}`}
          >
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={art.url}
                alt={`Variant ${v.label}`}
                className="w-full h-full object-cover"
                style={{
                  aspectRatio: `${art.width}/${art.height}`,
                  maxHeight: "160px",
                }}
              />
            ) : (
              <div className="h-36 bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground/50 font-semibold">
                  {v.label}
                </span>
              </div>
            )}
            {/* Variant label pill */}
            <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-white backdrop-blur-sm">
              {v.label}
            </span>
            {decision === "accept" && (
              <span className="absolute top-1.5 right-1.5 text-[10px] font-bold px-1 py-0.5 rounded bg-green-500 text-white">
                ✓
              </span>
            )}
            {decision === "reject" && (
              <span className="absolute top-1.5 right-1.5 text-[10px] font-bold px-1 py-0.5 rounded bg-red-500 text-white">
                ✗
              </span>
            )}
          </div>
        );
      })}
      {/* Pad with empty slots if fewer than 3 variants */}
      {Array.from({ length: Math.max(0, 3 - variants.length) }).map((_, i) => (
        <div
          key={`pad-${i}`}
          className="flex-1 rounded-lg bg-muted/30 border border-dashed border-border/40 h-36"
        />
      ))}
    </div>
  );
}

// ── Job card ─────────────────────────────────────────────────────────────────
// Uses CSS subgrid so every card in the same row shares identical row heights:
//   row-span-2 on the card + [grid-template-rows:subgrid] makes the browser
//   size "info" and "thumbnails" rows consistently across the whole band.

function JobCard({ job }: { job: LibraryJob }) {
  const isIllustration = job.mode === "illustration";

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="row-span-2 grid grid-rows-subgrid rounded-xl border bg-card hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer overflow-hidden group"
    >
      {/* ── Row 1: info ── */}
      <div className="flex flex-col p-4 pb-3 gap-2.5">
        {/* Badges + date */}
        <div className="flex items-center gap-2 flex-wrap">
          <JobStatusBadge status={job.status} />
          {isIllustration ? (
            <Badge
              variant="outline"
              className="text-xs border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300"
            >
              Illustration
            </Badge>
          ) : (
            <ChannelBadges channels={job.channels} />
          )}
          {isIllustration && job.visualType && (
            <span className="text-xs text-muted-foreground">{job.visualType}</span>
          )}
          <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
            {formatDate(job.createdAt)}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm font-medium leading-snug line-clamp-2 text-foreground/90">
          {job.description}
        </p>

        {/* Subject reference */}
        {job.subjectReferenceUrl && (
          <div className="flex items-start gap-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={job.subjectReferenceUrl}
              alt="Reference"
              className="w-9 h-9 rounded object-cover shrink-0 border border-violet-200 dark:border-violet-700"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-0.5">
                Subject reference
              </p>
              {job.subjectReferenceNote ? (
                <p className="text-xs text-violet-700 dark:text-violet-300 italic line-clamp-2">
                  &ldquo;{job.subjectReferenceNote}&rdquo;
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Reference image attached</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Row 2: thumbnails ── */}
      <div className="px-3 pb-3 pt-0">
        <VariantThumbs variants={job.variants} jobStatus={job.status} />
      </div>
    </Link>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function LibraryTable() {
  const [jobs, setJobs] = useState<LibraryJob[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const fetchJobs = useCallback(
    async (cursor?: string) => {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/library?${params}`);
      if (!res.ok) {
        console.error(`Library API error: ${res.status}`);
        setIsLoading(false);
        return;
      }
      const data: LibraryResponse = await res.json();

      if (cursor) {
        setJobs((prev) => [...prev, ...(data.items ?? [])]);
      } else {
        setJobs(data.items ?? []);
      }
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
      setIsLoading(false);
    },
    [statusFilter, channelFilter]
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="generating">Generating</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="twitter">Twitter / X</SelectItem>
            <SelectItem value="ig_feed">IG Feed</SelectItem>
          </SelectContent>
        </Select>

        {(statusFilter !== "all" || channelFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("all");
              setChannelFilter("all");
            }}
            className="text-xs text-muted-foreground"
          >
            Clear filters ×
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && jobs.length === 0 && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border bg-card overflow-hidden animate-pulse"
            >
              <div className="p-4 space-y-2">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
              <div className="h-36 bg-muted mx-3 mb-3 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Card grid — row-span-2 + subgrid aligns info / thumbnail rows across cards */}
      {jobs.length > 0 && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <p className="text-muted-foreground text-sm">No jobs found</p>
          <Link href="/create">
            <Button size="sm">Create your first job</Button>
          </Link>
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => nextCursor && fetchJobs(nextCursor)}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
