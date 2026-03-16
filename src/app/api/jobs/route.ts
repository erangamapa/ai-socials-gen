import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { jobLimiter } from "@/lib/rate-limit";

const SubjectReferenceItem = z.object({
  url: z.string().min(1),
  note: z.string().max(2000).default(""),
});

const AngleReferenceItem = z.object({
  url: z.string().min(1),
  note: z.string().max(2000).default(""),
});

const CreateJobSchema = z.object({
  description: z.string().min(1).max(2000),
  channels: z.array(z.enum(["twitter", "ig_feed"])).default([]),
  visualType: z.enum(["background-only", "illustration", "pictogram", "1:1", "4:5", "16:9"]).default("background-only"),
  mode: z.enum(["socials", "illustration", "pictogram"]).default("socials"),
  // New: array of references (up to 4)
  subjectReferences: z.array(SubjectReferenceItem).max(4).optional(),
  // Legacy single-reference fields (kept for backward compat — "Use in Social" flow)
  subjectReferenceUrl: z.string().min(1).optional(),
  subjectReferenceNote: z.string().max(2000).optional(),
  // Optional angle reference — image whose camera angle is replicated in all variants
  angleReference: AngleReferenceItem.optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = jobLimiter.check(ip);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

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

    // Normalise references: prefer new array field, fall back to legacy single fields
    let subjectReferences: Array<{ url: string; note: string }> | null = null;
    if (input.subjectReferences && input.subjectReferences.length > 0) {
      subjectReferences = input.subjectReferences;
    } else if (input.subjectReferenceUrl) {
      subjectReferences = [{ url: input.subjectReferenceUrl, note: input.subjectReferenceNote ?? "" }];
    }

    // First reference also stored in legacy fields for any code that reads them directly
    const legacyUrl = subjectReferences?.[0]?.url ?? null;
    const legacyNote = subjectReferences?.[0]?.note ?? null;

    const job = await prisma.job.create({
      data: {
        description: input.description,
        channels: input.channels,
        visualType: input.visualType,
        mode: input.mode,
        subjectReferenceUrl: legacyUrl,
        subjectReferenceNote: legacyNote,
        subjectReferences: subjectReferences ? JSON.parse(JSON.stringify(subjectReferences)) : null,
        angleReference: input.angleReference ? JSON.parse(JSON.stringify(input.angleReference)) : null,
      },
    });

    const variantLabels = ["A", "B"];

    await prisma.variant.createMany({
      data: variantLabels.map((label) => ({ jobId: job.id, label, status: "pending" })),
    });

    const eventName = input.mode === "illustration"
      ? "job/generate-illustration"
      : input.mode === "pictogram"
      ? "job/generate-pictogram"
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
