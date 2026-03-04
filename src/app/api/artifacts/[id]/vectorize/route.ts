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

    if (!["final_png", "expanded_png", "nobg_png", "edited_png"].includes(artifact.kind)) {
      return NextResponse.json({ error: "Only PNG images can be vectorized" }, { status: 400 });
    }

    // Each source artifact gets its own vector — uniqueness is always per source artifact
    const existing = await prisma.artifact.findFirst({
      where: { variantId: artifact.variantId, kind: "vector_svg", sourceArtifactId: artifactId },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Vector version already exists", artifactId: existing.id, url: existing.url },
        { status: 409 },
      );
    }

    const imageBuffer = await loadArtifactBuffer(artifact.url);
    console.log("[Vectorize] Image loaded, size:", imageBuffer.length, "bytes. Calling Recraft API...");

    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "image.png");

    const recraftRes = await fetch("https://external.api.recraft.ai/v1/images/vectorize", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!recraftRes.ok) {
      const errBody = await recraftRes.text();
      console.error("[Vectorize] Recraft API error:", recraftRes.status, errBody);
      return NextResponse.json(
        { error: `Recraft API error: ${recraftRes.status}` },
        { status: 502 },
      );
    }

    const recraftData = await recraftRes.json();
    const svgUrl: string = recraftData?.image?.url;

    if (!svgUrl) {
      console.error("[Vectorize] No SVG URL in response:", recraftData);
      return NextResponse.json({ error: "No SVG URL returned by Recraft" }, { status: 502 });
    }

    const svgRes = await fetch(svgUrl);
    if (!svgRes.ok) {
      return NextResponse.json({ error: "Failed to download SVG from Recraft" }, { status: 502 });
    }
    const svgBuffer = Buffer.from(await svgRes.arrayBuffer());

    const storage = getStorageProvider();
    const jobId = artifact.variant.jobId;
    const variantLabel = artifact.variant.label;
    const suffix = `_${artifactId.slice(-8)}_vector`;
    const storagePath = `jobs/${jobId}/finals/${variantLabel}${suffix}.svg`;
    const url = await storage.upload(svgBuffer, storagePath, "image/svg+xml");

    const svgArtifact = await prisma.artifact.create({
      data: {
        variantId: artifact.variantId,
        channel: artifact.channel,
        kind: "vector_svg",
        url,
        width: artifact.width,
        height: artifact.height,
        mimeType: "image/svg+xml",
        sourceArtifactId: artifactId,
      },
    });

    return NextResponse.json({
      status: "done",
      artifactId: svgArtifact.id,
      url: svgArtifact.url,
    });
  } catch (error) {
    console.error("Failed to vectorize:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
