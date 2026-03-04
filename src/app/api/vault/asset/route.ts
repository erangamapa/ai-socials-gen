import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Serve vault asset files from assets/vault/ as images.
 *
 * Usage: /api/vault/asset?path=vault/illustrations/foo.png
 */
export async function GET(req: NextRequest) {
  const assetPath = req.nextUrl.searchParams.get("path");

  if (!assetPath) {
    return NextResponse.json({ error: "Missing path param" }, { status: 400 });
  }

  // Auto-ingested vault items store a full Blob URL — redirect the browser directly to it.
  // This is safe: these are always our own Vercel Blob public URLs.
  if (assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
    return NextResponse.redirect(assetPath, { status: 302 });
  }

  // Security: reject any path traversal attempts
  const normalised = path.normalize(assetPath).replace(/\\/g, "/");
  if (normalised.startsWith("..") || normalised.includes("/../")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Only allow serving files from assets/vault/ and assets/
  if (!normalised.startsWith("assets/") && !normalised.startsWith("vault/")) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const fullPath = path.resolve(process.cwd(), normalised);

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = MIME[ext] ?? "application/octet-stream";
  const buffer = fs.readFileSync(fullPath);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
    },
  });
}
