import * as fs from "fs";
import * as path from "path";
import { StorageProvider } from "./types";

export class LocalFsStorage implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), "public/uploads");
  }

  async upload(buffer: Buffer, filePath: string): Promise<string> {
    const fullPath = path.join(this.baseDir, filePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    return `/uploads/${filePath}`;
  }

  getUrl(filePath: string): string {
    return `/uploads/${filePath}`;
  }
}
