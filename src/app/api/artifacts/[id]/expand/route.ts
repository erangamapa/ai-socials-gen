import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artifactId } = await params;

    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { variant: { include: { job: true } } },
    });

    if (!artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    if (artifact.kind !== "final_png" && artifact.kind !== "expanded_png") {
      return NextResponse.json({ error: "Only final images can be expanded" }, { status: 400 });
    }

    const existing = await prisma.artifact.findFirst({
      where: { variantId: artifact.variantId, kind: "expanded_png" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Expanded version already exists", artifactId: existing.id, url: existing.url },
        { status: 409 },
      );
    }

    await inngest.send({
      name: "artifact/expand",
      data: { artifactId, variantId: artifact.variantId },
    });

    return NextResponse.json({ status: "expanding", artifactId });
  } catch (error) {
    console.error("Failed to trigger expand:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
