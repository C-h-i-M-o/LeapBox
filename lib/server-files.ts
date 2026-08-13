import { env } from "cloudflare:workers";

import { FileStore, type FileDatabase, type FileObjectStore } from "./file-store.ts";
import { UploadStore, type MultipartObjectStore } from "./upload-store.ts";

type RuntimeBindings = {
  DB?: D1Database;
  FILES?: R2Bucket;
};

export function getFileServices(): { store: FileStore; uploads: UploadStore } {
  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB || !bindings.FILES) {
    throw new Error("Sites 持久化存储暂不可用");
  }
  const database = bindings.DB as unknown as FileDatabase;
  const objects = bindings.FILES as unknown as FileObjectStore & MultipartObjectStore;
  return {
    store: new FileStore(database, objects),
    uploads: new UploadStore(database, objects),
  };
}

export function getFileStore(): FileStore {
  return getFileServices().store;
}
