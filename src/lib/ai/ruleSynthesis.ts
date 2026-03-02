import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";
import { z } from "zod";

const SynthesisOutputSchema = z.object({
  rules: z.array(
    z.object({
      content: z.string(),
      category: z.enum(["do", "dont", "style", "color", "composition", "typography", "general"]),
      confidence: z.number().min(0).max(100),
    })
  ),
  reasoning: z.string(),
  supersededIds: z.array(z.string()),
});

type SynthesisResult = {
  created: number;
  disabled: number;
  reasoning: string;
};

export async function synthesizeRules(mode: string): Promise<SynthesisResult> {
  const existingRules = await prisma.promptRule.findMany({
    where: { enabled: true, mode },
    orderBy: [{ confidence: "desc" }, { priority: "desc" }],
    select: {
      id: true,
      content: true,
      category: true,
      source: true,
      priority: true,
      hitCount: true,
      successCount: true,
      confidence: true,
      createdAt: true,
    },
  });

  const recentFeedback = await prisma.feedback.findMany({
    where: { variant: { job: { mode } } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      variant: {
        select: {
          plannerSpec: true,
          job: { select: { description: true } },
        },
      },
    },
  });

  if (existingRules.length < 3 && recentFeedback.length < 3) {
    return { created: 0, disabled: 0, reasoning: "Not enough data to synthesize" };
  }

  const rulesText = existingRules
    .map(
      (r) =>
        `[ID:${r.id}] (${r.category}, confidence:${r.confidence}, hits:${r.hitCount}, successes:${r.successCount}, source:${r.source}) "${r.content}"`
    )
    .join("\n");

  const feedbackText = recentFeedback
    .map((f) => {
      const spec = f.variant?.plannerSpec as Record<string, unknown> | null;
      const art = spec?.artDirection as Record<string, unknown> | undefined;
      const style = [art?.mood, art?.style].filter(Boolean).join(", ");
      return `${f.decision.toUpperCase()}: reasons=[${f.reasons.join(", ")}] notes="${f.notes || ""}" style="${style}"`;
    })
    .join("\n");

  const ruleIds = existingRules.map((r) => r.id);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: `You are a design system analyst for CB, a crypto sports betting brand. Analyze the current ${mode} rules and recent feedback patterns to produce a consolidated, non-redundant rule set.

Guidelines:
- Merge rules that say the same thing in different ways into one stronger rule
- Remove rules contradicted by recent accepts (if a pattern was accepted, the "avoid" rule for it should go)
- Strengthen rules confirmed by multiple rejects
- Keep high-confidence, high-success-rate rules intact
- Aim for fewer, clearer rules (quality over quantity)
- Each rule should be actionable and specific

Return ONLY valid JSON matching this schema:
{
  "rules": [{ "content": string, "category": "do"|"dont"|"style"|"color"|"composition"|"typography"|"general", "confidence": 0-100 }],
  "reasoning": "brief explanation of consolidation decisions",
  "supersededIds": ["list of existing rule IDs that the new rules replace"]
}`,
    messages: [
      {
        role: "user",
        content: `Current ${mode} rules:\n${rulesText || "(none)"}\n\nRecent feedback:\n${feedbackText || "(none)"}\n\nConsolidate these into an optimal rule set. Return JSON only.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  let parsed: z.infer<typeof SynthesisOutputSchema>;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    parsed = SynthesisOutputSchema.parse(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("[RuleSynthesis] Failed to parse Claude response:", text.slice(0, 500));
    throw new Error(`Synthesis parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let disabled = 0;
  if (parsed.supersededIds.length > 0) {
    const validIds = parsed.supersededIds.filter((id) => ruleIds.includes(id));
    if (validIds.length > 0) {
      const result = await prisma.promptRule.updateMany({
        where: { id: { in: validIds } },
        data: { enabled: false },
      });
      disabled = result.count;
    }
  }

  let created = 0;
  for (const rule of parsed.rules) {
    const existing = await prisma.promptRule.findFirst({
      where: { content: rule.content, mode },
    });
    if (!existing) {
      await prisma.promptRule.create({
        data: {
          content: rule.content,
          category: rule.category,
          confidence: rule.confidence,
          source: "synthesis",
          priority: Math.round(rule.confidence / 20),
          mode,
        },
      });
      created++;
    }
  }

  console.log(
    `[RuleSynthesis] ${mode}: ${created} rules created, ${disabled} superseded. Reasoning: ${parsed.reasoning.slice(0, 200)}`
  );

  return { created, disabled, reasoning: parsed.reasoning };
}
