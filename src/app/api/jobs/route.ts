import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

const CreateJobSchema = z.object({
  description: z.string().min(1).max(2000),
  channels: z.array(z.enum(["twitter", "ig_feed"])).min(1),
  visualType: z.enum(["background-only", "illustration", "pictogram"]).default("background-only"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = CreateJobSchema.parse(body);

    const job = await prisma.job.create({
      data: {
        description: input.description,
        channels: input.channels,
        visualType: input.visualType,
      },
    });

    await prisma.variant.createMany({
      data: [
        { jobId: job.id, label: "A", status: "pending" },
        { jobId: job.id, label: "B", status: "pending" },
        { jobId: job.id, label: "C", status: "pending" },
      ],
    });

    await inngest.send({
      name: "job/generate",
      data: { jobId: job.id },
    });

    return NextResponse.json({ jobId: job.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Failed to create job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
