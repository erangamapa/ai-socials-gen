import { StorageProvider } from "./types";
import { LocalFsStorage } from "./localFs";
import { VercelBlobStorage } from "./vercelBlob";

let instance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (instance) return instance;

  const provider = process.env.BLOB_STORAGE_PROVIDER || "local";

  if (provider === "vercel-blob") {
    instance = new VercelBlobStorage();
  } else {
    instance = new LocalFsStorage(process.env.LOCAL_BLOB_DIR);
  }

  return instance;
}

export type { StorageProvider };
