import Anthropic from "@anthropic-ai/sdk";
import { Planner, PlannerInput, PlannerOutput, PlannerOutputSchema } from "./types";
import { buildSystemPrompt, PLANNER_USER_TEMPLATE } from "./prompts";
import { TEMPLATE_REGISTRY } from "../templates/registry";

export class MockClaudePlanner implements Planner {
  async plan(input: PlannerInput): Promise<PlannerOutput> {
    await new Promise((r) => setTimeout(r, 500));

    const compatibleTemplates = TEMPLATE_REGISTRY.filter((t) =>
      input.channels.some((ch) => t.spec.channels.includes(ch as "twitter" | "ig_feed" | "ig_story" | "email_header"))
    );

    const pickTemplate = (idx: number) =>
      compatibleTemplates[idx % compatibleTemplates.length]?.id ?? TEMPLATE_REGISTRY[0].id;

    const refIds = input.vaultReferences.slice(0, 3).map((r) => r.id);

    const palettes = [
      ["#0B1120", "#1E40AF", "#F59E0B", "#10B981"],
      ["#0F172A", "#7C3AED", "#EC4899", "#06B6D4"],
      ["#1A1A2E", "#E94560", "#FFD700", "#16213E"],
    ];

    const moods = ["Bold & Energetic", "Premium & Sleek", "Dynamic & Vibrant"];
    const styles = ["high-contrast-dark", "gradient-luxury", "neon-sport"];

    const output: PlannerOutput = {
      variants: [
        {
          variantLabel: "A",
          templateId: pickTemplate(0),
          copy: {
            headline: `${input.description.split(" ").slice(0, 4).join(" ")} Now Live`,
            subhead: "Experience the thrill with the best odds in crypto betting",
            cta: "Bet Now",
            disclaimer: "18+ | Gamble responsibly",
          },
          artDirection: {
            palette: palettes[0],
            mood: moods[0],
            style: styles[0],
            backgroundPrompt: `Bold stylized athlete in dynamic action pose, center-stage. Low-angle hero perspective, electric blue and orange palette, bold solid fills with dramatic drop shadows, clean vector illustration style. Zero background — template is the canvas. Energetic, premium sportsbook feel.`,
          },
          referencesUsed: refIds.slice(0, 2),
        },
        {
          variantLabel: "B",
          templateId: pickTemplate(1),
          copy: {
            headline: `Don't Miss ${input.description.split(" ").slice(0, 3).join(" ")}`,
            subhead: "Best live odds updated in real time",
            cta: "Play Now",
            disclaimer: "18+ | Gamble responsibly",
          },
          artDirection: {
            palette: palettes[1],
            mood: moods[1],
            style: styles[1],
            backgroundPrompt: `Alternative angle — same sport subject but captured from a bird's-eye or side perspective. Sleek purple and white palette, smooth gradient shading with editorial illustration finish. Subject positioned off-centre to the right, leaving room for copy. Premium, minimalist energy.`,
          },
          referencesUsed: refIds.slice(0, 2),
        },
      ],
      reasoning: `Generated 2 variants for "${input.description}" targeting ${input.channels.join(", ")}. Used ${input.vaultReferences.length} vault references for style guidance.`,
    };

    return PlannerOutputSchema.parse(output);
  }
}

