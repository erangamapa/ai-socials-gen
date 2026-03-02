export interface StorageProvider {
  upload(buffer: Buffer, filePath: string, mimeType?: string): Promise<string>;
  getUrl(filePath: string): string;
}
