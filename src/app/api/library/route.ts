import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const channel = searchParams.get("channel");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }
    if (channel) {
      where.channels = { has: channel };
    }

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        variants: {
          select: {
            id: true,
            label: true,
            status: true,
            feedback: {
              select: { decision: true },
              take: 1,
              orderBy: { createdAt: "desc" },
            },
            artifacts: {
              where: { kind: "final_png" },
              select: { id: true, url: true, width: true, height: true, channel: true },
              take: 1,
            },
          },
          orderBy: { label: "asc" },
        },
        _count: {
          select: { variants: true },
        },
      },
    });

    const hasMore = jobs.length > limit;
    const items = hasMore ? jobs.slice(0, limit) : jobs;
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
