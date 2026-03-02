import { StorageProvider } from "./types";

export class VercelBlobStorage implements StorageProvider {
  async upload(buffer: Buffer, filePath: string, mimeType?: string): Promise<string> {
    const { put } = await import("@vercel/blob");
    const blob = await put(filePath, buffer, {
      access: "public",
      contentType: mimeType || "image/png",
    });
    return blob.url;
  }

  getUrl(filePath: string): string {
    return filePath;
  }
}
