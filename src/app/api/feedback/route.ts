import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { reasonToRule, decayRules } from "@/lib/ai/promptBuilder";

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

    // ─── RULE COUNTERS — track effectiveness ────────────────────────────────
    const enabledRuleIds = (
      await prisma.promptRule.findMany({
        where: { enabled: true, mode: jobMode },
        select: { id: true },
      })
    ).map((r) => r.id);

    if (enabledRuleIds.length > 0) {
      await prisma.promptRule.updateMany({
        where: { id: { in: enabledRuleIds } },
        data: { hitCount: { increment: 1 } },
      });

      if (input.decision === "accept") {
        await prisma.promptRule.updateMany({
          where: { id: { in: enabledRuleIds } },
          data: {
            successCount: { increment: 1 },
            confidence: { increment: 2 },
          },
        });
      }

      // Cap confidence at 100
      await prisma.promptRule.updateMany({
        where: { id: { in: enabledRuleIds }, confidence: { gt: 100 } },
        data: { confidence: 100 },
      });
    }

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

      // 4. Rejected palette → specific color rule
      const rejPalette = Array.isArray(art?.palette) ? (art.palette as string[]) : [];
      if (rejPalette.length > 0 && input.reasons.includes("Off-brand palette")) {
        const added = await upsertRule({
          content: `Avoid palette: ${rejPalette.join(", ")}`,
          category: "color",
          source: "feedback",
          priority: 4,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 5. Template + reason combination for socials
      const templateAssetId = spec?.templateAssetId as string | undefined;
      if (templateAssetId && input.reasons.length > 0) {
        const reasonList = input.reasons.join(", ");
        const added = await upsertRule({
          content: `Template ${templateAssetId} had issues: ${reasonList}`,
          category: "dont",
          source: "feedback",
          priority: 3,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 6. Decrement usageScore for references if "Bad subject quality" was a reason
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

      // 5. Template that worked well
      const acceptedTemplateId = spec?.templateAssetId as string | undefined;
      const channel = (spec as Record<string, unknown> | null)?.channel as string | undefined;
      if (acceptedTemplateId) {
        const added = await upsertRule({
          content: `Template ${acceptedTemplateId} works well${channel ? ` for ${channel}` : ""} — reuse it`,
          category: "do",
          source: "positive",
          priority: 2,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 6. Extract composition pattern from backgroundPrompt
      const bgPromptComp = typeof art?.backgroundPrompt === "string" ? art.backgroundPrompt : "";
      const positionMatch = bgPromptComp.match(/(center-right|center-left|low-angle|high-angle|top-down|birds-eye|centered|off-center)/i);
      if (positionMatch) {
        const added = await upsertRule({
          content: `Composition pattern that worked: ${positionMatch[1]} positioning`,
          category: "composition",
          source: "positive",
          priority: 2,
          sourceJobId: jobId,
          mode: jobMode,
        });
        if (added) rulesCreated.push(added);
      }

      // 7. Increment usageScore for all accepted references
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

    // ─── PERIODIC DECAY — lightweight check on every feedback ──────────────
    try {
      const decayed = await decayRules();
      if (decayed.length > 0) {
        console.log(`[Feedback] Rule decay disabled ${decayed.length} rules`);
      }
    } catch (err) {
      console.warn("[Feedback] Rule decay failed:", err);
    }

    // ─── SYNTHESIS TRIGGER — every 5th feedback per mode ───────────────────
    try {
      const feedbackCount = await prisma.feedback.count({
        where: { variant: { job: { mode: jobMode } } },
      });
      if (feedbackCount > 0 && feedbackCount % 5 === 0) {
        const { synthesizeRules } = await import("@/lib/ai/ruleSynthesis");
        const result = await synthesizeRules(jobMode);
        console.log(`[Feedback] Auto-synthesis triggered (feedback #${feedbackCount}): ${result.created} created, ${result.disabled} disabled`);
      }
    } catch (err) {
      console.warn("[Feedback] Auto-synthesis failed:", err);
    }

    return NextResponse.json({ feedback, rulesCreated }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Failed to save feedback:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const ReconsiderSchema = z.object({
  variantId: z.string().min(1),
});

/**
 * DELETE /api/feedback — remove latest feedback for a variant (reconsider).
 * Resets the variant back to "ready" (un-reviewed) state.
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const input = ReconsiderSchema.parse(body);

    const latest = await prisma.feedback.findFirst({
      where: { variantId: input.variantId },
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      return NextResponse.json({ error: "No feedback found for this variant" }, { status: 404 });
    }

    await prisma.feedback.delete({ where: { id: latest.id } });

    console.log(`[Feedback] RECONSIDER on variant ${input.variantId} — deleted feedback ${latest.id}`);

    return NextResponse.json({ deleted: latest.id }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Failed to delete feedback:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
