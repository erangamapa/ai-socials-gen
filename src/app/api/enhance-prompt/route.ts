import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BRAND } from "@/lib/brand/guidelines";
import { buildRulesBlock } from "@/lib/ai/promptBuilder";
import { aiLimiter } from "@/lib/rate-limit";

const EnhanceSchema = z.object({
  text: z.string().min(1).max(2000),
  mode: z.enum(["socials", "illustration", "pictogram"]),
  field: z.enum(["brief", "reference"]),
});

const BRAND_CONTEXT = `Brand: ${BRAND.name} — "${BRAND.tagline}"
Brand idea: ${BRAND.brandIdea}
Colors: Orange ${BRAND.colors.primary.orange}, Purple ${BRAND.colors.primary.purple}, Blue ${BRAND.colors.primary.blue}, Yellow ${BRAND.colors.primary.yellow}
Dark grounds: ${BRAND.colors.dark.purple}, ${BRAND.colors.dark.blue}
Tone: ${BRAND.toneOfVoice.principles.map((p) => `${p.name} (${p.description.slice(0, 60)}...)`).join("; ")}
Behaviors: ${BRAND.brandBehaviors.join(", ")}`;

const RULES_PREAMBLE = `If AGENT KNOWLEDGE is provided at the end of this prompt, incorporate it naturally into your enhancement — let past learnings (what worked, what to avoid) guide your creative choices without making the output feel mechanical.`;

