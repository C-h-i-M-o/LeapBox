import {
  AdaptiveUploadScheduler,
  createUploadProgressTracker,
  type UploadProgressSnapshot,
} from "./upload-scheduler.ts";

export { AdaptiveUploadScheduler, createUploadProgressTracker };

export const MAX_ACTIVE_PARTS = 3;
export const MAX_ACTIVE_FILES = 3;
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

export type UploadProgress = UploadProgressSnapshot;

export type UploadFileInput = {
  file: File;
  parentId: string | null;
  relativePath: string | null;
  signal: AbortSignal;
  scheduler: AdaptiveUploadScheduler;
  performanceId?: string;
  onProgress(progress: UploadProgress): void;
  onSession(sessionId: string): void;
  onSaving(): void;
};

export type ResumeRecord = {
  fingerprint: string;
  sessionId: string;
};

export type UploadResumeAction = "create" | "upload" | "complete" | "done";

export type UploadResumeStore = {
  get(fingerprint: string): Promise<ResumeRecord | null>;
  put(record: ResumeRecord): Promise<void>;
  delete(fingerprint: string): Promise<void>;
};

type SessionResponse = { session: ClientUploadSession };
type PartResponse = { part: ClientUploadPart };
export type UploadRequest = <T = unknown>(url: string, init?: RequestInit) => Promise<T>;

export type PreparedUploadInput = {
  file: Blob;
  session: ClientUploadSession;
  signal: AbortSignal;
  scheduler: AdaptiveUploadScheduler;
  performanceId?: string;
  uploadPart(
    sessionId: string,
    partNumber: number,
    body: Blob,
    signal: AbortSignal,
  ): Promise<ClientUploadPart>;
  complete(): Promise<void>;
  onProgress(progress: UploadProgress): void;
  onSaving(): void;
};

class UploadHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadHttpError";
    this.status = status;
  }
}

export async function uploadPreparedSession(input: PreparedUploadInput): Promise<void> {
  const completed = new Map(
    input.session.parts.map((part) => [part.partNumber, part]),
  );
  const totalParts = Math.ceil(input.file.size / input.session.partSizeBytes);
  const initialUploadedBytes = input.session.parts.reduce(
    (total, part) => total + (part.sizeBytes ?? 0),
    0,
  );
  const tracker = createUploadProgressTracker(input.file.size, initialUploadedBytes);
  const pending = Array.from({ length: totalParts }, (_, index) => index + 1)
    .filter((partNumber) => !completed.has(partNumber));
  let firstPartDispatched = false;

  await Promise.all(pending.map((partNumber) =>
    input.scheduler.schedule(input.session.id, async () => {
      input.signal.throwIfAborted();
      if (!firstPartDispatched) {
        firstPartDispatched = true;
        markUploadPhase(input.performanceId, "first_part_dispatched");
        measureUploadPhase(
          input.performanceId,
          "session_ready_to_first_part",
          "session_ready",
          "first_part_dispatched",
        );
      }
      const start = (partNumber - 1) * input.session.partSizeBytes;
      const end = Math.min(start + input.session.partSizeBytes, input.file.size);
      const body = input.file.slice(start, end);
      const part = await input.uploadPart(
        input.session.id,
        partNumber,
        body,
        input.signal,
      );
      completed.set(part.partNumber, { ...part, sizeBytes: body.size });
      const progress = tracker.confirm(body.size);
      input.onProgress(progress);
      if (progress.progress === 100) {
        markUploadPhase(input.performanceId, "last_part_confirmed");
      }
    }, input.signal),
  ));

  if (pending.length === 0) {
    input.onProgress(tracker.confirm(0));
    markUploadPhase(input.performanceId, "last_part_confirmed");
  }
  input.signal.throwIfAborted();
  input.onSaving();
  await input.complete();
  markUploadPhase(input.performanceId, "finalize_completed");
  measureUploadPhase(
    input.performanceId,
    "finalize",
    "last_part_confirmed",
    "finalize_completed",
  );
}

