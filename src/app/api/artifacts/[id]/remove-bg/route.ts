import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import * as fs from "fs";
import * as path from "path";

async function loadArtifactBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("/uploads/")) {
    const localPath = path.join(process.cwd(), "public", url);
    if (!fs.existsSync(localPath)) {
      throw new Error("Source image file not found on disk");
    }
    return fs.readFileSync(localPath);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch source image");
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artifactId } = await params;
    const apiKey = process.env.RECRAFT_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "RECRAFT_API_KEY not configured" }, { status: 500 });
    }

    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { variant: { include: { job: true } } },
    });

    if (!artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    if (!["final_png", "expanded_png"].includes(artifact.kind)) {
      return NextResponse.json({ error: "Only final images can have background removed" }, { status: 400 });
    }

    const existing = await prisma.artifact.findFirst({
      where: { variantId: artifact.variantId, kind: "nobg_png" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Background-removed version already exists", artifactId: existing.id, url: existing.url },
        { status: 409 },
      );
    }

    const imageBuffer = await loadArtifactBuffer(artifact.url);
    console.log("[RemoveBG] Image loaded, size:", imageBuffer.length, "bytes. Calling Recraft removeBackground...");

    const formData = new FormData();
    formData.append("file", new Blob([imageBuffer], { type: "image/png" }), "image.png");
    formData.append("response_format", "url");

    const recraftRes = await fetch("https://external.api.recraft.ai/v1/images/removeBackground", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!recraftRes.ok) {
      const errBody = await recraftRes.text();
      console.error("[RemoveBG] Recraft API error:", recraftRes.status, errBody);
      return NextResponse.json(
        { error: `Recraft API error: ${recraftRes.status}` },
        { status: 502 },
      );
    }

    const recraftData = await recraftRes.json();
    const resultUrl: string = recraftData?.image?.url;

    if (!resultUrl) {
      console.error("[RemoveBG] No URL in response:", recraftData);
      return NextResponse.json({ error: "No result URL returned by Recraft" }, { status: 502 });
    }

    const resultRes = await fetch(resultUrl);
    if (!resultRes.ok) {
      return NextResponse.json({ error: "Failed to download result from Recraft" }, { status: 502 });
    }
    const resultBuffer = Buffer.from(await resultRes.arrayBuffer());

    const storage = getStorageProvider();
    const jobId = artifact.variant.jobId;
    const variantLabel = artifact.variant.label;
    const storagePath = `jobs/${jobId}/finals/${variantLabel}_nobg.png`;
    const url = await storage.upload(resultBuffer, storagePath, "image/png");

    const nobgArtifact = await prisma.artifact.create({
      data: {
        variantId: artifact.variantId,
        channel: artifact.channel,
        kind: "nobg_png",
        url,
        width: artifact.width,
        height: artifact.height,
        mimeType: "image/png",
      },
    });

    return NextResponse.json({
      status: "done",
      artifactId: nobgArtifact.id,
      url: nobgArtifact.url,
    });
  } catch (error) {
    console.error("Failed to remove background:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
