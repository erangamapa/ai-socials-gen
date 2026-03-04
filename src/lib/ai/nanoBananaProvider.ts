import sharp from "sharp";
import { GoogleGenAI, Type as GeminiPartType } from "@google/genai";
import { ImageProvider, ImageGenRequest, ImageGenResult } from "./types";

export class MockNanaBananaProvider implements ImageProvider {
  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    await new Promise((r) => setTimeout(r, 300));
    const { width, height, prompt } = request;
    const hue = this.hashToHue(prompt);
    const bg = this.hslToHex(hue, 60, 20);
    const accent = this.hslToHex((hue + 40) % 360, 70, 50);
    const label = (prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const refs = request.referenceImages?.length || 0;

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${bg};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${accent};stop-opacity:0.3" />
      </linearGradient></defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <text x="${width / 2}" y="${height / 2 - 20}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="white" opacity="0.7">MOCK: ${width}x${height}</text>
      <text x="${width / 2}" y="${height / 2 + 15}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="${accent}" opacity="0.8">${label}</text>
      <text x="${width / 2}" y="${height - 20}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="white" opacity="0.3">Mock (${refs} refs) — Gemini unavailable</text>
    </svg>`;

    return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), mimeType: "image/png" };
  }

  private hashToHue(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return Math.abs(h);
  }
  private hslToHex(h: number, s: number, l: number): string {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))).toString(16).padStart(2, "0"); };
    return `#${f(0)}${f(8)}${f(4)}`;
  }
}

const GEMINI_MODEL = "gemini-3.1-flash-image-preview";

