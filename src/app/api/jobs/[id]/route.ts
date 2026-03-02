import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            artifacts: {
              orderBy: { createdAt: "asc" },
            },
            feedback: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy: { label: "asc" },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("Failed to get job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
