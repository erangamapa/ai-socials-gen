import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@/lib/db";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const ANALYSIS_PROMPT = `Analyze this design asset for a crypto sportsbook/casino brand (CB). Return a JSON object with exactly these fields:

{
  "description": "2-3 sentence description of what the image contains and its visual style",
  "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "mood": "comma-separated mood descriptors, e.g. dark, energetic, premium",
  "composition": "describe layout and spatial arrangement, e.g. centered subject, gradient background",
  "styleNotes": "specific style observations: lighting, effects, textures, brand elements",
  "subjects": ["subject1", "subject2"]
}

Return ONLY the JSON object. No markdown, no explanation.`;

async function analyzeOne(anthropic: Anthropic, filePath: string) {
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  if (filePath.endsWith(".svg")) {
    const name = path.basename(filePath, ".svg");
    return {
      description: `SVG vector asset: ${name}. Scalable vector graphic used as a brand element.`,
      colorPalette: [] as string[],
      mood: "clean, scalable, brand",
      composition: "vector graphic",
      styleNotes: "SVG format, resolution-independent",
      subjects: [name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()],
    };
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    return {
      description: `Non-image asset: ${path.basename(filePath)}`,
      colorPalette: [] as string[],
      mood: "utility",
      composition: "N/A",
      styleNotes: `File type: ${ext}`,
      subjects: [] as string[],
    };
  }

  const imageData = fs.readFileSync(absolutePath);
  const base64 = imageData.toString("base64");
  const mediaType = (ext === ".jpg" ? "image/jpeg" : `image/${ext.slice(1)}`) as
    | "image/png"
    | "image/jpeg"
    | "image/gif"
    | "image/webp";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: ANALYSIS_PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min((body.batchSize as number) || 10, 25);

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const pending = await prisma.assetVaultItem.findMany({
      where: { analysisStatus: { not: "done" } },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (pending.length === 0) {
      return NextResponse.json({ message: "All assets already analyzed", processed: 0 });
    }

    const results: { id: string; status: string; error?: string }[] = [];

    for (const item of pending) {
      try {
        await prisma.assetVaultItem.update({
          where: { id: item.id },
          data: { analysisStatus: "analyzing" },
        });

        const analysis = await analyzeOne(anthropic, item.pathOrUrl);

        await prisma.assetVaultItem.update({
          where: { id: item.id },
          data: {
            analysis: JSON.parse(JSON.stringify(analysis)),
            analysisStatus: "done",
            analyzedAt: new Date(),
          },
        });

        results.push({ id: item.id, status: "done" });

        if (IMAGE_EXTENSIONS.has(path.extname(item.pathOrUrl).toLowerCase()) && !item.pathOrUrl.endsWith(".svg")) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.assetVaultItem.update({
          where: { id: item.id },
          data: { analysisStatus: "failed" },
        });
        results.push({ id: item.id, status: "failed", error: msg });
      }
    }

    const total = await prisma.assetVaultItem.count();
    const done = await prisma.assetVaultItem.count({ where: { analysisStatus: "done" } });

    return NextResponse.json({
      processed: results.length,
      succeeded: results.filter((r) => r.status === "done").length,
      failed: results.filter((r) => r.status === "failed").length,
      progress: { done, total, percent: Math.round((done / total) * 100) },
      results,
    });
  } catch (error) {
    console.error("Analysis endpoint error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
