import { StorageProvider } from "./types";
import { LocalFsStorage } from "./localFs";
import { VercelBlobStorage } from "./vercelBlob";

let instance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (instance) return instance;

  const provider = (process.env.BLOB_STORAGE_PROVIDER || "local").trim().replace(/\\n$/, "");

  if (provider === "vercel-blob") {
    instance = new VercelBlobStorage();
  } else {
    if (process.env.VERCEL) {
      throw new Error(
        "BLOB_STORAGE_PROVIDER must be 'vercel-blob' on Vercel (filesystem is read-only). Set BLOB_STORAGE_PROVIDER=vercel-blob and BLOB_READ_WRITE_TOKEN."
      );
    }
    instance = new LocalFsStorage(process.env.LOCAL_BLOB_DIR);
  }

  return instance;
}

export type { StorageProvider };
