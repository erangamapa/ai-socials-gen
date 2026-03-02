import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const rules = await prisma.promptRule.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    const total = rules.length;
    const active = rules.filter((r) => r.enabled).length;
    const estimatedTokens = Math.ceil(
      rules.filter((r) => r.enabled).reduce((sum, r) => sum + r.content.length, 0) / 4
    );

    return NextResponse.json({ rules, stats: { total, active, estimatedTokens } });
  } catch (error) {
    console.error("Failed to list rules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const CreateRuleSchema = z.object({
  content: z.string().min(1).max(500),
  category: z.enum(["do", "dont", "general", "style", "composition", "color", "typography", "positive"]).default("general"),
  priority: z.number().int().min(1).max(5).default(3),
  source: z.enum(["manual", "feedback", "positive"]).default("manual"),
  sourceJobId: z.string().optional(),
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
