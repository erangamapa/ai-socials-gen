"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "./job-status-badge";
import { ChannelBadges } from "./channel-badges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LibraryJob {
  id: string;
  description: string;
  channels: string[];
  visualType: string;
  status: string;
  createdAt: string;
  variants: {
    id: string;
    label: string;
    status: string;
    feedback: { decision: string }[];
  }[];
}

interface LibraryResponse {
  items: LibraryJob[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function LibraryTable() {
  const [jobs, setJobs] = useState<LibraryJob[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const fetchJobs = useCallback(async (cursor?: string) => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/library?${params}`);
    const data: LibraryResponse = await res.json();

    if (cursor) {
      setJobs((prev) => [...prev, ...data.items]);
    } else {
      setJobs(data.items);
    }
    setNextCursor(data.nextCursor);
    setHasMore(data.hasMore);
    setIsLoading(false);
  }, [statusFilter, channelFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="running">Running</SelectItem>
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
            <SelectItem value="ig_story">IG Story</SelectItem>
            <SelectItem value="email_header">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="max-w-xs">
                  <p className="truncate text-sm">{job.description}</p>
                </TableCell>
                <TableCell>
                  <ChannelBadges channels={job.channels} />
                </TableCell>
                <TableCell>
                  <JobStatusBadge status={job.status} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {job.variants.map((v) => {
                      const decision = v.feedback[0]?.decision;
                      const color = decision === "accept"
                        ? "bg-green-500"
                        : decision === "reject"
                        ? "bg-red-500"
                        : "bg-gray-300 dark:bg-gray-600";
                      return (
                        <div
                          key={v.id}
                          className={`w-5 h-5 rounded text-xs flex items-center justify-center text-white font-medium ${color}`}
                          title={`${v.label}: ${decision || v.status}`}
                        >
                          {v.label}
                        </div>
                      );
                    })}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(job.createdAt)}
                </TableCell>
                <TableCell>
                  <Link href={`/jobs/${job.id}`}>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No jobs found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => nextCursor && fetchJobs(nextCursor)}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
