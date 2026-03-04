import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { reasonToRule, decayRules } from "@/lib/ai/promptBuilder";
import { inngest } from "@/lib/inngest/client";
import { clearVaultCache } from "@/lib/vault/vaultIndex";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "they", "have", "will",
  "are", "was", "but", "not", "all", "can", "her", "his", "our", "out", "use",
  "how", "any", "its", "new", "one", "two", "who", "has", "him", "you", "she",
  "him", "had", "would", "could", "should", "than", "then", "when", "also",
  "been", "into", "more", "some", "such", "your", "what", "just", "very",
]);

const CHANNEL_LABELS: Record<string, string> = {
  twitter: "Twitter / X",
  ig_feed: "IG Feed",
  ig_story: "IG Story",
  email_header: "Email",
  illustration: "Illustration",
};

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
    const jobRecord = job
      ? await prisma.job.findUnique({ where: { id: job.id }, select: { rulesSnapshot: true, activeRuleIds: true } })
      : null;
    const storedActiveRuleIds = jobRecord?.activeRuleIds ?? [];
    const rulesSnapshot: string | null = jobRecord?.rulesSnapshot ?? null;

    const enabledRules = await prisma.promptRule.findMany({
      where: { enabled: true, mode: jobMode },
      select: { id: true, category: true, content: true },
    });

    // Prefer ID-based matching (precise); fall back to text substring for legacy jobs
    const activeRules = storedActiveRuleIds.length > 0
      ? enabledRules.filter((r) => storedActiveRuleIds.includes(r.id))
      : rulesSnapshot
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

    // ─── TEMPLATE STATS — track per-template effectiveness for ALL channels ──
    const templateAssetIdForStats = spec?.templateAssetId as string | undefined;
    const variantArtifacts = await prisma.artifact.findMany({
      where: { variantId: input.variantId, kind: "final_png" },
      select: { channel: true },
    });
    // Collect unique channels (exclude special channels like "all", "illustration", "pictogram")
    const statsChannels = [...new Set(
      variantArtifacts
        .map((a) => a.channel)
        .filter((ch) => ch && !["all", "illustration", "pictogram"].includes(ch))
    )];
    if (templateAssetIdForStats && statsChannels.length > 0) {
      for (const ch of statsChannels) {
        try {
          await prisma.templateStats.upsert({
            where: {
              templateId_channel: { templateId: templateAssetIdForStats, channel: ch },
            },
            create: {
              templateId: templateAssetIdForStats,
              channel: ch,
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
          console.warn(`[Feedback] Template stats update failed for channel ${ch}:`, err);
        }
      }
      console.log(`[Feedback] Updated template stats for ${statsChannels.length} channel(s): ${statsChannels.join(", ")}`);
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
          content: `Accepted ${jobMode === "pictogram" ? "pictogram" : "illustration"} direction: ${snippet}...`,
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

      // 5. Template that worked well (include all channels it was accepted for)
      const acceptedTemplateId = spec?.templateAssetId as string | undefined;
      if (acceptedTemplateId) {
        // Use the channels derived from actual artifacts (same as what's tracked in TemplateStats)
        const channelLabel = statsChannels.length > 0
          ? ` for ${statsChannels.map((ch) => CHANNEL_LABELS[ch] || ch).join(" & ")}`
          : "";
        const added = await upsertRule({
          content: `Template ${acceptedTemplateId} works well${channelLabel} — reuse it`,
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

      // 7. Illustration/pictogram-specific: solidBackground, perspective angle, subject prompt
      if (jobMode === "illustration" || jobMode === "pictogram") {
        const solidBg = typeof art?.solidBackground === "string" ? art.solidBackground : null;
        const subjectPrompt = typeof art?.subjectPrompt === "string" ? art.subjectPrompt : null;

        // Store the accepted solid background colour
        if (solidBg) {
          const added = await upsertRule({
            content: `Accepted solid background colour: ${solidBg} — this dark background worked well`,
            category: "style",
            source: "positive",
            priority: 2,
            sourceJobId: jobId,
            mode: jobMode,
          });
          if (added) rulesCreated.push(added);
        }

        // Extract and store camera angle / perspective (illustration-specific)
        if (jobMode === "illustration") {
          const bgPromptForAngle = typeof art?.backgroundPrompt === "string" ? art.backgroundPrompt : "";
          const angleMatch = bgPromptForAngle.match(
            /(worm[''']?s.?eye|low-angle|high-angle|foreshortened|dutch tilt|overhead|top-down|three-quarter|side.profile|front-on|isometric)/i
          );
          if (angleMatch) {
            const added = await upsertRule({
              content: `Camera angle that worked: "${angleMatch[1]}" — use this perspective type for similar briefs`,
              category: "composition",
              source: "positive",
              priority: 2,
              sourceJobId: jobId,
              mode: jobMode,
            });
            if (added) rulesCreated.push(added);
          }
        }

        // Store accepted subject description snippet
        if (subjectPrompt && subjectPrompt.length > 15) {
          const snippet = subjectPrompt.slice(0, 100).replace(/\s+/g, " ").trim();
          const added = await upsertRule({
            content: `Accepted subject description that worked well: "${snippet}..."`,
            category: "style",
            source: "positive",
            priority: 1,
            sourceJobId: jobId,
            mode: jobMode,
          });
          if (added) rulesCreated.push(added);
        }
      }

      // 8. Increment usageScore and per-context scores for all accepted references
      if (referencesUsed.length > 0) {
        // Extract context tags from job description for per-context scoring
        const jobDesc = variant.job?.description ?? "";
        const contextTags = jobDesc
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .split(/\s+/)
          .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
          .slice(0, 5);

        for (const refId of referencesUsed) {
          await prisma.assetVaultItem.updateMany({
            where: { id: refId },
            data: { usageScore: { increment: 1 } },
          });

          // Update contextScores for each extracted context tag
          if (contextTags.length > 0) {
            const vaultItem = await prisma.assetVaultItem.findUnique({
              where: { id: refId },
              select: { contextScores: true },
            });
            if (vaultItem) {
              const scores = (vaultItem.contextScores as Record<string, number>) ?? {};
              for (const tag of contextTags) {
                scores[tag] = (scores[tag] ?? 0) + 1;
              }
              await prisma.assetVaultItem.update({
                where: { id: refId },
                data: { contextScores: scores },
              });
            }
          }
        }
        console.log(`[Feedback] Incremented usageScore for ${referencesUsed.length} refs (contexts: ${contextTags.join(", ") || "none"})`);
      }

      // 9. Auto-ingest accepted illustration/pictogram into vault
      if (jobMode === "illustration" || jobMode === "pictogram") {
        try {
          const artifacts = await prisma.artifact.findMany({
            where: { variantId: input.variantId, kind: { in: ["edited_png", "expanded_png", "final_png"] } },
            orderBy: { createdAt: "desc" },
          });
          const kindPriority: Record<string, number> = { edited_png: 0, expanded_png: 1, final_png: 2 };
          artifacts.sort((a, b) => (kindPriority[a.kind] ?? 99) - (kindPriority[b.kind] ?? 99));
          const bestArtifact = artifacts[0];

          if (bestArtifact) {
            const vaultItemId = `vault-gen-${bestArtifact.id}`;
            const description = variant.job?.description ?? "";
            const descSnippet = description.slice(0, 80).replace(/\s+/g, " ").trim() || "generated output";

            // Extract semantic tags from spec's Claude-analyzed subjects (highest quality signal)
            const acceptedSpec = variant.plannerSpec as Record<string, unknown> | null;
            const analysisSubjects = Array.isArray(acceptedSpec?.analysisSubjects)
              ? (acceptedSpec.analysisSubjects as string[]).map((s) => s.toLowerCase().trim()).filter(Boolean)
              : [];

            // Extract tags from description with proper stop-word filter
            const descTags = description
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, "")
              .split(/\s+/)
              .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
              .slice(0, 8);

            const tags = [...new Set([jobMode, ...analysisSubjects.slice(0, 5), ...descTags])];

            await prisma.assetVaultItem.upsert({
              where: { id: vaultItemId },
              create: {
                id: vaultItemId,
                type: jobMode,
                pathOrUrl: bestArtifact.url,
                tags,
                channelHints: [],
                notes: `Auto-ingested accepted ${jobMode}: ${descSnippet}`,
                analysisStatus: "pending",
              },
              update: {
                pathOrUrl: bestArtifact.url,
                tags,
                notes: `Auto-ingested accepted ${jobMode}: ${descSnippet}`,
                analysisStatus: "pending",
                analyzedAt: null,
              },
            });

            await inngest.send({ name: "vault/analyze", data: { vaultItemId } });
            console.log(`[Feedback] Auto-ingested ${jobMode} into vault: ${vaultItemId}`);
          }
        } catch (err) {
          console.warn("[Feedback] Vault ingestion failed (non-fatal):", err);
        }
      }
    }

    // ─── A/B CONTRAST LEARNING — accepted vs rejected sibling signal ───────
    if (input.decision === "accept" && jobId) {
      try {
        // Find sibling variants (same job, different variant)
        const allVariants = await prisma.variant.findMany({
          where: { jobId, id: { not: input.variantId } },
          include: { feedback: { orderBy: { createdAt: "desc" }, take: 1 } },
        });

        for (const sibling of allVariants) {
          const siblingDecision = sibling.feedback?.[0]?.decision;
          if (siblingDecision !== "reject") continue;

          // We have an accepted variant and a rejected sibling — extract contrast
          const acceptedArt = art;
          const rejectedArt = (sibling.plannerSpec as Record<string, unknown> | null)?.artDirection as Record<string, unknown> | undefined;

          if (!acceptedArt || !rejectedArt) continue;

          // Compare mood
          const acceptMood = acceptedArt.mood as string | undefined;
          const rejectMood = rejectedArt.mood as string | undefined;
          if (acceptMood && rejectMood && acceptMood !== rejectMood) {
            await upsertRule({
              content: `A/B contrast: "${acceptMood}" was preferred over "${rejectMood}" for this job type`,
              category: "style",
              source: "positive",
              priority: 3,
              sourceJobId: jobId,
              mode: jobMode,
            });
          }

          // Compare solidBackground
          const acceptBg = acceptedArt.solidBackground as string | undefined;
          const rejectBg = rejectedArt.solidBackground as string | undefined;
          if (acceptBg && rejectBg && acceptBg !== rejectBg) {
            await upsertRule({
              content: `A/B contrast: background "${acceptBg}" was preferred over "${rejectBg}"`,
              category: "style",
              source: "positive",
              priority: 2,
              sourceJobId: jobId,
              mode: jobMode,
            });
          }

          // Compare palette
          const acceptPalette = Array.isArray(acceptedArt.palette) ? (acceptedArt.palette as string[]) : [];
          const rejectPalette = Array.isArray(rejectedArt.palette) ? (rejectedArt.palette as string[]) : [];
          if (acceptPalette.length > 0 && rejectPalette.length > 0) {
            const acceptKey = acceptPalette.slice(0, 3).join(",");
            const rejectKey = rejectPalette.slice(0, 3).join(",");
            if (acceptKey !== rejectKey) {
              await upsertRule({
                content: `A/B contrast: palette [${acceptKey}] outperformed [${rejectKey}] — prefer the former for similar briefs`,
                category: "color",
                source: "positive",
                priority: 2,
                sourceJobId: jobId,
                mode: jobMode,
              });
            }
          }

          console.log(`[Feedback] A/B contrast rule(s) created: accepted variant ${variant.label} vs rejected sibling ${sibling.label}`);
        }
      } catch (err) {
        console.warn("[Feedback] A/B contrast learning failed (non-fatal):", err);
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
      include: { job: { select: { id: true, mode: true, rulesSnapshot: true, activeRuleIds: true } } },
    });

    const jobMode = variant?.job?.mode || "socials";
    const rulesSnapshot = variant?.job?.rulesSnapshot ?? null;
    const storedActiveRuleIds = variant?.job?.activeRuleIds ?? [];
    const spec = variant?.plannerSpec as Record<string, unknown> | null;
    const referencesUsed = Array.isArray(spec?.referencesUsed) ? (spec.referencesUsed as string[]) : [];

    // Revert rule counters for rules that were active during this job
    const enabledRules = await prisma.promptRule.findMany({
      where: { enabled: true, mode: jobMode },
      select: { id: true, content: true },
    });
    const activeRuleIds = storedActiveRuleIds.length > 0
      ? enabledRules.filter((r) => storedActiveRuleIds.includes(r.id)).map((r) => r.id)
      : rulesSnapshot
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

    // Revert template stats for ALL channels
    const templateAssetId = spec?.templateAssetId as string | undefined;
    const variantArtifactsForRevert = await prisma.artifact.findMany({
      where: { variantId: input.variantId, kind: "final_png" },
      select: { channel: true },
    });
    const revertChannels = [...new Set(
      variantArtifactsForRevert
        .map((a) => a.channel)
        .filter((ch) => ch && !["all", "illustration", "pictogram"].includes(ch))
    )];
    if (templateAssetId && revertChannels.length > 0) {
      for (const ch of revertChannels) {
        try {
          await prisma.templateStats.update({
            where: { templateId_channel: { templateId: templateAssetId, channel: ch } },
            data: {
              jobCount: { decrement: 1 },
              ...(latest.decision === "accept" ? { acceptCount: { decrement: 1 } } : {}),
              ...(latest.decision === "reject" ? { rejectCount: { decrement: 1 } } : {}),
            },
          });
        } catch {
          // Stats row may not exist yet — safe to ignore
        }
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

    // Remove auto-ingested vault item if reconsidering an illustration/pictogram accept
    if (latest.decision === "accept" && (jobMode === "illustration" || jobMode === "pictogram")) {
      try {
        const variantArtifacts = await prisma.artifact.findMany({
          where: { variantId: input.variantId, kind: { in: ["edited_png", "expanded_png", "final_png"] } },
          select: { id: true },
        });
        for (const art of variantArtifacts) {
          await prisma.assetVaultItem.deleteMany({ where: { id: `vault-gen-${art.id}` } });
        }
        clearVaultCache();
        console.log(`[Feedback] Removed vault items for reconsidered variant ${input.variantId}`);
      } catch (err) {
        console.warn("[Feedback] Vault cleanup failed (non-fatal):", err);
      }
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