export async function uploadFileInParts(input: UploadFileInput): Promise<void> {
  const fingerprint = fileFingerprint(input.file, input.parentId, input.relativePath);
  const resumeStore = createUploadResumeStore();
  let session = await resumeSession(
    fingerprint,
    input.signal,
    resumeStore,
    input.performanceId,
  );
  let action = session
    ? uploadResumeAction(session, input.file, input.parentId, input.relativePath)
    : "create";
  if (action === "create") {
    session = await createSession(input, fingerprint, resumeStore);
    action = "upload";
  }
  markUploadPhase(input.performanceId, "session_ready");
  measureUploadPhase(
    input.performanceId,
    "session_request",
    "session_request_started",
    "session_ready",
  );
  input.onSession(session.id);

  if (action === "done") {
    await safeResumeDelete(resumeStore, fingerprint);
    return;
  }

  const complete = async (): Promise<void> => {
    try {
      await completeUploadSessionWithRecovery(session.id, input.signal);
    } catch (error) {
      if (input.signal.aborted) throw error;
      const detail = error instanceof Error ? error.message : "请稍后重试";
      throw new Error(`保存失败，可重试：${detail}`, { cause: error });
    }
  };
  if (action === "complete") {
    input.onProgress({
      progress: 100,
      uploadedBytes: input.file.size,
      speedBytesPerSecond: 0,
      remainingSeconds: 0,
    });
    markUploadPhase(input.performanceId, "last_part_confirmed");
    input.onSaving();
    await complete();
    markUploadPhase(input.performanceId, "finalize_completed");
    measureUploadPhase(
      input.performanceId,
      "finalize",
      "last_part_confirmed",
      "finalize_completed",
    );
    await safeResumeDelete(resumeStore, fingerprint);
    return;
  }

  await uploadPreparedSession({
    file: input.file,
    session,
    signal: input.signal,
    scheduler: input.scheduler,
    performanceId: input.performanceId,
    uploadPart: (sessionId, partNumber, body, signal) =>
      uploadPartWithRetry(sessionId, partNumber, body, signal, input.scheduler),
    complete,
    onProgress: input.onProgress,
    onSaving: input.onSaving,
  });
  await safeResumeDelete(resumeStore, fingerprint);
}

export function uploadResumeAction(
  session: ClientUploadSession,
  file: File,
  parentId: string | null,
  relativePath: string | null,
): UploadResumeAction {
  if (
    session.name !== file.name ||
    session.sizeBytes !== file.size ||
    session.parentId !== parentId ||
    session.relativePath !== relativePath
  ) {
    return "create";
  }
  if (session.status === "completed") return "done";
  if (session.status === "completing") return "complete";
  if (session.status === "active") return "upload";
  return "create";
}

export async function completeUploadSessionWithRecovery(
  sessionId: string,
  signal: AbortSignal,
  request: UploadRequest = requestJson,
  timeoutMilliseconds = 30_000,
): Promise<void> {
  try {
    await requestUploadCompletion(sessionId, signal, request, timeoutMilliseconds);
    return;
  } catch (error) {
    if (signal.aborted || !isRecoverableFinalizeError(error)) throw error;
  }

  const data = await request<SessionResponse>(
    `/api/uploads/${encodeURIComponent(sessionId)}`,
    { signal },
  );
  if (data.session.status === "completed") return;
  if (data.session.status === "aborted") {
    throw new Error("保存会话已终止，无法恢复");
  }
  await requestUploadCompletion(sessionId, signal, request, timeoutMilliseconds);
}

async function requestUploadCompletion(
  sessionId: string,
  signal: AbortSignal,
  request: UploadRequest,
  timeoutMilliseconds: number,
): Promise<void> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort(new DOMException("保存请求超时", "TimeoutError"));
  }, timeoutMilliseconds);
  try {
    await request(`/api/uploads/${encodeURIComponent(sessionId)}/complete`, {
      method: "POST",
      signal: AbortSignal.any([signal, timeoutController.signal]),
    });
  } finally {
    clearTimeout(timer);
  }
}

function isRecoverableFinalizeError(error: unknown): boolean {
  return error instanceof TypeError ||
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof UploadHttpError && (error.status === 429 || error.status >= 500));
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
  resumeStore: UploadResumeStore,
): Promise<ClientUploadSession> {
  markUploadPhase(input.performanceId, "session_request_started");
  measureUploadPhase(
    input.performanceId,
    "queue_to_session_request",
    "queue_visible",
    "session_request_started",
  );
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
  await safeResumePut(resumeStore, { fingerprint, sessionId: data.session.id });
  return data.session;
}

