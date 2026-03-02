import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getStorageProvider } from "@/lib/storage";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_DIMENSION = 1500; // px on longest edge

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.startsWith("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file field" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    if (rawBuffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 4 MB." },
        { status: 400 }
      );
    }

    // Resize to max dimension, keep aspect ratio, convert to JPEG for consistency
    const resized = await sharp(rawBuffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    const ext = "jpg";
    const filename = `${randomUUID()}.${ext}`;
    const storagePath = `refs/${filename}`;

    const storage = getStorageProvider();
    const url = await storage.upload(resized, storagePath, "image/jpeg");

    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("[UploadReference] Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
