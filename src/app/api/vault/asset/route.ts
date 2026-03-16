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

const ALLOWED_REDIRECT_HOSTS = [
  ".public.blob.vercel-storage.com",
];

function isAllowedRedirectUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_REDIRECT_HOSTS.some((h) => parsed.hostname.endsWith(h));
  } catch {
    return false;
  }
}

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

  if (assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
    if (!isAllowedRedirectUrl(assetPath)) {
      return NextResponse.json({ error: "Redirect target not allowed" }, { status: 403 });
    }
    return NextResponse.redirect(assetPath, { status: 302 });
  }

  const normalised = path.normalize(assetPath).replace(/\\/g, "/");

  if (!normalised.startsWith("assets/") && !normalised.startsWith("vault/")) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const fullPath = path.resolve(process.cwd(), normalised);
  const assetsRoot = path.resolve(process.cwd(), "assets");
  const vaultRoot = path.resolve(process.cwd(), "vault");

  if (!fullPath.startsWith(assetsRoot + path.sep) && !fullPath.startsWith(vaultRoot + path.sep)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

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
