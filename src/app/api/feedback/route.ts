import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { reasonToRule } from "@/lib/ai/promptBuilder";

const FeedbackSchema = z.object({
  variantId: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
  reasons: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

/** Deduplicate a rule by content + mode before inserting — avoids rule bloat */
async function upsertRule(data: {
  content: string;
  category: string;
  source: string;
  priority: number;
  sourceJobId?: string;
  mode?: string;
}): Promise<string | null> {
  const mode = data.mode || "socials";
  const existing = await prisma.promptRule.findFirst({
    where: { content: data.content, mode },
  });
  if (existing) {
    if (data.priority > existing.priority) {
      await prisma.promptRule.update({
        where: { id: existing.id },
        data: { priority: data.priority },
      });
    }
    return null;
  }
  await prisma.promptRule.create({ data: { ...data, mode } });
  return data.content;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = FeedbackSchema.parse(body);

    const variant = await prisma.variant.findUnique({
      where: { id: input.variantId },
      include: { job: { select: { id: true, description: true, mode: true } } },
    });

    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    const feedback = await prisma.feedback.create({
      data: {
        variantId: input.variantId,
        decision: input.decision,
        reasons: input.reasons,
        notes: input.notes,
      },
    });

    const rulesCreated: string[] = [];
    const spec = variant.plannerSpec as Record<string, unknown> | null;
    const art = spec?.artDirection as Record<string, unknown> | undefined;
    const jobId = variant.job?.id;
    const jobMode = variant.job?.mode || "socials";
    const referencesUsed = Array.isArray(spec?.referencesUsed) ? (spec.referencesUsed as string[]) : [];

    // ─── REJECT ────────────────────────────────────────────────────────────────
    if (input.decision === "reject") {
      // 1. Map structured reasons → specific don't-rules (mode-scoped)
      for (const reason of input.reasons) {
        const ruleData = reasonToRule(reason);
        if (ruleData) {
          const added = await upsertRule({
            content: ruleData.content,
            category: ruleData.category,
            source: "feedback",
            priority: 4,
            sourceJobId: jobId,
            mode: jobMode,
          });
          if (added) rulesCreated.push(added);
        }
      }

      // 2. Free-text notes → high-priority specific rule
      if (input.notes && input.notes.trim().length > 5) {
        const added = await upsertRule({
          content: input.notes.trim(),
          category: "dont",
          source: "feedback",
          priority: 5,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 3. Store the rejected mood/style as a negative signal
      if (art?.mood || art?.style) {
        const rejectedStyle = [art.mood, art.style].filter(Boolean).join(", ");
        const added = await upsertRule({
          content: `Avoid this style/mood combination: ${rejectedStyle}`,
          category: "dont",
          source: "feedback",
          priority: 3,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 4. Decrement usageScore for references if "Bad subject quality" was a reason
      if (input.reasons.includes("Bad subject quality") && referencesUsed.length > 0) {
        for (const refId of referencesUsed) {
          await prisma.assetVaultItem.updateMany({
            where: { id: refId },
            data: { usageScore: { decrement: 1 } },
          });
        }
        console.log(`[Feedback] Decremented usageScore for ${referencesUsed.length} refs`);
      }
    }

    // ─── ACCEPT ────────────────────────────────────────────────────────────────
    if (input.decision === "accept") {
      // 1. Store accepted mood + style as a positive rule (mode-scoped)
      if (art?.mood || art?.style) {
        const acceptedStyle = [art.mood, art.style].filter(Boolean).join(", ");
        const added = await upsertRule({
          content: `Accepted style direction that worked well: ${acceptedStyle}`,
          category: "style",
          source: "positive",
          priority: 3,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 2. Store accepted colour palette as a positive rule
      const palette = Array.isArray(art?.palette) ? (art.palette as string[]) : [];
      if (palette.length > 0) {
        const added = await upsertRule({
          content: `Accepted colour palette that worked: ${palette.join(", ")}`,
          category: "style",
          source: "positive",
          priority: 2,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 3. Extract the top-level style keywords from the backgroundPrompt
      const bgPrompt = typeof art?.backgroundPrompt === "string" ? art.backgroundPrompt : "";
      if (bgPrompt.length > 30) {
        const snippet = bgPrompt.slice(0, 120).replace(/\s+/g, " ").trim();
        const added = await upsertRule({
          content: `Accepted illustration direction: ${snippet}...`,
          category: "style",
          source: "positive",
          priority: 2,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 4. If user left positive notes, store those directly
      if (input.notes && input.notes.trim().length > 5) {
        const added = await upsertRule({
          content: `Positive feedback: ${input.notes.trim()}`,
          category: "do",
          source: "positive",
          priority: 4,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 5. Increment usageScore for all accepted references
      if (referencesUsed.length > 0) {
        for (const refId of referencesUsed) {
          await prisma.assetVaultItem.updateMany({
            where: { id: refId },
            data: { usageScore: { increment: 1 } },
          });
        }
        console.log(`[Feedback] Incremented usageScore for ${referencesUsed.length} refs`);
      }
    }

    console.log(`[Feedback] ${input.decision.toUpperCase()} on variant ${input.variantId} → ${rulesCreated.length} rule(s) created/updated`);

    return NextResponse.json({ feedback, rulesCreated }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Failed to save feedback:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
