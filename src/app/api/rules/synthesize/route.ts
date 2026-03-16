import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { synthesizeRules } from "@/lib/ai/ruleSynthesis";
import { aiLimiter } from "@/lib/rate-limit";

const SynthesizeSchema = z.object({
  mode: z.enum(["socials", "illustration", "pictogram"]),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = aiLimiter.check(`synth:${ip}`);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { mode } = SynthesizeSchema.parse(body);

    const result = await synthesizeRules(mode);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Synthesis failed:", error);
    return NextResponse.json(
      { error: "Synthesis failed" },
      { status: 500 },
    );
  }
}
