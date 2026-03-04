import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

/**
 * POST /api/jobs/:id/regenerate-images
 * Re-runs Phase 2 image generation using the existing approved variant specs.
 * Skips Phase 1 (Claude planning) entirely. Only valid for jobs in "ready" state
 * or jobs with illustration/pictogram mode variants that are already approved.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { variants: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!["illustration", "pictogram"].includes(job.mode)) {
      return NextResponse.json(
        { error: "Regenerate-images-only is only supported for illustration and pictogram jobs" },
        { status: 400 }
      );
    }

    const allowedStatuses = ["ready", "failed"];
    if (!allowedStatuses.includes(job.status)) {
      return NextResponse.json(
        { error: `Job must be in ready or failed state to regenerate images (current: ${job.status})` },
        { status: 409 }
      );
    }

    // Reset job and variant statuses to generating
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "generating", errorMessage: null },
    });

    // Reset only variants that have been approved (have a plannerSpec) — keep their specs
    for (const variant of job.variants) {
      if (variant.plannerSpec) {
        await prisma.variant.update({
          where: { id: variant.id },
          data: { status: "approved", errorMessage: null },
        });
      }
    }

    const eventName =
      job.mode === "illustration"
        ? "job/generate-illustration-images"
        : "job/generate-pictogram-images";

    await inngest.send({ name: eventName, data: { jobId } });

    return NextResponse.json({ status: "generating", jobId });
  } catch (error) {
    console.error("Failed to regenerate images:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
