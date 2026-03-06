import { StorageProvider } from "./types";

export class VercelBlobStorage implements StorageProvider {
  async upload(buffer: Buffer, filePath: string, mimeType?: string): Promise<string> {
    const token = (process.env.BLOB_READ_WRITE_TOKEN || "").trim().replace(/\\n$/, "");
    if (!token) {
      throw new Error("BLOB_READ_WRITE_TOKEN is required when using vercel-blob storage");
    }
    const { put } = await import("@vercel/blob");
    const blob = await put(filePath, buffer, {
      access: "public",
      contentType: mimeType || "image/png",
      token,
    });
    return blob.url;
  }

  getUrl(filePath: string): string {
    return filePath;
  }
}
