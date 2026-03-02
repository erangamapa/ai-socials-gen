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

const GEMINI_MODEL = "gemini-3-pro-image-preview";

export class GeminiImageProvider implements ImageProvider {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.NANO_BANANA_API_KEY! });
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const { width, height, prompt, referenceImages, mode } = request;
    const aspectLabel = width > height ? "landscape" : height > width ? "portrait" : "square";
    const isIllustration = mode === "illustration";

    const contentParts: { inlineData?: { mimeType: string; data: string }; text?: string }[] = [];

    if (isIllustration) {
      // ── ILLUSTRATION MODE ──────────────────────────────────────────────────
      // No template canvas. We want a standalone flat-vector illustration on a
      // solid background, ready for cutout. Subject reference (if any) comes
      // first; then style references; then the generation prompt.

      const subjectRef = referenceImages?.find((r) => r.description.startsWith("SUBJECT REFERENCE"));
      const styleRefs = referenceImages?.filter((r) => !r.description.startsWith("SUBJECT REFERENCE")) ?? [];

      console.log(
        `[NanoBanana] ILLUSTRATION mode — subject=${!!subjectRef}, styleRefs=${styleRefs.length}, ${width}x${height}`
      );

      if (subjectRef) {
        const resized = await sharp(subjectRef.buffer)
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        contentParts.push({ text: `SUBJECT REFERENCE (HIGHEST PRIORITY): ${subjectRef.description}` });
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

      const illustrationSystemNote = subjectRef
        ? "The subject reference above defines WHAT you draw. Style references define HOW it is rendered."
        : "Style references above define the visual language to use.";

      contentParts.push({
        text: `${illustrationSystemNote}

ILLUSTRATION BRIEF:
${prompt}

OUTPUT REQUIREMENTS — ABSOLUTE:
- ${aspectLabel.toUpperCase()} format, exactly ${width}×${height} pixels, single flattened RGB image.
- FLAT VECTOR illustration style — no 3D rendering, no volumetric shading, no photorealism.
- ENTIRE subject must be FULLY CONTAINED within the frame — no cropping of limbs, head, or body.
- BACKGROUND is a single solid flat colour only — no drop shadows, no glows, no halos, no backdrop effects.
- ALL shading is internal to the character only — no shadows projected onto the background.
- ZERO text, logos, watermarks, or typography anywhere in the image.`,
      });
    } else {
      // ── SOCIALS / TEMPLATE MODE ────────────────────────────────────────────
      // A brand template is the first image. We composite an illustration on top.

      const templateRef = referenceImages?.find((r) => r.description.includes("BASE TEMPLATE"));
      const styleRefs = referenceImages?.filter((r) => !r.description.includes("BASE TEMPLATE")) ?? [];

      console.log(
        `[NanoBanana] SOCIALS mode — template=${!!templateRef}, styleRefs=${styleRefs.length}, ${width}x${height}`
      );

      const mainPrompt = `You are editing a finished brand TEMPLATE image. The FIRST image you see is the exact background with logo, notch and layout already in place.

Your job: generate a NEW illustration element ON TOP of that existing template without changing the background, logo, or layout. Preserve the template exactly and just add the character/object in our house illustration style. Output a single, flattened RGB image (no transparency). ${aspectLabel} format (${width}x${height}).

${prompt}

FINAL INSTRUCTION — ABSOLUTE PRIORITY: Do NOT render ANY text, words, letters, numbers, headlines, logos, or watermarks anywhere in the image. The output must be a PURE ILLUSTRATION — zero typography.`;

      if (templateRef) {
        const resized = await sharp(templateRef.buffer)
          .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        contentParts.push({
          text: "IMAGE 1 — BRAND TEMPLATE CANVAS: This is the background template with logo already placed. Generate the illustration element ON TOP of this layout. Do NOT modify the background, logo, or notch.",
        });
      }

      for (let i = 0; i < styleRefs.length; i++) {
        const ref = styleRefs[i];
        const resized = await sharp(ref.buffer)
          .resize(768, 768, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentParts.push({ inlineData: { mimeType: "image/png", data: resized.toString("base64") } });
        contentParts.push({
          text: `STYLE REFERENCE ${i + 1}: ${ref.description}. Match this illustration's art style, color treatment, line work, and shading technique in the new image.`,
        });
      }

      contentParts.push({
        text: templateRef
          ? `Using the template canvas and style references above, generate a NEW illustration element. ${mainPrompt}`
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
