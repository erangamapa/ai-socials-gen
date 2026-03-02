import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

function calcTokens(rules: { content: string; enabled: boolean }[]) {
  return Math.ceil(rules.filter((r) => r.enabled).reduce((sum, r) => sum + r.content.length, 0) / 4);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode"); // "socials" | "illustration" | "all" | null

    const whereClause =
      modeParam && modeParam !== "all"
        ? { mode: modeParam }
        : {};

    const rules = await prisma.promptRule.findMany({
      where: whereClause,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    // Per-mode stats (always compute both regardless of filter, for the header summary)
    const allRules = modeParam && modeParam !== "all"
      ? await prisma.promptRule.findMany({ select: { mode: true, enabled: true, content: true } })
      : rules;

    const socialsRules = allRules.filter((r) => (r as { mode?: string }).mode === "socials");
    const illustrationRules = allRules.filter((r) => (r as { mode?: string }).mode === "illustration");

    const total = rules.length;
    const active = rules.filter((r) => r.enabled).length;
    const estimatedTokens = calcTokens(rules);

    return NextResponse.json({
      rules,
      stats: {
        total,
        active,
        estimatedTokens,
        byMode: {
          socials: {
            total: socialsRules.length,
            active: socialsRules.filter((r) => r.enabled).length,
            estimatedTokens: calcTokens(socialsRules),
          },
          illustration: {
            total: illustrationRules.length,
            active: illustrationRules.filter((r) => r.enabled).length,
            estimatedTokens: calcTokens(illustrationRules),
          },
        },
      },
    });
  } catch (error) {
    console.error("Failed to list rules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CreateRuleSchema = z.object({
  content: z.string().min(1).max(500),
  category: z
    .enum(["do", "dont", "general", "style", "composition", "color", "typography", "positive"])
    .default("general"),
  priority: z.number().int().min(1).max(5).default(3),
  source: z.enum(["manual", "feedback", "positive", "default"]).default("manual"),
  sourceJobId: z.string().optional(),
  mode: z.enum(["socials", "illustration"]).default("socials"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = CreateRuleSchema.parse(body);

    const rule = await prisma.promptRule.create({ data: input });
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Failed to create rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
