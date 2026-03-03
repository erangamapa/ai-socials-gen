import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      select: { id: true, status: true, mode: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "failed") {
      return NextResponse.json(
        { error: "Only failed jobs can be retried" },
        { status: 409 }
      );
    }

    await prisma.job.update({
      where: { id },
      data: { status: "queued", errorMessage: null },
    });

    await prisma.variant.updateMany({
      where: { jobId: id },
      data: { status: "pending", errorMessage: null },
    });

    const eventName =
      job.mode === "illustration"
        ? "job/generate-illustration"
        : "job/generate";

    await inngest.send({ name: eventName, data: { jobId: id } });

    return NextResponse.json({ status: "queued" });
  } catch (error) {
    console.error("Failed to retry job:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
