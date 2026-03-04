"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobStatusBadge } from "./job-status-badge";
import { ChannelBadges } from "./channel-badges";
import { Badge } from "@/components/ui/badge";
import { Search, Copy } from "lucide-react";
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
  subjectReferences: Array<{ url: string; note: string }> | null;
  createdAt: string;
  variants: LibraryVariant[];
}

interface LibraryResponse {
  items: LibraryJob[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Variant thumbnails (2-variant row layout) ───────────────────────────────

const VARIANT_COUNT = 2;

function VariantThumbs({
  variants,
  jobStatus,
}: {
  variants: LibraryVariant[];
  jobStatus: string;
}) {
  const hasImages = variants.some((v) => (v.artifacts ?? []).length > 0);

  return (
    <div className="flex gap-2 h-full">
      {hasImages
        ? variants.map((v) => {
            const art = (v.artifacts ?? [])[0];
            const decision = (v.feedback ?? [])[0]?.decision;
            const isAccepted = decision === "accept";
            const isRejected = decision === "reject";
            return (
              <div
                key={v.id}
                className={`relative rounded-lg overflow-hidden flex-1 min-w-0 min-h-[120px] border ${
                  isAccepted
                    ? "ring-2 ring-accent border-accent/40"
                    : isRejected
                    ? "ring-2 ring-destructive/60 border-destructive/30"
                    : "border-border/40"
                }`}
              >
                {art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={art.url}
                    alt={`Variant ${v.label}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-muted flex items-center justify-center">
                    <span className="text-xs text-muted-foreground/50 font-semibold">{v.label}</span>
                  </div>
                )}
                <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-sm leading-none">
                  {v.label}
                </span>
                {isAccepted && (
                  <span className="absolute top-1.5 right-1.5 text-[10px] font-bold w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-sm">
                    ✓
                  </span>
                )}
                {isRejected && (
                  <span className="absolute top-1.5 right-1.5 text-[10px] font-bold w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow-sm">
                    ✗
                  </span>
                )}
              </div>
            );
          })
        : ["A", "B"].map((label) => (
            <div
              key={label}
              className="flex-1 min-h-[120px] rounded-lg bg-muted/40 flex flex-col items-center justify-center gap-2 border border-border/40"
            >
              <span className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-widest">{label}</span>
              {jobStatus === "generating" && (
                <span className="w-2.5 h-2.5 rounded-full bg-primary/50 animate-pulse" />
              )}
            </div>
          ))}
      {hasImages &&
        Array.from({ length: Math.max(0, VARIANT_COUNT - variants.length) }).map((_, i) => (
          <div
            key={`pad-${i}`}
            className="flex-1 min-h-[120px] rounded-lg bg-muted/20 border border-dashed border-border/30"
          />
        ))}
    </div>
  );
}

// ── Job row ───────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: LibraryJob }) {
  const router = useRouter();
  const isIllustration = job.mode === "illustration";
  const isPictogram = job.mode === "pictogram";

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const refs: Array<{ url: string; note: string }> =
    job.subjectReferences && job.subjectReferences.length > 0
      ? job.subjectReferences
      : job.subjectReferenceUrl
      ? [{ url: job.subjectReferenceUrl, note: job.subjectReferenceNote ?? "" }]
      : [];

  return (
    <div
      onClick={() => router.push(`/jobs/${job.id}`)}
      className="flex items-stretch gap-0 rounded-xl border border-border/60 bg-card hover:border-primary/50 hover:bg-card/80 hover:shadow-md transition-all duration-150 cursor-pointer overflow-hidden group"
    >
      {/* ── Col 1: Meta ── */}
      <div className="flex flex-col gap-2 w-48 shrink-0 p-4 border-r border-border/40 justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <JobStatusBadge status={job.status} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {isIllustration ? (
              <Badge variant="secondary" className="text-xs">Illustration</Badge>
            ) : isPictogram ? (
              <Badge variant="secondary" className="text-xs">Pictogram</Badge>
            ) : (
              <ChannelBadges channels={job.channels} />
            )}
            {(isIllustration || isPictogram) && job.visualType && (
              <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {job.visualType}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            {formatDate(job.createdAt)}
          </span>
          <Link
            href={`/create?fromJob=${job.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground transition-colors rounded px-1.5 py-1 hover:bg-muted/60 w-fit"
          >
            <Copy className="h-3 w-3" />
            Reuse
          </Link>
        </div>
      </div>

      {/* ── Col 2: Brief + refs ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 p-4 justify-center">
        <p className="text-sm font-medium leading-snug line-clamp-2 text-foreground/90">
          {job.description}
        </p>
        {refs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {refs.map((ref, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-secondary/8 border border-secondary/25 rounded-lg p-1.5 pr-2.5 max-w-[260px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ref.url}
                  alt={ref.note || `Ref ${i + 1}`}
                  className="w-11 h-11 rounded-md object-cover border border-secondary/20 shrink-0"
                />
                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-secondary/70 uppercase tracking-widest leading-none">
                    {refs.length === 1 ? "Reference" : `Ref ${i + 1}`}
                  </span>
                  {ref.note ? (
                    <p className="text-[11px] text-muted-foreground italic line-clamp-2 leading-snug">
                      &ldquo;{ref.note}&rdquo;
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/60">Image attached</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Col 3: Variant thumbnails ── */}
      <div className="w-64 shrink-0 p-3 border-l border-border/40">
        <VariantThumbs variants={job.variants} jobStatus={job.status} />
      </div>
    </div>
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
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchJobs = useCallback(
    async (cursor?: string) => {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (modeFilter !== "all") params.set("mode", modeFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
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
    [statusFilter, channelFilter, modeFilter, searchQuery]
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search briefs..."
            className="w-56 pl-8 h-9"
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
              searchDebounceRef.current = setTimeout(() => {
                setSearchQuery(val);
              }, 300);
            }}
          />
        </div>

        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="socials">Socials</SelectItem>
            <SelectItem value="illustration">Illustration</SelectItem>
            <SelectItem value="pictogram">Pictogram</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
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
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="twitter">Twitter / X</SelectItem>
            <SelectItem value="ig_feed">IG Feed</SelectItem>
          </SelectContent>
        </Select>

        {(statusFilter !== "all" || channelFilter !== "all" || modeFilter !== "all" || searchQuery.trim()) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("all");
              setChannelFilter("all");
              setModeFilter("all");
              setSearchQuery("");
            }}
            className="text-xs text-muted-foreground"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && jobs.length === 0 && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-stretch rounded-xl border border-border/60 bg-card overflow-hidden animate-pulse"
            >
              <div className="w-48 shrink-0 p-4 border-r border-border/40 flex flex-col gap-2 justify-between">
                <div className="space-y-2">
                  <div className="h-5 bg-muted rounded w-16" />
                  <div className="h-5 bg-muted rounded w-24" />
                </div>
                <div className="h-3 bg-muted rounded w-20" />
              </div>
              <div className="flex-1 p-4 space-y-2.5">
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-4/5" />
                <div className="h-12 bg-muted/50 rounded-lg w-56 mt-1" />
              </div>
              <div className="w-64 shrink-0 p-3 border-l border-border/40 flex gap-2">
                <div className="flex-1 h-[120px] bg-muted rounded-lg" />
                <div className="flex-1 h-[120px] bg-muted rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Job rows */}
      {jobs.length > 0 && (
        <div className="flex flex-col gap-3">
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
