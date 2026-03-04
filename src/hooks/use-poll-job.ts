"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface JobData {
  id: string;
  description: string;
  channels: string[];
  visualType: string;
  status: string;
  errorMessage: string | null;
  retrievalBundle: unknown;
  rulesVersion: number;
  rulesSnapshot: string | null;
  mode: string;
  subjectReferenceUrl: string | null;
  subjectReferenceNote: string | null;
  subjectReferences: Array<{ url: string; note: string }> | null;
  angleReference: { url: string; note: string } | null;
  createdAt: string;
  updatedAt: string;
  variants: VariantData[];
}

export interface VariantData {
  id: string;
  jobId: string;
  label: string;
  plannerSpec: unknown;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  artifacts: ArtifactData[];
  feedback: FeedbackData[];
}

export interface ArtifactData {
  id: string;
  variantId: string;
  channel: string;
  kind: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  createdAt: string;
}

export interface FeedbackData {
  id: string;
  variantId: string;
  decision: string;
  reasons: string[];
  notes: string | null;
  createdAt: string;
}

export function usePollJob(jobId: string) {
  const { data, error, isLoading, mutate } = useSWR<JobData>(
    `/api/jobs/${jobId}`,
    fetcher,
    {
      refreshInterval: (latestData) => {
        if (!latestData) return 2000;
        const stop = ["ready", "failed", "planned"];
        if (stop.includes(latestData.status)) return 0;
        return 2000;
      },
    }
  );

  return { job: data, error, isLoading, mutate };
}