async function resumeSession(
  fingerprint: string,
  signal: AbortSignal,
  resumeStore: UploadResumeStore,
  performanceId?: string,
): Promise<ClientUploadSession | null> {
  const saved = await safeResumeGet(resumeStore, fingerprint);
  if (!saved) return null;
  try {
    markUploadPhase(performanceId, "session_request_started");
    measureUploadPhase(
      performanceId,
      "queue_to_session_request",
      "queue_visible",
      "session_request_started",
    );
    const data = await requestJson<SessionResponse>(
      `/api/uploads/${encodeURIComponent(saved.sessionId)}`,
      { signal },
    );
    return data.session;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof UploadHttpError && [404, 409, 410].includes(error.status)) {
      await safeResumeDelete(resumeStore, fingerprint);
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
  scheduler: AdaptiveUploadScheduler,
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
      if (!isRetriableUploadError(error)) break;
      scheduler.noteRetry();
      if (attempt >= MAX_PART_ATTEMPTS) break;
      await delay(400 * 2 ** (attempt - 1), signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("分片上传失败，请重试");
}

function isRetriableUploadError(error: unknown): boolean {
  return error instanceof TypeError ||
    (error instanceof UploadHttpError && (error.status === 429 || error.status >= 500));
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

function openUploadDatabase(databaseFactory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = databaseFactory.open(UPLOAD_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(UPLOAD_STORE_NAME)) {
        request.result.createObjectStore(UPLOAD_STORE_NAME, { keyPath: "fingerprint" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地续传记录"));
  });
}

async function withStore<T>(
  databaseFactory: IDBFactory,
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: unknown) => void,
  ) => void,
): Promise<T> {
  const database = await openUploadDatabase(databaseFactory);
  try {
    return await new Promise<T>((resolve, reject) => {
      operation(database.transaction(UPLOAD_STORE_NAME, mode).objectStore(UPLOAD_STORE_NAME), resolve, reject);
    });
  } finally {
    database.close();
  }
}

export function createUploadResumeStore(
  databaseFactory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB,
): UploadResumeStore {
  if (!databaseFactory) {
    return {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    };
  }
  return {
    get: (fingerprint) =>
      withStore<ResumeRecord | null>(databaseFactory, "readonly", (store, resolve, reject) => {
        const request = store.get(fingerprint);
        request.onsuccess = () => resolve((request.result as ResumeRecord | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error("无法读取本地续传记录"));
      }),
    put: (record) =>
      withStore<void>(databaseFactory, "readwrite", (store, resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("无法保存本地续传记录"));
      }),
    delete: (fingerprint) =>
      withStore<void>(databaseFactory, "readwrite", (store, resolve, reject) => {
        const request = store.delete(fingerprint);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("无法清理本地续传记录"));
      }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function markUploadPhase(performanceId: string | undefined, phase: string): void {
  if (!performanceId || typeof performance === "undefined") return;
  performance.mark(`leapbox:${performanceId}:${phase}`);
}

async function safeResumeGet(
  resumeStore: UploadResumeStore,
  fingerprint: string,
): Promise<ResumeRecord | null> {
  try {
    return await resumeStore.get(fingerprint);
  } catch {
    return null;
  }
}

async function safeResumePut(
  resumeStore: UploadResumeStore,
  record: ResumeRecord,
): Promise<void> {
  try {
    await resumeStore.put(record);
  } catch {
    // 浏览器禁用 IndexedDB 时只失去断点续传，不中断本次上传。
  }
}

async function safeResumeDelete(
  resumeStore: UploadResumeStore,
  fingerprint: string,
): Promise<void> {
  try {
    await resumeStore.delete(fingerprint);
  } catch {
    // 清理失败不影响服务端已经确认的上传结果。
  }
}

function measureUploadPhase(
  performanceId: string | undefined,
  name: string,
  startPhase: string,
  endPhase: string,
): void {
  if (!performanceId || typeof performance === "undefined") return;
  try {
    performance.measure(
      `leapbox:${name}`,
      `leapbox:${performanceId}:${startPhase}`,
      `leapbox:${performanceId}:${endPhase}`,
    );
  } catch {
    // 某阶段可能来自迁移前的续传任务；缺少起点时不影响上传。
  }
}
