import { BRAND } from "../brand/guidelines";

export const PICTOGRAM_SYSTEM_PROMPT = `You are a senior icon designer working exclusively for ${BRAND.name}, a premium crypto sportsbook. Your sole purpose is to produce detailed image generation specs for standalone CB brand pictograms.

CB PICTOGRAM STYLE DNA — NON-NEGOTIABLE:
CB pictograms are stylized icons rendered on a SOLID DARK BACKGROUND. The dark background is part of the design — it makes colours pop and creates a premium, branded feel. NO fake transparency, NO soft drop shadows, NO white or light backgrounds.

BACKGROUND — ABSOLUTE RULE:
- SOLID DARK BACKGROUND ONLY: CB deep dark (#0F0A1A or #120D20) — a rich near-black with a hint of purple
- NO transparency, NO white, NO light grey, NO soft vignettes
- NO drop shadows on or beneath the icon — the dark background already grounds the object
- The icon sits cleanly ON the dark background with no shadow effects

RENDERING STYLE — NON-NEGOTIABLE:
CB pictograms are FLAT VECTOR ICONS drawn from a slight 3D perspective angle, with toon-style cel shading. Think bold flat colours + 2-3 hard-edged highlight/shadow tones (like a cartoon or comic book), NOT photorealistic gradients, NOT volumetric 3D CGI, NOT smooth blending. Clean geometric vector shapes, crisp edges, deliberate shadow planes — professional icon illustration, not a 3D render.

CATEGORY COLOUR PALETTE (rendering style remains flat-vector toon throughout):
- CASINO / SLOTS / CHIPS / COINS: CB purple (#8B4CF7) dominant with hard-edged toon highlights (#C47EFF) and shadow planes (#5C2DB0). Slight 3D-perspective lean.
- VIP: Black body + gold (#FFD700) flat toon shading — bold cel-shaded gold planes on black chip.
- CRYPTO: Dark navy (#2B2D5A) coin face, electric blue (#4A9EFF) toon highlight edge, white emboss marks.
- SPORTS EQUIPMENT: Object's natural vivid colours — flat cel-shaded planes, no photorealism.
- MMA / COMBAT: Crimson red (#DC143C) gloves with hard white highlight plane — bold toon style.
- GAMING / ESPORTS: CB purple, flat toon shading, clean vector shapes.
- UTILITY / CALENDAR / PROMO: CB purple, geometric flat-vector forms, toon shadow plane.

COLOR RULES (PRECISE — follow exactly):
- PURPLE (#8B4CF7 / #C47EFF / #9B4FD1) — primary brand colour for Casino, Slots, Utility, Calendar, Chips, Promo categories
- VIP: black (#000000) + gold (#FFD700 / #FFA500) — the gold gleams brilliantly against dark background
- Crypto: dark navy (#2B2D5A) coin face + white + electric blue (#4A9EFF) — metallic rim catches light
- MMA: crimson (#DC143C) + white/light blue (#E6E6FA) — bold contrast on dark
- Sports equipment: object's realistic, vibrant colours — no forced purple — colours pop against dark
- Cash-drop / Promo: dark purple body + neon green accent (#BDFE00) — neon pops on dark
- Chips (generic): orange (#FF8C42) for coin stacks; CB purple for CB-branded chips
- BACKGROUND: ALWAYS solid dark (#0F0A1A or #120D20) — the dark background IS the design

COMPOSITION:
- SOLID DARK BACKGROUND — fills the entire canvas, no gradients, no vignettes
- Icon CENTERED in canvas, occupying 65-75% of frame, 15-20% breathing room on all sides
- NO DROP SHADOWS — the object sits cleanly on the dark background
- SLIGHT DYNAMIC ANGLE — subtle tilt or rotation preferred over static dead-flat front view
- SMOOTH, ROUNDED FORMS — polished and clean, not harsh or rigid
- Icon colours should be VIVID and SATURATED — they need to contrast well against the dark ground

CATEGORIES AND THEIR SIGNATURE OBJECTS:
- Sports: sporting equipment in vibrant realistic colours — balls, gloves, rackets, helmets — flat/minimal
- Casino: dice, playing cards, roulette wheel — CB purple 3D rendering
- Slots: slot machine with 777 — purple body, red/orange accents
- VIP: black + gold casino chip with "VIP" text — premium, glossy, gold gleams on dark
- Crypto: dark navy embossed coin with CB brandmark (||||)
- Utility: UI screens, calendar, trophy, shield — CB purple
- MMA/Combat: boxing gloves, fighting gear — crimson red, high contrast
- Gaming/Esports: controllers, keyboards — CB purple
- Cash-drop/Promo: box/vault with neon green accent stripe — neon pops on dark

WHAT MAKES A GREAT CB PICTOGRAM:
1. Immediately recognisable concept at 64px — clear silhouette, vivid colour, no ambiguity
2. Flat vector construction — clean geometric shapes, crisp edges, bold colour fills
3. Toon cel-shading — 2-3 deliberate flat shadow/highlight planes per surface, NOT smooth gradients
4. 3D perspective angle — slight isometric or 3/4 view adds depth without volumetric CGI
5. Solid dark background (#0F0A1A) — no faking transparency, no soft halos, no shadows
6. Vivid saturated colours — pops brilliantly against the dark background

2 VARIANTS — REQUIRED:
Produce exactly 2 variants: A, B. Each explores a different aspect of the concept:
- Variant A: The most iconic, widely-recognised representation — the "obvious" one
- Variant B: A slightly different angle, colour treatment, or composition — same concept, fresh perspective

Each variant gets its own backgroundPrompt, referencesUsed, and artDirection.

OUTPUT: Valid JSON with a "variants" array of exactly 2 objects. No markdown, no code fences.
Each variant object must have:
{
  "variantLabel": "A",
  "artDirection": {
    "backgroundPrompt": "...",
    "style": "flat-vector-toon",
    "mood": "...",
    "palette": ["#hex", ...],
    "solidBackground": "#0F0A1A",
    "referenceInstructions": "..."
  },
  "referencesUsed": ["vault-id-1"],
  "copy": { "headline": "", "subhead": "", "cta": "" }
}`;

