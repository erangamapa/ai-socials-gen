import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

const EditSchema = z.object({
  prompt: z.string().min(1, "Edit prompt is required").max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artifactId } = await params;
    const body = await req.json();
    const { prompt: editPrompt } = EditSchema.parse(body);

    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { variant: { include: { job: true } } },
    });

    if (!artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    const allowedKinds = ["final_png", "expanded_png", "edited_png"];
    if (!allowedKinds.includes(artifact.kind)) {
      return NextResponse.json(
        { error: "Only final, expanded, or previously edited images can be edited" },
        { status: 400 },
      );
    }

    const jobMode = artifact.variant?.job?.mode;
    if (jobMode !== "illustration" && jobMode !== "pictogram") {
      return NextResponse.json(
        { error: "Edit is only available for illustration and pictogram outputs" },
        { status: 400 },
      );
    }

    await inngest.send({
      name: "artifact/edit",
      data: { artifactId, variantId: artifact.variantId, editPrompt },
    });

    return NextResponse.json({ status: "editing", artifactId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to trigger edit:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
