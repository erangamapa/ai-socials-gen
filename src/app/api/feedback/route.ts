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

    // ─── RULE COUNTERS — only update rules that were actually active for this job ──
    const job = variant.job;
    const rulesSnapshot: string | null = job
      ? ((await prisma.job.findUnique({ where: { id: job.id }, select: { rulesSnapshot: true } }))?.rulesSnapshot ?? null)
      : null;

    const enabledRules = await prisma.promptRule.findMany({
      where: { enabled: true, mode: jobMode },
      select: { id: true, category: true, content: true },
    });

    const activeRules = rulesSnapshot
      ? enabledRules.filter((r) => rulesSnapshot.includes(r.content))
      : enabledRules;
    const enabledRuleIds = activeRules.map((r) => r.id);

    if (enabledRuleIds.length > 0) {
      await prisma.promptRule.updateMany({
        where: { id: { in: enabledRuleIds } },
        data: { hitCount: { increment: 1 } },
      });

      if (input.decision === "accept") {
        const notesLen = (input.notes ?? "").trim().length;
        const confidenceBoost = notesLen > 20 ? 5 : notesLen > 5 ? 3 : 1;

        await prisma.promptRule.updateMany({
          where: { id: { in: enabledRuleIds } },
          data: {
            successCount: { increment: 1 },
            confidence: { increment: confidenceBoost },
          },
        });
      }

      if (input.decision === "reject") {
        // Mild negative pressure on all enabled rules for this mode
        await prisma.promptRule.updateMany({
          where: { id: { in: enabledRuleIds } },
          data: { confidence: { decrement: 1 } },
        });

        // Targeted penalty: if rejection reasons map to a rule category, penalize harder
        const reasonToCategoryMap: Record<string, string> = {
          "Off-brand palette": "color",
          "Poor composition": "composition",
          "Wrong vibe": "style",
          "Bad subject quality": "style",
          "Too busy / low clarity": "composition",
          "Not enough text-safe area": "composition",
          "Typography issues": "typography",
          "Wrong channel sizing": "composition",
        };
        const targetedCategories = new Set(
          input.reasons.map((r) => reasonToCategoryMap[r]).filter(Boolean)
        );
        if (targetedCategories.size > 0) {
          const targetedRuleIds = activeRules
            .filter((r) => targetedCategories.has(r.category))
            .map((r) => r.id);
          if (targetedRuleIds.length > 0) {
            await prisma.promptRule.updateMany({
              where: { id: { in: targetedRuleIds } },
              data: { confidence: { decrement: 2 } },
            });
          }
        }
      }

      // Clamp confidence to 0–100
      await prisma.promptRule.updateMany({
        where: { id: { in: enabledRuleIds }, confidence: { gt: 100 } },
        data: { confidence: 100 },
      });
      await prisma.promptRule.updateMany({
        where: { id: { in: enabledRuleIds }, confidence: { lt: 0 } },
        data: { confidence: 0 },
      });
    }

    // ─── TEMPLATE STATS — track per-template effectiveness ─────────────────
    const templateAssetIdForStats = spec?.templateAssetId as string | undefined;
    const variantArtifacts = await prisma.artifact.findMany({
      where: { variantId: input.variantId, kind: "final_png" },
      select: { channel: true },
      take: 1,
    });
    const channelForStats = variantArtifacts[0]?.channel ?? undefined;
    if (templateAssetIdForStats && channelForStats) {
      try {
        await prisma.templateStats.upsert({
          where: {
            templateId_channel: { templateId: templateAssetIdForStats, channel: channelForStats },
          },
          create: {
            templateId: templateAssetIdForStats,
            channel: channelForStats,
            jobCount: 1,
            acceptCount: input.decision === "accept" ? 1 : 0,
            rejectCount: input.decision === "reject" ? 1 : 0,
          },
          update: {
            jobCount: { increment: 1 },
            ...(input.decision === "accept" ? { acceptCount: { increment: 1 } } : {}),
            ...(input.decision === "reject" ? { rejectCount: { increment: 1 } } : {}),
            lastUsedAt: new Date(),
          },
        });
      } catch (err) {
        console.warn("[Feedback] Template stats update failed:", err);
      }
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

    const variant = await prisma.variant.findUnique({
      where: { id: input.variantId },
      include: { job: { select: { id: true, mode: true, rulesSnapshot: true } } },
    });

    const jobMode = variant?.job?.mode || "socials";
    const rulesSnapshot = variant?.job?.rulesSnapshot ?? null;
    const spec = variant?.plannerSpec as Record<string, unknown> | null;
    const referencesUsed = Array.isArray(spec?.referencesUsed) ? (spec.referencesUsed as string[]) : [];

    // Revert rule counters for rules that were active during this job
    const enabledRules = await prisma.promptRule.findMany({
      where: { enabled: true, mode: jobMode },
      select: { id: true, content: true },
    });
    const activeRuleIds = rulesSnapshot
      ? enabledRules.filter((r) => rulesSnapshot.includes(r.content)).map((r) => r.id)
      : enabledRules.map((r) => r.id);

    if (activeRuleIds.length > 0) {
      await prisma.promptRule.updateMany({
        where: { id: { in: activeRuleIds } },
        data: { hitCount: { decrement: 1 } },
      });

      if (latest.decision === "accept") {
        const notesLen = (latest.notes ?? "").trim().length;
        const confidenceBoost = notesLen > 20 ? 5 : notesLen > 5 ? 3 : 1;
        await prisma.promptRule.updateMany({
          where: { id: { in: activeRuleIds } },
          data: { successCount: { decrement: 1 }, confidence: { decrement: confidenceBoost } },
        });
      }

      if (latest.decision === "reject") {
        await prisma.promptRule.updateMany({
          where: { id: { in: activeRuleIds } },
          data: { confidence: { increment: 1 } },
        });
      }

      // Clamp counters to 0 minimum
      await prisma.$executeRaw`UPDATE "PromptRule" SET "hitCount" = 0 WHERE "hitCount" < 0`;
      await prisma.$executeRaw`UPDATE "PromptRule" SET "successCount" = 0 WHERE "successCount" < 0`;
      await prisma.$executeRaw`UPDATE "PromptRule" SET "confidence" = LEAST(GREATEST("confidence", 0), 100)`;
    }

    // Revert usageScore changes on vault items
    if (latest.decision === "accept" && referencesUsed.length > 0) {
      for (const refId of referencesUsed) {
        await prisma.assetVaultItem.updateMany({
          where: { id: refId },
          data: { usageScore: { decrement: 1 } },
        });
      }
    }
    if (latest.decision === "reject" && latest.reasons.includes("Bad subject quality") && referencesUsed.length > 0) {
      for (const refId of referencesUsed) {
        await prisma.assetVaultItem.updateMany({
          where: { id: refId },
          data: { usageScore: { increment: 1 } },
        });
      }
    }

    // Revert template stats
    const templateAssetId = spec?.templateAssetId as string | undefined;
    const variantArtifacts = await prisma.artifact.findMany({
      where: { variantId: input.variantId, kind: "final_png" },
      select: { channel: true },
      take: 1,
    });
    const channel = variantArtifacts[0]?.channel;
    if (templateAssetId && channel) {
      try {
        await prisma.templateStats.update({
          where: { templateId_channel: { templateId: templateAssetId, channel } },
          data: {
            jobCount: { decrement: 1 },
            ...(latest.decision === "accept" ? { acceptCount: { decrement: 1 } } : {}),
            ...(latest.decision === "reject" ? { rejectCount: { decrement: 1 } } : {}),
          },
        });
      } catch {
        // Stats row may not exist
      }
    }

    // Delete rules that were created from this specific feedback
    if (variant?.job?.id) {
      const feedbackCreatedAt = latest.createdAt;
      const fiveSecondsAfter = new Date(feedbackCreatedAt.getTime() + 5000);
      await prisma.promptRule.deleteMany({
        where: {
          sourceJobId: variant.job.id,
          mode: jobMode,
          createdAt: { gte: feedbackCreatedAt, lte: fiveSecondsAfter },
        },
      });
    }

    await prisma.feedback.delete({ where: { id: latest.id } });

    console.log(`[Feedback] RECONSIDER on variant ${input.variantId} — deleted feedback ${latest.id} and reverted side effects`);

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