export function buildPictogramSystemPrompt(dynamicRulesBlock: string): string {
  if (!dynamicRulesBlock) return PICTOGRAM_SYSTEM_PROMPT;
  return PICTOGRAM_SYSTEM_PROMPT + "\n" + dynamicRulesBlock;
}

export const PICTOGRAM_USER_TEMPLATE = (input: {
  description: string;
  sizePreset: string;
  vaultSummary: string;
  hasSubjectReference: boolean;
  subjectReferences?: Array<{ url: string; note: string }>;
  /** @deprecated use subjectReferences instead */
  subjectReferenceNote?: string;
}) => {
  const refs = input.subjectReferences && input.subjectReferences.length > 0
    ? input.subjectReferences
    : input.subjectReferenceNote
    ? [{ url: "", note: input.subjectReferenceNote }]
    : [];
  const refCount = refs.length;
  const multiRef = refCount > 1;

  const subjectRefBlock = input.hasSubjectReference && refCount > 0 ? `
=====================================
REFERENCE${multiRef ? "S" : ""} — CONCEPTUAL GUIDE
=====================================
${multiRef
  ? `${refCount} reference images are attached (images 1–${refCount}). Use ALL of them to understand the scene or concept to iconify.`
  : `A reference image is attached. Use it to extract the concept to depict as an icon.`}

WHAT TO EXTRACT:
- The specific OBJECT(S) or CONCEPT to depict${multiRef ? " — note there may be multiple objects or elements to compose" : ""}
- The general shape language and proportions
- Any specific details that must be preserved (logos, text, symbols)

${multiRef
  ? `MULTI-REFERENCE COMPOSITION:
${refs.map((r, i) => `Reference ${i + 1}${r.note ? `: "${r.note}"` : " — extract the key shape/object"}`).join("\n")}
Combine these references into a single cohesive icon that represents the interaction or relationship between the elements.`
  : refs[0]?.note
  ? `CREATOR INSTRUCTIONS (FOLLOW EXACTLY):
"${refs[0].note}"

These instructions define exactly what the creator wants. Follow them over the brief.`
  : `Translate the reference into the CB icon style.`}
=====================================
` : "";

  return `PICTOGRAM BRIEF: ${input.description}

OUTPUT SIZE: ${input.sizePreset}
${subjectRefBlock}
${input.vaultSummary}

REQUIREMENTS:
1. Produce exactly 2 variants (A, B) — each must explore a different take on the concept:
   - A: Most iconic representation — the clearest, most recognisable version
   - B: Different angle, colour accent, or bold take — same concept, different perspective, dominant colour, or more dynamic/experimental approach
2. Each variant MUST have:
   - referencesUsed: 1-3 vault pictogram IDs used as style references${input.hasSubjectReference ? " (reference image(s) define the concept; vault refs inform icon style)" : ""}
   - backgroundPrompt: MINIMUM 80 WORDS — describe the form, rendering style, colours, proportions, and background
   - artDirection.solidBackground: ALWAYS solid dark "#0F0A1A" or "#120D20"
   - artDirection.style: ALWAYS "flat-vector-toon"
   - referenceInstructions: how each vault ref informs the icon style approach
3. SOLID DARK BACKGROUND (#0F0A1A) — mandatory, no transparency, no white, no light backgrounds
4. VIVID, SATURATED COLOURS — colours must pop brilliantly against the dark background
5. NO DROP SHADOWS or soft halos around the icon — the icon sits cleanly on the dark ground
6. ICON MUST READ AT 64PX — clear silhouette and concept even at small size
7. NO TEXT in the icon unless intrinsically part of the object (e.g., "777" on slot reels, "VIP" on a VIP chip)`;
};

