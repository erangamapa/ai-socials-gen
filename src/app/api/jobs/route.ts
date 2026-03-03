import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

const CreateJobSchema = z.object({
  description: z.string().min(1).max(2000),
  channels: z.array(z.enum(["twitter", "ig_feed"])).default([]),
  visualType: z.enum(["background-only", "illustration", "pictogram", "1:1", "4:5", "16:9"]).default("background-only"),
  mode: z.enum(["socials", "illustration"]).default("socials"),
  subjectReferenceUrl: z.string().min(1).optional(),
  subjectReferenceNote: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = CreateJobSchema.parse(body);

    // Socials mode requires at least one channel
    if (input.mode === "socials" && input.channels.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one channel for social post generation" },
        { status: 400 }
      );
    }

    const job = await prisma.job.create({
      data: {
        description: input.description,
        channels: input.channels,
        visualType: input.visualType,
        mode: input.mode,
        subjectReferenceUrl: input.subjectReferenceUrl ?? null,
        subjectReferenceNote: input.subjectReferenceNote ?? null,
      },
    });

    await prisma.variant.createMany({
      data: [
        { jobId: job.id, label: "A", status: "pending" },
        { jobId: job.id, label: "B", status: "pending" },
        { jobId: job.id, label: "C", status: "pending" },
      ],
    });

    const eventName = input.mode === "illustration"
      ? "job/generate-illustration"
      : "job/generate";

    await inngest.send({
      name: eventName,
      data: { jobId: job.id },
    });

    return NextResponse.json({ jobId: job.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Failed to create job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
