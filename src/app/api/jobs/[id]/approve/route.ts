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
      }),
      artDirection: z.object({
        palette: z.array(z.string()).default([]),
        mood: z.string().default(""),
        style: z.string().default(""),
        backgroundPrompt: z.string(),
        referenceInstructions: z.string().optional(),
        solidBackground: z.string().optional(),
      }),
      referencesUsed: z.array(z.string()).optional(),
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
      const updatedSpec: Record<string, unknown> = {
        ...existingSpec,
        copy: edited.copy,
        artDirection: {
          ...(typeof existingSpec.artDirection === "object" && existingSpec.artDirection !== null
            ? existingSpec.artDirection
            : {}),
          ...edited.artDirection,
        },
      };

      // Persist user's ref swap choices if provided
      if (edited.referencesUsed !== undefined) {
        updatedSpec.referencesUsed = edited.referencesUsed;
      }

      // Compute specEdits delta for learning (compare original vs submitted artDirection)
      const origArt = (existingSpec.artDirection as Record<string, unknown>) ?? {};
      const editedArt = edited.artDirection as Record<string, unknown>;
      const specEdits: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(editedArt)) {
        const origVal = origArt[key];
        const newVal = editedArt[key];
        if (JSON.stringify(origVal) !== JSON.stringify(newVal)) {
          specEdits[key] = { from: origVal, to: newVal };
        }
      }
      if (Object.keys(specEdits).length > 0) {
        updatedSpec.specEdits = specEdits;
      }

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
