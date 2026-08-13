export const MAX_ACTIVE_PARTS = 3;
export const MAX_ACTIVE_FILES = 2;
const MAX_PART_ATTEMPTS = 3;
const UPLOAD_DB_NAME = "leapbox-uploads";
const UPLOAD_STORE_NAME = "sessions";

export type ClientUploadPart = {
  partNumber: number;
  etag: string;
  sizeBytes?: number;
};

export type ClientUploadSession = {
  id: string;
  parentId: string | null;
  name: string;
  relativePath: string | null;
  mimeType: string;
  sizeBytes: number;
  partSizeBytes: number;
  status: "active" | "completing" | "completed" | "aborted";
  parts: ClientUploadPart[];
};

export type UploadProgress = {
  progress: number;
  uploadedBytes: number;
  speedBytesPerSecond: number;
  remainingSeconds: number | null;
};

export type UploadFileInput = {
  file: File;
  parentId: string | null;
  relativePath: string | null;
  signal: AbortSignal;
  onProgress(progress: UploadProgress): void;
  onSession(sessionId: string): void;
};

type ResumeRecord = {
  fingerprint: string;
  sessionId: string;
};

type SessionResponse = { session: ClientUploadSession };
type PartResponse = { part: ClientUploadPart };

class UploadHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadHttpError";
    this.status = status;
  }
}

export async function uploadFileInParts(input: UploadFileInput): Promise<void> {
  const fingerprint = fileFingerprint(input.file, input.parentId, input.relativePath);
  let session = await resumeSession(fingerprint, input.signal);
  if (
    !session ||
    session.status !== "active" ||
    session.name !== input.file.name ||
    session.sizeBytes !== input.file.size ||
    session.parentId !== input.parentId
  ) {
    session = await createSession(input, fingerprint);
  }
  input.onSession(session.id);

  const completed = new Map(session.parts.map((part) => [part.partNumber, part]));
  const totalParts = Math.ceil(input.file.size / session.partSizeBytes);
  const pending = Array.from({ length: totalParts }, (_, index) => index + 1)
    .filter((partNumber) => !completed.has(partNumber));
  let uploadedBytes = session.parts.reduce((total, part) => total + (part.sizeBytes ?? 0), 0);
  const startedAt = performance.now();
  let cursor = 0;

  const uploadNext = async (): Promise<void> => {
    while (cursor < pending.length) {
      input.signal.throwIfAborted();
      const partNumber = pending[cursor];
      cursor += 1;
      const start = (partNumber - 1) * session.partSizeBytes;
      const end = Math.min(start + session.partSizeBytes, input.file.size);
      const body = input.file.slice(start, end);
      const part = await uploadPartWithRetry(session.id, partNumber, body, input.signal);
      completed.set(part.partNumber, { ...part, sizeBytes: body.size });
      uploadedBytes += body.size;
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.1);
      const speedBytesPerSecond = Math.max(0, uploadedBytes / elapsedSeconds);
      const remainingBytes = Math.max(0, input.file.size - uploadedBytes);
      input.onProgress({
        progress: Math.min(99, Math.round((uploadedBytes / input.file.size) * 100)),
        uploadedBytes,
        speedBytesPerSecond,
        remainingSeconds: speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond : null,
      });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_ACTIVE_PARTS, pending.length) }, () => uploadNext()),
  );
  input.signal.throwIfAborted();
  const parts = [...completed.values()]
    .sort((left, right) => left.partNumber - right.partNumber)
    .map(({ partNumber, etag }) => ({ partNumber, etag }));
  await requestJson(`/api/uploads/${encodeURIComponent(session.id)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts }),
    signal: input.signal,
  });
  await deleteResumeRecord(fingerprint);
  input.onProgress({
    progress: 100,
    uploadedBytes: input.file.size,
    speedBytesPerSecond: 0,
    remainingSeconds: 0,
  });
}

export async function abortUploadSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/uploads/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) await readJson(response);
}

export async function runWithConcurrency<T>(
  values: T[],
  limit: number,
  work: (value: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const next = async (): Promise<void> => {
    while (index < values.length) {
      const value = values[index];
      index += 1;
      await work(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => next()));
}

async function createSession(
  input: UploadFileInput,
  fingerprint: string,
): Promise<ClientUploadSession> {
  const data = await requestJson<SessionResponse>("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parentId: input.parentId,
      name: input.file.name,
      relativePath: input.relativePath,
      mimeType: input.file.type || "application/octet-stream",
      sizeBytes: input.file.size,
    }),
    signal: input.signal,
  });
  await putResumeRecord({ fingerprint, sessionId: data.session.id });
  return data.session;
}

async function resumeSession(
  fingerprint: string,
  signal: AbortSignal,
): Promise<ClientUploadSession | null> {
  const saved = await getResumeRecord(fingerprint);
  if (!saved) return null;
  try {
    const data = await requestJson<SessionResponse>(
      `/api/uploads/${encodeURIComponent(saved.sessionId)}`,
      { signal },
    );
    return data.session;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof UploadHttpError && [404, 409, 410].includes(error.status)) {
      await deleteResumeRecord(fingerprint);
      return null;
    }
    throw error;
  }
}

async function uploadPartWithRetry(
  sessionId: string,
  partNumber: number,
  body: Blob,
  signal: AbortSignal,
): Promise<ClientUploadPart> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_PART_ATTEMPTS; attempt += 1) {
    signal.throwIfAborted();
    try {
      const data = await requestJson<PartResponse>(
        `/api/uploads/${encodeURIComponent(sessionId)}/parts/${partNumber}`,
        {
          method: "PUT",
          headers: { "X-Upload-Part-Size": String(body.size) },
          body,
          signal,
        },
      );
      return data.part;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_PART_ATTEMPTS) await delay(400 * 2 ** (attempt - 1), signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("分片上传失败，请重试");
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  return readJson<T>(response);
}

async function readJson<T = unknown>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isRecord(data) && isRecord(data.error) && typeof data.error.message === "string") {
      throw new UploadHttpError(data.error.message, response.status);
    }
    throw new UploadHttpError("上传失败，请稍后重试", response.status);
  }
  return data as T;
}

function fileFingerprint(file: File, parentId: string | null, relativePath: string | null): string {
  return [file.name, file.size, file.lastModified, parentId ?? "root", relativePath ?? ""].join("::");
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    const abort = () => {
      window.clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new DOMException("已暂停", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function openUploadDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(UPLOAD_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(UPLOAD_STORE_NAME)) {
        request.result.createObjectStore(UPLOAD_STORE_NAME, { keyPath: "fingerprint" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地续传记录"));
  });
}

async function getResumeRecord(fingerprint: string): Promise<ResumeRecord | null> {
  return withStore<ResumeRecord | null>("readonly", (store, resolve, reject) => {
    const request = store.get(fingerprint);
    request.onsuccess = () => resolve((request.result as ResumeRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地续传记录"));
  });
}

async function putResumeRecord(record: ResumeRecord): Promise<void> {
  return withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("无法保存本地续传记录"));
  });
}

async function deleteResumeRecord(fingerprint: string): Promise<void> {
  return withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(fingerprint);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("无法清理本地续传记录"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: unknown) => void,
  ) => void,
): Promise<T> {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器不支持断点续传");
  }
  const database = await openUploadDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      operation(database.transaction(UPLOAD_STORE_NAME, mode).objectStore(UPLOAD_STORE_NAME), resolve, reject);
    });
  } finally {
    database.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