export class GeminiImageProvider implements ImageProvider {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.NANO_BANANA_API_KEY! });
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const { width, height, prompt, referenceImages, mode } = request;
    const aspectLabel = width > height ? "landscape" : height > width ? "portrait" : "square";
    const isIllustration = mode === "illustration";
    const isPictogram = mode === "pictogram";
    const isStandalone = isIllustration || isPictogram;

    const contentParts: { inlineData?: { mimeType: string; data: string }; text?: string }[] = [];

    if (isStandalone) {
      // ── ILLUSTRATION / PICTOGRAM MODE ─────────────────────────────────────
      // No template canvas. Standalone image on solid background, ready for
      // cutout. Subject reference (if any) comes first; style refs follow.

      // Collect ALL subject references (may be 0, 1, or many)
      const subjectRefs = referenceImages?.filter((r) => r.description.startsWith("SUBJECT REFERENCE")) ?? [];
      const styleRefs = referenceImages?.filter((r) => !r.description.startsWith("SUBJECT REFERENCE")) ?? [];
      const hasMultiSubject = subjectRefs.length > 1;

      console.log(
        `[NanoBanana] ${(mode ?? "standalone").toUpperCase()} mode — subjectRefs=${subjectRefs.length}, styleRefs=${styleRefs.length}, ${width}x${height}`
      );

      // Pack ALL subject references first — in order, with numbered labels
      for (let i = 0; i < subjectRefs.length; i++) {
        const ref = subjectRefs[i];
        const resized = await sharp(ref.buffer)
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        const label = hasMultiSubject
          ? `SUBJECT REFERENCE ${i + 1} of ${subjectRefs.length} (HIGHEST PRIORITY)`
          : `SUBJECT REFERENCE (HIGHEST PRIORITY)`;
        contentParts.push({ text: `${label}: ${ref.description}` });
      }

      for (let i = 0; i < styleRefs.length; i++) {
        const ref = styleRefs[i];
        const resized = await sharp(ref.buffer)
          .resize(768, 768, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        contentParts.push({
          text: `STYLE REFERENCE ${i + 1}: ${ref.description}`,
        });
      }

      const multiSubjectNote = hasMultiSubject
        ? ` You have ${subjectRefs.length} subject references — compose ALL of them into a single cohesive scene. Each reference defines a separate character, element, or angle that must appear in the final output.`
        : "";

      const standaloneSystemNote = subjectRefs.length > 0
        ? isPictogram
          ? `The subject reference${hasMultiSubject ? "s" : ""} above define${hasMultiSubject ? "" : "s"} the CONCEPT(S) to iconify.${multiSubjectNote} Style references define the CB pictogram visual language: flat vector toon style, slight 3D perspective angle, hard-edged cel-shading. ALL icons are rendered on a SOLID DARK BACKGROUND (#0F0A1A) — no white, no transparency.`
          : `The subject reference${hasMultiSubject ? "s" : ""} above define${hasMultiSubject ? "" : "s"} WHAT you draw.${multiSubjectNote} Style references define HOW it is rendered.`
        : isPictogram
          ? "Style references above define the CB pictogram visual language: flat vector toon style with slight 3D perspective, hard-edged cel-shading (2-3 flat tones per surface, not smooth gradients). ALL icons rendered on SOLID DARK BACKGROUND (#0F0A1A) — no white, no transparency, no soft shadows."
          : "Style references above define the visual language to use.";

      const outputRequirements = isPictogram
        ? `OUTPUT REQUIREMENTS — ABSOLUTE:
- ${aspectLabel.toUpperCase()} format, exactly ${width}x${height} pixels, single flattened RGB image.
- SOLID DARK BACKGROUND (#0F0A1A or #120D20) fills the entire canvas — no white, no transparency, no light backgrounds, no vignettes. The dark background IS the design.
- NO DROP SHADOWS, NO SOFT HALOS, NO GLOW EFFECTS on or around the icon. Clean object on clean dark ground.
- FLAT VECTOR TOON STYLE — flat vector icon drawn from a slight 3D perspective angle with toon cel-shading. Use 2-3 hard-edged flat highlight/shadow planes per surface (cartoon/comic style). Clean geometric vector shapes, crisp edges. NOT smooth gradient blending, NOT volumetric CGI, NOT photorealism.
- VIVID SATURATED COLOURS — icon must pop against the dark background. No muted or pastel tones.
- COLOUR: Purple (#8B4CF7/#C47EFF) for Casino/Slots/Utility; black+gold for VIP; dark navy for Crypto; crimson red for MMA; object's natural vivid colours for Sports.
- ICON CENTERED with 15-20% breathing room — occupies ~70% of canvas. NEVER cropped or touching edge.
- SLIGHT 3D PERSPECTIVE ANGLE — isometric or 3/4 view gives depth; paired with flat toon cel-shading.
- CLEAN GEOMETRIC FORMS — vector-precise shapes, rounded corners where natural to the object.
- Icon must read clearly at thumbnail size (64 pixels).
- NO TEXT unless intrinsic to the object ('777' on slot reels, 'VIP' on VIP chip, currency symbol on coin).`
        : `OUTPUT REQUIREMENTS — ABSOLUTE:
- ${aspectLabel.toUpperCase()} format, exactly ${width}x${height} pixels, single flattened RGB image.
- FLAT VECTOR illustration style — no 3D rendering, no volumetric shading, no photorealism.
- ENTIRE subject must be FULLY CONTAINED within the frame — no cropping of limbs, head, or body.
- BACKGROUND is a single solid flat colour only — no drop shadows, no glows, no halos, no backdrop effects.
- ALL shading is internal to the character only — no shadows projected onto the background.
- ZERO text, logos, watermarks, or typography anywhere in the image.`;

      const briefLabel = isPictogram ? "PICTOGRAM BRIEF" : "ILLUSTRATION BRIEF";

      contentParts.push({
        text: `${standaloneSystemNote}\n\n${briefLabel}:\n${prompt}\n\n${outputRequirements}`,
      });
    } else {
      // ── SOCIALS / TEMPLATE MODE ────────────────────────────────────────────
      // A brand template is the first image. If a hero illustration is provided,
      // we composite it onto the template AS-IS. Otherwise we generate a new element.

      const templateRef = referenceImages?.find((r) => r.description.includes("BASE TEMPLATE"));
      const heroRef = referenceImages?.find((r) => r.description.includes("HERO ILLUSTRATION"));
      // In socials mode, subject references that are NOT hero illustrations are user-uploaded photos
      const socialsSubjectRefs = referenceImages?.filter(
        (r) => r.description.startsWith("SUBJECT REFERENCE") && !r.description.includes("HERO ILLUSTRATION")
      ) ?? [];
      const styleRefs = referenceImages?.filter(
        (r) => !r.description.includes("BASE TEMPLATE") && !r.description.includes("HERO ILLUSTRATION") && !r.description.startsWith("SUBJECT REFERENCE")
      ) ?? [];

      console.log(
        `[NanoBanana] SOCIALS mode — template=${!!templateRef}, hero=${!!heroRef}, subjectRefs=${socialsSubjectRefs.length}, styleRefs=${styleRefs.length}, ${width}x${height}`
      );

      // Build the main prompt: compositing mode when hero exists, generation mode otherwise
      const mainPrompt = heroRef
        ? `You are editing a finished brand TEMPLATE image. The FIRST image is the exact background template with logo, notch and layout already in place. The SECOND image is the HERO ILLUSTRATION — a finished, pre-styled character asset.

Your job: COMPOSITE the hero illustration onto the template. Place the character prominently on the template — it is the centrepiece. Do NOT redraw, re-stylize, re-interpret, or modify the hero illustration in any way. Preserve its exact art style, colours, line work, and proportions. Only generate supplementary background effects, atmospheric elements, or subtle design flourishes around the hero if the prompt calls for it. Output a single, flattened RGB image (no transparency). ${aspectLabel} format (${width}x${height}).

${prompt}

CRITICAL COMPOSITING RULES:
- The hero illustration is the FINISHED character — do NOT generate a new character.
- Preserve the hero illustration EXACTLY: same colours, line weight, proportions, pose.
- Preserve the template EXACTLY: same background, logo, notch, layout.
- Place the hero character prominently — it should dominate the composition.
- Do NOT render ANY text, words, letters, numbers, headlines, logos, or watermarks anywhere in the image. Zero typography.`
        : `You are editing a finished brand TEMPLATE image. The FIRST image you see is the exact background with logo, notch and layout already in place.

Your job: generate a NEW illustration element ON TOP of that existing template without changing the background, logo, or layout. Preserve the template exactly and just add the character/object in our house illustration style. Output a single, flattened RGB image (no transparency). ${aspectLabel} format (${width}x${height}).

${prompt}

FINAL INSTRUCTION — ABSOLUTE PRIORITY: Do NOT render ANY text, words, letters, numbers, headlines, logos, or watermarks anywhere in the image. The output must be a PURE ILLUSTRATION — zero typography.`;

      // IMAGE 1: Brand template canvas
      if (templateRef) {
        const resized = await sharp(templateRef.buffer)
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        contentParts.push({
          text: heroRef
            ? "IMAGE 1 — BRAND TEMPLATE CANVAS: This is the background template with logo already placed. The hero illustration will be composited ON TOP of this layout. Do NOT modify the background, logo, or notch."
            : "IMAGE 1 — BRAND TEMPLATE CANVAS: This is the background template with logo already placed. Generate the illustration element ON TOP of this layout. Do NOT modify the background, logo, or notch.",
        });
      }

      // IMAGE 2: Hero illustration (pre-styled, highest priority — composite AS-IS)
      if (heroRef) {
        const resized = await sharp(heroRef.buffer)
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        contentParts.push({
          text: `IMAGE 2 — HERO ILLUSTRATION (HIGHEST PRIORITY): ${heroRef.description}. This is the finished character asset. Composite it onto the template AS-IS — do not redraw, re-stylize, or reinterpret it.`,
        });
      }

      // User-uploaded subject references (multi-person scenes in socials mode)
      for (let i = 0; i < socialsSubjectRefs.length; i++) {
        const ref = socialsSubjectRefs[i];
        const resized = await sharp(ref.buffer)
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        const label = socialsSubjectRefs.length > 1
          ? `SUBJECT REFERENCE ${i + 1} of ${socialsSubjectRefs.length}`
          : `SUBJECT REFERENCE`;
        contentParts.push({ text: `${label}: ${ref.description}. Use to capture likeness, pose, and energy.` });
      }

      // Vault style references (supplementary only when hero exists)
      for (let i = 0; i < styleRefs.length; i++) {
        const ref = styleRefs[i];
        const resized = await sharp(ref.buffer)
          .resize(768, 768, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        contentParts.push({
          text: heroRef
            ? `STYLE REFERENCE ${i + 1}: ${ref.description}. Use for supplementary style guidance only — the hero illustration takes priority.`
            : `STYLE REFERENCE ${i + 1}: ${ref.description}. Match this illustration's art style, color treatment, line work, and shading technique in the new image.`,
        });
      }

      contentParts.push({
        text: templateRef
          ? (heroRef
              ? `Using the template canvas and the hero illustration above, composite the hero onto the template. ${mainPrompt}`
              : `Using the template canvas and style references above, generate a NEW illustration element. ${mainPrompt}`)
          : mainPrompt,
      });
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[NanoBanana] Attempt ${attempt}: ${width}x${height}, ${referenceImages?.length || 0} refs, model=${GEMINI_MODEL}`);
        const start = Date.now();

        const response = await this.client.models.generateContent({
          model: GEMINI_MODEL,
          contents: contentParts as unknown as string,
          config: {
            responseModalities: ["IMAGE", "TEXT"],
          },
        });

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.mimeType?.startsWith("image/")) {
              const imageBuffer = Buffer.from(part.inlineData.data!, "base64");
              console.log(`[NanoBanana] Got ${imageBuffer.length} bytes in ${elapsed}s`);
              const resized = await sharp(imageBuffer)
                .resize(width, height, { fit: "cover" })
                .png()
                .toBuffer();
              return { buffer: resized, mimeType: "image/png" };
            }
            if (part.text) {
              console.log(`[NanoBanana] Text: ${part.text.slice(0, 100)}`);
            }
          }
        }

        console.warn(`[NanoBanana] No image in response after ${elapsed}s`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[NanoBanana] Attempt ${attempt} failed: ${msg}`);
        if (attempt < 2) {
          console.log("[NanoBanana] Retrying in 2s...");
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    console.warn("[NanoBanana] All attempts failed, using mock");
    return new MockNanaBananaProvider().generateImage(request);
  }
}

export function getImageProvider(): ImageProvider {
  if (process.env.USE_MOCK_PROVIDERS === "true") {
    return new MockNanaBananaProvider();
  }
  if (process.env.NANO_BANANA_API_KEY) {
    return new GeminiImageProvider();
  }
  console.warn("No NANO_BANANA_API_KEY, using mock");
  return new MockNanaBananaProvider();
}
