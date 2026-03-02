import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const UpdateRuleSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  category: z.string().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(5).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = UpdateRuleSchema.parse(body);

    const rule = await prisma.promptRule.update({
      where: { id },
      data: input,
    });

    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Failed to update rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.promptRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete rule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
