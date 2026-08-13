import { env } from "cloudflare:workers";

import { FileStore, type FileDatabase, type FileObjectStore } from "./file-store.ts";

type RuntimeBindings = {
  DB?: D1Database;
  FILES?: R2Bucket;
};

export function getFileStore(): FileStore {
  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB || !bindings.FILES) {
    throw new Error("Sites 持久化存储暂不可用");
  }
  return new FileStore(
    bindings.DB as unknown as FileDatabase,
    bindings.FILES as unknown as FileObjectStore,
  );
}