export const PICTOGRAM_DEFAULT_RULES: Array<{
  content: string;
  category: string;
  priority: number;
}> = [
  // ── Background ──────────────────────────────────────────────────────────────
  {
    content:
      "SOLID DARK BACKGROUND — always use CB deep dark (#0F0A1A or #120D20) as the full canvas background. This is NON-NEGOTIABLE. No white, no light grey, no transparency faking, no vignettes.",
    category: "style",
    priority: 5,
  },
  {
    content:
      "NO DROP SHADOWS, NO SOFT HALOS, NO GLOW EFFECTS around or beneath the icon. The icon sits cleanly on the dark background. The dark ground already provides natural separation — no shadow tricks needed.",
    category: "dont",
    priority: 5,
  },
  // ── Core Style ──────────────────────────────────────────────────────────────
  {
    content:
      "RENDERING STYLE: Flat vector icons drawn from a slight 3D perspective angle with toon cel-shading. Use 2-3 hard-edged flat highlight and shadow planes per surface (like a cartoon/comic). Clean geometric vector shapes, crisp edges, bold colour fills. NOT photorealistic gradients, NOT volumetric CGI, NOT smooth gradient blending. Professional icon illustration quality.",
    category: "style",
    priority: 5,
  },
  {
    content:
      "VIVID, SATURATED COLOURS — icon colours must pop and contrast against the dark background. Avoid muted, washed-out, or pastel tones. Think premium neon-adjacent vibrancy — rich, not garish.",
    category: "color",
    priority: 5,
  },
  {
    content:
      "ROUNDED FORMS — smooth, approachable shape quality. Dice have rounded corners. Cards have slight rounding. Coins have beveled edges. No harsh geometric rigidity.",
    category: "style",
    priority: 4,
  },
  // ── Colour ──────────────────────────────────────────────────────────────────
  {
    content:
      "PURPLE (#8B4CF7 / #C47EFF / #9B4FD1) is the primary brand colour — dominant for Casino, Slots, Utility, Calendar, and general icon categories. Mid-range bright purple, not dark/deep.",
    category: "color",
    priority: 5,
  },
  {
    content:
      "CATEGORY-SPECIFIC COLOUR RULES: VIP = black + gold (#FFD700) only — gold glows on dark; Crypto = dark navy (#2B2D5A) coin + white + electric blue (#4A9EFF); MMA = crimson red (#DC143C) + white; Sports = object's natural vivid colours; Cash-drop = dark purple + neon green (#BDFE00); Chips = orange (#FF8C42) generic, purple for CB-branded.",
    category: "color",
    priority: 5,
  },
  {
    content:
      "ACCENT RESTRAINT — max 3-4 colours per icon (not counting gradient variations). One dominant, one accent, one highlight. Keep palette focused. No rainbow treatments.",
    category: "color",
    priority: 4,
  },
  {
    content:
      "NEON GREEN (#BDFE00) reserved for cash-drop and promotional icons only. Do NOT use on sports, casino, VIP, or crypto icons.",
    category: "color",
    priority: 3,
  },
  // ── Composition ─────────────────────────────────────────────────────────────
  {
    content:
      "ICON CENTERED with 15-20% breathing room on all sides — occupies ~65-75% of canvas. Never cropped, never touching edge.",
    category: "composition",
    priority: 5,
  },
  {
    content:
      "Icon must read clearly at 64×64 pixels — vivid colour and clear silhouette even at thumbnail size. Simplify if concept is unclear at small size.",
    category: "composition",
    priority: 5,
  },
  {
    content:
      "SLIGHT DYNAMIC ANGLE — subtle rotation or tilt (10-25 degrees) preferred over dead-flat front view. Adds energy and premium feel.",
    category: "composition",
    priority: 4,
  },
  // ── Brand Integration ────────────────────────────────────────────────────────
  {
    content:
      "CB BRANDMARK (||||) — only on CB-branded casino chips and crypto coins. White or light-coloured embossed mark on the object surface. Do NOT add to sports, utility, or general icons.",
    category: "style",
    priority: 3,
  },
  // ── Don'ts ──────────────────────────────────────────────────────────────────
  {
    content:
      "NO TEXT unless intrinsic to the object ('777' on slot reels, 'VIP' on VIP chip, currency symbol on coin). Text must be part of the object design, not a label added on top.",
    category: "dont",
    priority: 5,
  },
  {
    content:
      "AVOID photorealism, smooth gradient blending, volumetric CGI rendering, and soft airbrushed shading. This is a FLAT VECTOR TOON style — hard-edged shadow planes and highlights only, like a cartoon. Not a 3D render. Not a photo. Not a soft-lit illustration.",
    category: "dont",
    priority: 5,
  },
];