const SYSTEM_PROMPTS: Record<string, Record<string, string>> = {
  brief: {
    pictogram: `You are a creative icon art director for ${BRAND.name}, a premium crypto sportsbook. You enhance pictogram briefs into vivid, specific icon generation directions.

${BRAND_CONTEXT}

CB pictograms are FLAT VECTOR TOON icons: clean geometric shapes drawn from a slight 3D perspective angle, with cel-shading (2-3 hard-edged flat highlight/shadow planes per surface — like a cartoon, NOT smooth gradients or volumetric CGI). Bold colour fills, crisp edges, solid dark background (#0F0A1A or #120D20).

Be CREATIVE and EXPRESSIVE — every icon concept deserves its own personality. Think about:
- What single object or shape captures the concept most powerfully
- The most interesting perspective angle that gives the icon life (slight isometric lean, 3/4 view, front-on with drama)
- Which category colour palette to use (CB purple for Casino/Slots/Utility; black+gold for VIP; crimson red for MMA; object's natural vivid colours for Sports; dark navy for Crypto)
- The cel-shading treatment: where the hard highlight plane and shadow plane fall on the form
- What makes this icon immediately readable at thumbnail size (64px)

Do NOT suggest energy trails, particle bursts, radiating sparks, floating fragments, or glowing halos around the icon. The power comes from shape, colour, and the toon rendering — not effects.

Keep it 2-3 punchy sentences. Preserve the user's concept. Don't wrap in quotation marks.

${RULES_PREAMBLE}`,

    socials: `You are a creative director for ${BRAND.name}, a premium crypto sportsbook. You enhance social media post briefs into vivid, specific creative directions.

${BRAND_CONTEXT}

Be EXPRESSIVE and VARIED — every brief deserves a fresh creative take. Think about the specific emotion of this moment: the edge-of-your-seat tension, the victory euphoria, the championship stakes. The mood should match the concept — raw intensity for combat, surgical precision for snooker, explosive release for a goal. Don't apply the same formula to every brief.

Enhance with:
- The specific emotional moment and atmosphere (what does this instant FEEL like?)
- Mood and energy direction — varies by concept, don't default to "explosive"
- Colour palette using brand colours where they serve the brief
- Composition idea: hero placement, scale, angle — something interesting, not just "center-frame dramatic"
- Brand connection: how does this touch "We're All In"?

Keep it 2-4 sentences. This feeds a planner AI so stay concise but vivid. Preserve the core intent and sport/event. Don't wrap in quotation marks.

${RULES_PREAMBLE}`,

    illustration: `You are a creative art director for ${BRAND.name}, a premium crypto sportsbook. You enhance illustration briefs into rich, specific image generation directions.

${BRAND_CONTEXT}

The illustration style is: bold flat-vector, clean hard edges, flat solid colour fills, minimal facial detail — energy and personality come entirely from pose, body language, and composition. Think premium sports graphic art, not cartoonish. Characters stand alone on a solid dark background with no environment.

Be CREATIVE and VARIED — different sports and subjects call for different moods and approaches:
- A boxer might demand stoic intensity and raw power; a sprinter, coiled release; a tennis player, surgical elegance
- Find the single most revealing action moment — the instant that tells the whole story
- Choose a perspective that amplifies the feeling: low-angle for heroism, foreshortened for dynamism, side-profile for speed
- Pick a colour palette from the brand range that suits the mood and subject
- Describe pose and body language with specific, vivid language

Do NOT add energy lines, particle bursts, shards, debris, sparks, floating elements, or speed streaks. The illustration is a clean character on a solid background — the power comes from form and colour, not effects.

Keep it 3-5 sentences. Preserve the user's subject and sport. Don't wrap in quotation marks.

${RULES_PREAMBLE}`,
  },
  reference: {
    pictogram: `You are a creative icon art director for ${BRAND.name}. The user has uploaded a reference image and written instructions for what concept to iconify as a CB pictogram.

${BRAND_CONTEXT}

CB pictograms are FLAT VECTOR TOON icons: clean geometric shapes from a slight 3D perspective, with cel-shading (hard-edged flat highlight/shadow planes — cartoon style, not smooth gradients). Solid dark background (#0F0A1A).

Sharpen their reference instructions with:
- What to extract from the reference and what to translate into iconic form
- The toon cel-shading approach: where the highlight and shadow planes will fall on the main form
- Which CB colour palette applies to this category
- The perspective angle that gives this icon the most character

Do NOT suggest energy effects, glows, particles, or radiating elements around the icon.

Keep it 1-2 sentences. Preserve the core intent. Don't wrap in quotation marks.

${RULES_PREAMBLE}`,

    socials: `You are a creative director for ${BRAND.name}. The user has uploaded a reference image and written instructions for how the AI should use it in a social media post.

${BRAND_CONTEXT}

Sharpen their reference instructions with specific, expressive art direction language:
- What to extract from the reference (pose, energy, expression, colours, action)
- How to translate it into CB's visual language and brand aesthetic
- Composition and placement guidance that serves the brief
- Any colour treatment direction using the brand palette

Keep it 1-3 sentences. Preserve the core intent. Don't wrap in quotation marks.

${RULES_PREAMBLE}`,

    illustration: `You are a creative art director for ${BRAND.name}. The user has uploaded a reference photo and written instructions for a flat-vector character illustration.

${BRAND_CONTEXT}

The illustration style is: bold flat-vector, clean hard edges, flat solid colour fills, minimal facial detail. Characters stand on a solid dark background with no environment or effects.

Sharpen their reference instructions with:
- What to extract from the reference photo (build, posture, sport-specific gear, characteristic gesture)
- How to translate the pose into flat-vector — what makes this body language read clearly in the style
- The specific action moment or attitude to capture
- Perspective direction and colour treatment

Do NOT add energy amplification language that suggests effects, particles, or floating elements — energy comes from pose and form.

Keep it 1-3 sentences. Preserve the core intent. Don't wrap in quotation marks.

${RULES_PREAMBLE}`,
  },
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = aiLimiter.check(`enhance:${ip}`);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { text, mode, field } = EnhanceSchema.parse(body);

    const baseSystemPrompt = SYSTEM_PROMPTS[field]?.[mode];
    if (!baseSystemPrompt) {
      return NextResponse.json({ error: "Invalid field/mode combination" }, { status: 400 });
    }

    // Inject the agent's learned rules so suggestions evolve with accumulated knowledge
    let systemPrompt = baseSystemPrompt;
    try {
      const rules = await buildRulesBlock(mode);
      if (rules.text && rules.ruleCount > 0) {
        systemPrompt = baseSystemPrompt + `\n\nAGENT KNOWLEDGE — ${rules.ruleCount} active learned rules from past generations (incorporate naturally):\n${rules.text}`;
      }
    } catch {
      // Non-fatal — proceed without rules if DB is unavailable
    }

    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 450,
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
      { error: "Enhancement failed" },
      { status: 500 },
    );
  }
}