export class RealClaudePlanner implements Planner {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }

  async plan(input: PlannerInput): Promise<PlannerOutput> {
    const templateSummary = TEMPLATE_REGISTRY.map(
      (t) => `- ${t.id} "${t.name}" channels=[${t.spec.channels.join(",")}] visual=${t.spec.visualPlacement}`
    ).join("\n");

    const templateItems = input.vaultReferences.filter((r) => r.type === "template");
    const illustrationItems = input.vaultReferences.filter((r) => r.type === "illustration");
    const otherItems = input.vaultReferences.filter((r) => r.type !== "template" && r.type !== "illustration");

    const formatRef = (ref: typeof input.vaultReferences[0]) => {
      let line = `- ${ref.id} [${ref.type}] tags=[${ref.tags.join(",")}]`;
      if (ref.analysisSubjects?.length) line += `\n  Subjects: ${ref.analysisSubjects.join(", ")}`;
      if (ref.analysisDescription) line += `\n  Description: ${ref.analysisDescription}`;
      if (ref.analysisStyleNotes) line += `\n  Style: ${ref.analysisStyleNotes}`;
      if (ref.analysisColorPalette?.length) line += `\n  Colors: ${ref.analysisColorPalette.join(", ")}`;
      if (ref.analysisMood) line += `\n  Mood: ${ref.analysisMood}`;
      if (ref.analysisComposition) line += `\n  Composition: ${ref.analysisComposition}`;
      if (ref.notes) line += `\n  Notes: ${ref.notes}`;
      return line;
    };

    const sections: string[] = [];
    if (templateItems.length > 0) {
      sections.push("TEMPLATES (pick one as your canvas — REQUIRED):\n" + templateItems.map(formatRef).join("\n"));
    }
    if (illustrationItems.length > 0) {
      sections.push("ILLUSTRATIONS (pick 2-5 as style references for the image generator):\n" + illustrationItems.map(formatRef).join("\n"));
    }
    if (otherItems.length > 0) {
      sections.push("OTHER REFERENCES:\n" + otherItems.map(formatRef).join("\n"));
    }
    const vaultSummary = sections.join("\n\n");

    const userMessage = PLANNER_USER_TEMPLATE({
      description: input.description,
      channels: input.channels,
      templateSummary,
      vaultSummary,
    });

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        { role: "user", content: userMessage },
      ],
      system: buildSystemPrompt(input.rulesBlock || ""),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[Planner] Invalid JSON from Claude:", cleaned.slice(0, 500));
      throw new Error("Claude planner returned invalid JSON");
    }

    console.log("[Planner] Raw keys:", Object.keys(parsed).join(", "));
    console.log("[Planner] Variants type:", Array.isArray(parsed.variants) ? `array[${(parsed.variants as unknown[]).length}]` : typeof parsed.variants);
    const firstVariantRaw = Array.isArray(parsed.variants) ? (parsed.variants as unknown[])[0] : parsed.variants;
    console.log("[Planner] Raw first variant:", String(JSON.stringify(firstVariantRaw) ?? "null").slice(0, 2000));

    const normalized = this.normalizeOutput(parsed);
    const result = PlannerOutputSchema.safeParse(normalized);
    if (!result.success) {
      console.error("[Planner] Zod failed:", result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      console.error("[Planner] First variant sample:", String(JSON.stringify((normalized.variants as unknown[])?.[0] ?? {}) ?? "{}").slice(0, 500));
      throw new Error("Planner validation failed: " + result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const v = result.data.variants[0];
    const promptLen = v.artDirection.backgroundPrompt.length;
    const wordCount = v.artDirection.backgroundPrompt.split(/\s+/).length;
    console.log(`[Planner] OK: "${v.copy.headline}" | prompt: ${wordCount} words (${promptLen} chars) | template: ${(v as Record<string, unknown>).templateAssetId || "none"} | refs: ${v.referencesUsed.length}`);
    console.log(`[Planner] Prompt preview: ${v.artDirection.backgroundPrompt.slice(0, 200)}...`);
    return result.data;
  }

  private normalizeOutput(raw: Record<string, unknown>): Record<string, unknown> {
    const labels: Array<"A" | "B"> = ["A", "B"];

    let variants: Record<string, unknown>[];
    if (Array.isArray(raw.variants)) {
      variants = raw.variants;
    } else if (raw.variants && typeof raw.variants === "object") {
      variants = [raw.variants as Record<string, unknown>];
    } else if (raw.variant && typeof raw.variant === "object") {
      variants = Array.isArray(raw.variant) ? raw.variant : [raw.variant as Record<string, unknown>];
    } else {
      console.warn("[Planner] No variants wrapper — reconstructing from flat response");
      variants = [{ ...raw, variantLabel: "A" }];
    }

    const defaultTemplateId = TEMPLATE_REGISTRY[0]?.id ?? "tpl-centered-hero";

    const normalized = variants.slice(0, 2).map((v, i) => {
      const label = String(v.variantLabel || v.variant_label || v.label || "").toUpperCase().trim();
      const variantLabel = (["A", "B"].includes(label) ? label : labels[i]) as "A" | "B";

      let copyObj: Record<string, unknown>;
      if (typeof v.copy === "object" && v.copy !== null) {
        copyObj = v.copy as Record<string, unknown>;
      } else {
        copyObj = {
          headline: v.headline || "",
          subhead: v.subhead || v.sub_head || "",
          cta: v.cta || "",
          disclaimer: v.disclaimer || "",
        };
      }

      const coerceRefInstructions = (val: unknown): string => {
        if (!val) return "";
        if (typeof val === "string") return val;
        if (Array.isArray(val)) return val.join("\n");
        if (typeof val === "object") return Object.entries(val as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join("\n");
        return String(val);
      };

      let artObj: Record<string, unknown>;
      if (typeof v.artDirection === "object" && v.artDirection !== null) {
        const a = v.artDirection as Record<string, unknown>;
        artObj = { ...a, referenceInstructions: coerceRefInstructions(a.referenceInstructions ?? a.reference_instructions) };
      } else if (typeof v.art_direction === "object" && v.art_direction !== null) {
        const a = v.art_direction as Record<string, unknown>;
        artObj = { ...a, referenceInstructions: coerceRefInstructions(a.referenceInstructions ?? a.reference_instructions) };
      } else {
        artObj = {
          backgroundPrompt: v.backgroundPrompt || v.background_prompt || v.imagePrompt || v.image_prompt || "",
          palette: v.palette || v.colorPalette || v.color_palette || [],
          mood: v.mood || "",
          style: v.style || "",
          referenceInstructions: coerceRefInstructions(v.referenceInstructions || v.reference_instructions),
        };
      }

      return {
        ...v,
        variantLabel,
        templateId: v.templateId || v.template_id || defaultTemplateId,
        templateAssetId: v.templateAssetId || v.template_asset_id || undefined,
        referencesUsed: v.referencesUsed || v.references_used || v.references || [],
        copy: { headline: "", cta: "", ...copyObj },
        artDirection: { palette: [], mood: "", style: "", backgroundPrompt: "", ...artObj },
      };
    });

    return { ...raw, variants: normalized };
  }
}

export function getPlanner(): Planner {
  if (process.env.USE_MOCK_PROVIDERS === "true") {
    return new MockClaudePlanner();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new RealClaudePlanner();
  }
  console.warn("No ANTHROPIC_API_KEY set, falling back to mock planner");
  return new MockClaudePlanner();
}
