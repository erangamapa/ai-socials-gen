import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const cancellable = ["queued", "running", "generating"];
    if (!cancellable.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot cancel a job with status "${job.status}"` },
        { status: 409 }
      );
    }

    await prisma.job.update({
      where: { id },
      data: { status: "failed", errorMessage: "Cancelled by user" },
    });

    return NextResponse.json({ status: "cancelled" });
  } catch (error) {
    console.error("Failed to cancel job:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
