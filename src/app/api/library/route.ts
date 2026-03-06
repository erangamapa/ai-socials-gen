import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const channel = searchParams.get("channel");
    const mode = searchParams.get("mode");
    const search = searchParams.get("search");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Build raw SQL with filters to avoid driver adapter "column (not available)" bug
    type JobRow = {
      id: string;
      description: string;
      channels: string[];
      visualType: string;
      status: string;
      errorMessage: string | null;
      retrievalBundle: unknown;
      rulesVersion: number;
      rulesSnapshot: string | null;
      activeRuleIds: string[];
      mode: string;
      subjectReferenceUrl: string | null;
      subjectReferenceNote: string | null;
      subjectReferences: unknown;
      angleReference: unknown;
      createdAt: Date;
      updatedAt: Date;
    };

    const conditions: Prisma.Sql[] = [];
    if (status) conditions.push(Prisma.sql`"status" = ${status}`);
    if (mode) conditions.push(Prisma.sql`"mode" = ${mode}`);
    if (channel) conditions.push(Prisma.sql`${channel} = ANY("channels")`);
    if (search?.trim()) conditions.push(Prisma.sql`"description" ILIKE ${`%${search.trim()}%`}`);
    if (cursor) conditions.push(Prisma.sql`"id" < ${cursor}`);

    const whereClause =
      conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;

    const jobs = await prisma.$queryRaw<JobRow[]>`
      SELECT * FROM "Job"
      ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT ${limit + 1}
    `;

    const jobIds = jobs.map((j) => j.id);
    type VariantRow = { id: string; jobId: string; label: string; status: string };
    type FeedbackRow = { variantId: string; decision: string };
    type ArtifactRow = { variantId: string; id: string; url: string; width: number; height: number; channel: string };

    const variants: VariantRow[] =
      jobIds.length > 0
        ? await prisma.$queryRaw<VariantRow[]>`
            SELECT id, "jobId", label, status FROM "Variant"
            WHERE "jobId" = ANY(${jobIds})
            ORDER BY label ASC
          `
        : [];
    const variantIds = variants.map((v) => v.id);

    const [feedbackByVariant, artifactsByVariant]: [FeedbackRow[], ArtifactRow[]] =
      variantIds.length > 0
        ? await Promise.all([
            prisma.$queryRaw<FeedbackRow[]>`
              SELECT "variantId", decision FROM "Feedback"
              WHERE "variantId" = ANY(${variantIds})
              ORDER BY "createdAt" DESC
            `,
            prisma.$queryRaw<ArtifactRow[]>`
              SELECT "variantId", id, url, width, height, channel FROM "Artifact"
              WHERE "variantId" = ANY(${variantIds}) AND kind = 'final_png'
            `,
          ])
        : [[], []];

    const feedbackMap = new Map<string, { decision: string }>();
    for (const f of feedbackByVariant) {
      if (!feedbackMap.has(f.variantId)) feedbackMap.set(f.variantId, { decision: f.decision });
    }
    const artifactMap = new Map<string, { id: string; url: string; width: number; height: number; channel: string }[]>();
    for (const a of artifactsByVariant) {
      const arr = artifactMap.get(a.variantId) ?? [];
      if (arr.length < 1) arr.push({ id: a.id, url: a.url, width: a.width, height: a.height, channel: a.channel });
      artifactMap.set(a.variantId, arr);
    }

    const variantsByJob = new Map<string, typeof variants>();
    for (const v of variants) {
      const arr = variantsByJob.get(v.jobId) ?? [];
      arr.push(v);
      variantsByJob.set(v.jobId, arr);
    }

    const hasMore = jobs.length > limit;
    const rawItems = hasMore ? jobs.slice(0, limit) : jobs;
    const items = rawItems.map((job) => {
      const jobVariants = variantsByJob.get(job.id) ?? [];
      return {
        ...job,
        variants: jobVariants.map((v) => ({
          ...v,
          feedback: feedbackMap.get(v.id) ? [feedbackMap.get(v.id)!] : [],
          artifacts: artifactMap.get(v.id) ?? [],
        })),
      };
    });
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Failed to list jobs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
