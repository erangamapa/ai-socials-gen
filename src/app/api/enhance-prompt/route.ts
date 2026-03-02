import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BRAND } from "@/lib/brand/guidelines";

const EnhanceSchema = z.object({
  text: z.string().min(1).max(2000),
  mode: z.enum(["socials", "illustration"]),
  field: z.enum(["brief", "reference"]),
});

const BRAND_CONTEXT = `Brand: ${BRAND.name} — "${BRAND.tagline}"
Brand idea: ${BRAND.brandIdea}
Colors: Orange ${BRAND.colors.primary.orange}, Purple ${BRAND.colors.primary.purple}, Blue ${BRAND.colors.primary.blue}, Yellow ${BRAND.colors.primary.yellow}
Dark grounds: ${BRAND.colors.dark.purple}, ${BRAND.colors.dark.blue}
Tone: ${BRAND.toneOfVoice.principles.map((p) => `${p.name} (${p.description.slice(0, 60)}...)`).join("; ")}
Behaviors: ${BRAND.brandBehaviors.join(", ")}`;

const SYSTEM_PROMPTS: Record<string, Record<string, string>> = {
  brief: {
    socials: `You enhance social media post briefs for ${BRAND.name}, a premium crypto sportsbook.

${BRAND_CONTEXT}

Take the user's rough brief and enhance it into a vivid, specific creative direction that a planner AI can work with. Add:
- Specific energy and mood direction (match CB's "We're All In" intensity)
- Color palette suggestions using brand colors where appropriate
- Composition hints (dramatic angles, dynamic movement, hero placement)
- Sports/betting atmosphere details that amplify excitement

Keep it 2-4 sentences. Stay concise — this feeds into a planner, not an image generator directly. Preserve the user's core intent and sport/event. Don't add quotation marks around the output.`,

    illustration: `You enhance illustration briefs for ${BRAND.name}, a premium crypto sportsbook.

${BRAND_CONTEXT}

The illustration style is: bold flat-vector, extreme foreshortening, dramatic low-angle/worm's-eye perspectives, hard edges, flat solid color fills, minimal facial detail, energy from body language. Think premium sports graphic art, NOT cartoonish.

Take the user's rough brief and enhance it with:
- Specific action moment (the peak instant of explosive movement)
- Perspective/angle direction (worm's-eye, low-angle, foreshortened lunge)
- Color palette using brand colors (orange, purple, blue, yellow on dark grounds)
- Dynamic energy details (speed lines, motion blur shapes, kinetic silhouettes)
- Body language and pose specifics

Keep it 3-5 sentences. Preserve the user's subject and sport. Don't add quotation marks around the output.`,
  },
  reference: {
    socials: `You enhance reference instructions for ${BRAND.name} social media post generation.

${BRAND_CONTEXT}

The user uploaded a reference image and wrote instructions for how the AI should use it. Sharpen their instructions with:
- Specific art direction language (pose, angle, color treatment, style cues)
- How the reference relates to the CB brand aesthetic
- Compositing/placement guidance if relevant

Keep it 1-3 sentences. Preserve the user's core intent. Don't add quotation marks around the output.`,

    illustration: `You enhance reference instructions for ${BRAND.name} character illustration generation.

${BRAND_CONTEXT}

The illustration style is: bold flat-vector, extreme foreshortening, dramatic perspectives, hard edges, flat solid colors, minimal facial detail.

The user uploaded a reference photo and wrote instructions. Sharpen them with:
- Specific flat-vector translation direction (what to extract vs what to stylize)
- Pose and energy amplification cues
- Color treatment using brand palette
- Perspective preference (worm's-eye, low-angle, foreshortened lunge)

Keep it 1-3 sentences. Preserve the user's core intent. Don't add quotation marks around the output.`,
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, mode, field } = EnhanceSchema.parse(body);

    const systemPrompt = SYSTEM_PROMPTS[field]?.[mode];
    if (!systemPrompt) {
      return NextResponse.json({ error: "Invalid field/mode combination" }, { status: 400 });
    }

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        { role: "user", content: `Enhance this ${field === "brief" ? "brief" : "reference instruction"}:\n\n${text}` },
      ],
    });

    const enhanced =
      response.content[0].type === "text" ? response.content[0].text.trim() : text;

    return NextResponse.json({ enhanced });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Enhance prompt failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enhancement failed" },
      { status: 500 }
    );
  }
}
