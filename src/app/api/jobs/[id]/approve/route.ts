import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

const ApproveSchema = z.object({
  variants: z.array(
    z.object({
      variantLabel: z.string(),
      copy: z.object({
        headline: z.string(),
        subhead: z.string().optional(),
        cta: z.string(),
        disclaimer: z.string().optional(),
      }).passthrough(),
      artDirection: z.object({
        palette: z.array(z.string()).default([]),
        mood: z.string().default(""),
        style: z.string().default(""),
        backgroundPrompt: z.string(),
      }).passthrough(),
    })
  ),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const body = await req.json();
    const input = ApproveSchema.parse(body);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { variants: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "planned") {
      return NextResponse.json(
        { error: `Job is not in planned state (current: ${job.status})` },
        { status: 400 }
      );
    }

    for (const edited of input.variants) {
      const variant = job.variants.find((v) => v.label === edited.variantLabel);
      if (!variant) continue;

      const existingSpec = (variant.plannerSpec as Record<string, unknown>) || {};
      const updatedSpec = {
        ...existingSpec,
        copy: edited.copy,
        artDirection: {
          ...(typeof existingSpec.artDirection === "object" && existingSpec.artDirection !== null
            ? existingSpec.artDirection
            : {}),
          ...edited.artDirection,
        },
      };

      await prisma.variant.update({
        where: { id: variant.id },
        data: {
          plannerSpec: JSON.parse(JSON.stringify(updatedSpec)),
          status: "approved",
        },
      });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "generating" },
    });

    const eventName = job.mode === "illustration"
      ? "job/generate-illustration-images"
      : job.mode === "pictogram"
      ? "job/generate-pictogram-images"
      : "job/generate-images";

    await inngest.send({
      name: eventName,
      data: { jobId },
    });

    return NextResponse.json({ status: "generating", jobId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Failed to approve job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
