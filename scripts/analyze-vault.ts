import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import pg from "pg";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

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

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

interface AnalysisResult {
  description: string;
  colorPalette: string[];
  mood: string;
  composition: string;
  styleNotes: string;
  subjects: string[];
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function getSvgAnalysis(filePath: string): AnalysisResult {
  const name = path.basename(filePath, path.extname(filePath));
  return {
    description: `SVG vector asset: ${name}. Scalable vector graphic used as a brand element.`,
    colorPalette: [],
    mood: "clean, scalable, brand",
    composition: "vector graphic",
    styleNotes: "SVG format, resolution-independent",
    subjects: [name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()],
  };
}

async function analyzeImage(filePath: string): Promise<AnalysisResult> {
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  if (filePath.endsWith(".svg")) {
    return getSvgAnalysis(filePath);
  }

  if (!isImageFile(filePath)) {
    return {
      description: `Non-image asset: ${path.basename(filePath)}`,
      colorPalette: [],
      mood: "utility",
      composition: "N/A",
      styleNotes: `File type: ${path.extname(filePath)}`,
      subjects: [],
    };
  }

  let imageData = fs.readFileSync(absolutePath);
  // Resize if over 4MB to stay within Claude's 5MB limit
  const MAX_BYTES = 4 * 1024 * 1024;
  if (imageData.length > MAX_BYTES) {
    imageData = await sharp(imageData)
      .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }
  const base64 = imageData.toString("base64");
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mediaType = (imageData.length > MAX_BYTES || ext === "jpg") ? "image/jpeg" : `image/${ext}` as "image/png" | "image/jpeg" | "image/gif" | "image/webp";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: ANALYSIS_PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as AnalysisResult;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const batchSize = parseInt(process.argv[2] || "0") || 999;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required. Set it in .env");
    process.exit(1);
  }

  const pending = await prisma.assetVaultItem.findMany({
    where: { analysisStatus: { not: "done" } },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  const total = await prisma.assetVaultItem.count();
  const doneCount = await prisma.assetVaultItem.count({ where: { analysisStatus: "done" } });

  console.log(`\nVault Analysis: ${doneCount}/${total} already done, ${pending.length} to analyze\n`);

  if (pending.length === 0) {
    console.log("All assets already analyzed!");
    return;
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    processed++;
    const label = path.basename(item.pathOrUrl);
    process.stdout.write(`[${doneCount + processed}/${total}] ${label}... `);

    try {
      await prisma.assetVaultItem.update({
        where: { id: item.id },
        data: { analysisStatus: "analyzing" },
      });

      const analysis = await analyzeImage(item.pathOrUrl);

      await prisma.assetVaultItem.update({
        where: { id: item.id },
        data: {
          analysis: JSON.parse(JSON.stringify(analysis)),
          analysisStatus: "done",
          analyzedAt: new Date(),
        },
      });

      console.log("done");
      succeeded++;

      if (isImageFile(item.pathOrUrl) && !item.pathOrUrl.endsWith(".svg")) {
        await sleep(1200);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);

      await prisma.assetVaultItem.update({
        where: { id: item.id },
        data: { analysisStatus: "failed" },
      });
      failed++;
    }
  }

  console.log(`\nComplete: ${succeeded} succeeded, ${failed} failed, ${doneCount + succeeded}/${total} total done`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
