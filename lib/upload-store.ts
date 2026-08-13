import {
  UPLOAD_PART_BYTES,
  mapPublicItem,
  normalizeItemName,
  parseRelativeFilePath,
  validateCompletedParts,
  validateUploadPart,
  validateUploadSize,
  type ItemRecord,
  type PublicItem,
  type UploadedPart,
} from "./files-core.ts";
import { FileStoreError, type FileDatabase } from "./file-store.ts";

export type UploadPartValue = ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>;

export interface MultipartUpload {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: UploadPartValue): Promise<UploadedPart>;
  complete(parts: UploadedPart[]): Promise<unknown>;
  abort(): Promise<void>;
}

export interface MultipartObjectStore {
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): MultipartUpload;
  delete(key: string): Promise<void>;
}

export type CreateUploadSessionInput = {
  parentId: string | null;
  name: string;
  relativePath: string | null;
  mimeType: string;
  sizeBytes: number;
};

export type PublicUploadPart = UploadedPart & { sizeBytes: number };

export type UploadSessionStatus = "active" | "completing" | "completed" | "aborted";

export type PublicUploadSession = {
  id: string;
  parentId: string | null;
  name: string;
  relativePath: string | null;
  mimeType: string;
  sizeBytes: number;
  partSizeBytes: number;
  status: UploadSessionStatus;
  parts: PublicUploadPart[];
};

type UploadSessionRecord = PublicUploadSession & {
  ownerId: string;
  nameKey: string;
  objectKey: string;
  r2UploadId: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

const SESSION_SELECT = `
  id,
  owner_id as ownerId,
  parent_id as parentId,
  name,
  name_key as nameKey,
  relative_path as relativePath,
  object_key as objectKey,
  r2_upload_id as r2UploadId,
  mime_type as mimeType,
  size_bytes as sizeBytes,
  part_size_bytes as partSizeBytes,
  status,
  created_at as createdAt,
  updated_at as updatedAt,
  expires_at as expiresAt
`;

const ITEM_SELECT = `
  id,
  owner_id as ownerId,
  type,
  parent_id as parentId,
  name,
  name_key as nameKey,
  object_key as objectKey,
  mime_type as mimeType,
  size_bytes as sizeBytes,
  is_favorite as isFavorite,
  created_at as createdAt,
  updated_at as updatedAt,
  last_accessed_at as lastAccessedAt,
  deleted_at as deletedAt,
  original_parent_id as originalParentId
`;

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export class UploadStore {
  readonly #database: FileDatabase;
  readonly #objects: MultipartObjectStore;

  constructor(database: FileDatabase, objects: MultipartObjectStore) {
    this.#database = database;
    this.#objects = objects;
  }

  async createSession(
    ownerId: string,
    input: CreateUploadSessionInput,
  ): Promise<PublicUploadSession> {
    validateUploadSize(input.sizeBytes);
    const { name, nameKey } = normalizeItemName(input.name);
    const relativePath = this.#normalizeRelativePath(input.relativePath, nameKey);
    const mimeType = input.mimeType.trim() || "application/octet-stream";
    if (mimeType.length > 255) {
      throw new FileStoreError("文件类型信息过长", "INVALID_MIME_TYPE", 400);
    }
    await this.#assertUploadTarget(ownerId, input.parentId, nameKey);

    const id = crypto.randomUUID();
    const objectKey = `objects/${crypto.randomUUID()}`;
    const multipart = await this.#objects.createMultipartUpload(objectKey, {
      httpMetadata: { contentType: mimeType },
    });
    const now = Date.now();
    try {
      await this.#database
        .prepare(`
          insert into upload_sessions (
            id, owner_id, parent_id, name, name_key, relative_path, object_key,
            r2_upload_id, mime_type, size_bytes, part_size_bytes, status,
            created_at, updated_at, expires_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `)
        .bind(
          id,
          ownerId,
          input.parentId,
          name,
          nameKey,
          relativePath,
          objectKey,
          multipart.uploadId,
          mimeType,
          input.sizeBytes,
          UPLOAD_PART_BYTES,
          now,
          now,
          now + SESSION_TTL_MS,
        )
        .run();
    } catch {
      await multipart.abort();
      throw new FileStoreError("上传会话创建失败，请重试", "UPLOAD_SESSION_FAILED", 500);
    }
    return this.getSession(ownerId, id);
  }

  async uploadPart(
    ownerId: string,
    sessionId: string,
    partNumber: number,
    value: UploadPartValue,
    sizeBytes: number,
  ): Promise<UploadedPart> {
    const session = await this.#requireSession(ownerId, sessionId);
    this.#assertActive(session);
    validateUploadPart(partNumber, sizeBytes, session.sizeBytes);
    const multipart = this.#objects.resumeMultipartUpload(
      session.objectKey,
      session.r2UploadId,
    );
    const uploaded = await multipart.uploadPart(partNumber, value);
    const etag = uploaded.etag.trim();
    if (uploaded.partNumber !== partNumber || !etag) {
      throw new FileStoreError("存储服务返回了无效分片", "INVALID_PART_RESULT", 502);
    }
    const now = Date.now();
    await this.#database
      .prepare(`
        insert into upload_parts (session_id, part_number, etag, size_bytes, uploaded_at)
        values (?, ?, ?, ?, ?)
        on conflict(session_id, part_number) do update set
          etag = excluded.etag,
          size_bytes = excluded.size_bytes,
          uploaded_at = excluded.uploaded_at
      `)
      .bind(session.id, partNumber, etag, sizeBytes, now)
      .run();
    await this.#database
      .prepare("update upload_sessions set updated_at = ?, expires_at = ? where id = ? and owner_id = ? and status = 'active'")
      .bind(now, now + SESSION_TTL_MS, session.id, ownerId)
      .run();
    return { partNumber, etag };
  }

  async getSession(ownerId: string, sessionId: string): Promise<PublicUploadSession> {
    const session = await this.#requireSession(ownerId, sessionId);
    if (session.status === "active" && session.expiresAt <= Date.now()) {
      throw new FileStoreError("上传会话已过期，请重新上传", "UPLOAD_EXPIRED", 410);
    }
    const { results } = await this.#database
      .prepare(`
        select part_number as partNumber, etag, size_bytes as sizeBytes
        from upload_parts where session_id = ? order by part_number asc
      `)
      .bind(session.id)
      .all<PublicUploadPart>();
    return {
      id: session.id,
      parentId: session.parentId,
      name: session.name,
      relativePath: session.relativePath,
      mimeType: session.mimeType,
      sizeBytes: session.sizeBytes,
      partSizeBytes: session.partSizeBytes,
      status: session.status,
      parts: results.map((part) => ({
        partNumber: part.partNumber,
        etag: part.etag,
        sizeBytes: part.sizeBytes,
      })),
    };
  }

  async completeSession(
    ownerId: string,
    sessionId: string,
    parts: UploadedPart[],
  ): Promise<PublicItem> {
    const session = await this.#requireSession(ownerId, sessionId);
    this.#assertActive(session);
    const completedParts = validateCompletedParts(session.sizeBytes, parts);
    await this.#assertStoredParts(session.id, completedParts);
    await this.#assertUploadTarget(ownerId, session.parentId, session.nameKey);

    const locked = await this.#database
      .prepare(`
        update upload_sessions
        set status = 'completing', updated_at = ?
        where id = ? and owner_id = ? and status = 'active'
        returning id
      `)
      .bind(Date.now(), session.id, ownerId)
      .first<{ id: string }>();
    if (!locked) {
      throw new FileStoreError("上传会话正在完成或已结束", "UPLOAD_NOT_ACTIVE", 409);
    }

    const multipart = this.#objects.resumeMultipartUpload(
      session.objectKey,
      session.r2UploadId,
    );
    await multipart.complete(completedParts);
    const itemId = crypto.randomUUID();
    const now = Date.now();
    try {
      await this.#database
        .prepare(`
          insert into items (
            id, owner_id, type, parent_id, name, name_key, object_key, mime_type,
            size_bytes, is_favorite, created_at, updated_at, last_accessed_at,
            deleted_at, original_parent_id
          ) values (?, ?, 'file', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, null, null)
        `)
        .bind(
          itemId,
          ownerId,
          session.parentId,
          session.name,
          session.nameKey,
          session.objectKey,
          session.mimeType,
          session.sizeBytes,
          now,
          now,
          now,
        )
        .run();
    } catch (error) {
      await this.#objects.delete(session.objectKey);
      await this.#database
        .prepare("update upload_sessions set status = 'aborted', updated_at = ? where id = ? and owner_id = ?")
        .bind(Date.now(), session.id, ownerId)
        .run();
      if (isUniqueError(error)) {
        throw new FileStoreError("同一目录已存在同名项目", "NAME_CONFLICT", 409);
      }
      throw new FileStoreError("上传记录保存失败，请重试", "UPLOAD_RECORD_FAILED", 500);
    }

    await this.#database
      .prepare("update upload_sessions set status = 'completed', updated_at = ? where id = ? and owner_id = ? and status = 'completing'")
      .bind(Date.now(), session.id, ownerId)
      .run();
    const item = await this.#database
      .prepare(`select ${ITEM_SELECT} from items where id = ? and owner_id = ? limit 1`)
      .bind(itemId, ownerId)
      .first<ItemRecord>();
    if (!item) {
      throw new FileStoreError("上传记录读取失败", "UPLOAD_RECORD_MISSING", 500);
    }
    return mapPublicItem(item);
  }

  async abortSession(ownerId: string, sessionId: string): Promise<void> {
    const session = await this.#requireSession(ownerId, sessionId);
    this.#assertActive(session);
    const multipart = this.#objects.resumeMultipartUpload(
      session.objectKey,
      session.r2UploadId,
    );
    await multipart.abort();
    await this.#database.batch([
      this.#database
        .prepare("delete from upload_parts where session_id = ?")
        .bind(session.id),
      this.#database
        .prepare("update upload_sessions set status = 'aborted', updated_at = ? where id = ? and owner_id = ? and status = 'active'")
        .bind(Date.now(), session.id, ownerId),
    ]);
  }

  async #requireSession(ownerId: string, sessionId: string): Promise<UploadSessionRecord> {
    if (!sessionId || sessionId.length > 100) {
      throw new FileStoreError("上传会话参数不正确", "INVALID_UPLOAD_ID", 400);
    }
    const session = await this.#database
      .prepare(`select ${SESSION_SELECT} from upload_sessions where id = ? and owner_id = ? limit 1`)
      .bind(sessionId, ownerId)
      .first<UploadSessionRecord>();
    if (!session) {
      throw new FileStoreError("上传会话不存在或无权访问", "UPLOAD_NOT_FOUND", 404);
    }
    return session;
  }

  #assertActive(session: UploadSessionRecord): void {
    if (session.status !== "active") {
      throw new FileStoreError("上传会话已结束，无法继续", "UPLOAD_NOT_ACTIVE", 409);
    }
    if (session.expiresAt <= Date.now()) {
      throw new FileStoreError("上传会话已过期，请重新上传", "UPLOAD_EXPIRED", 410);
    }
  }

  async #assertUploadTarget(
    ownerId: string,
    parentId: string | null,
    nameKey: string,
  ): Promise<void> {
    if (parentId !== null) {
      const parent = await this.#database
        .prepare("select id from items where id = ? and owner_id = ? and type = 'folder' and deleted_at is null limit 1")
        .bind(parentId, ownerId)
        .first<{ id: string }>();
      if (!parent) {
        throw new FileStoreError("目标文件夹不存在", "PARENT_NOT_FOUND", 404);
      }
    }
    const conflict = await this.#database
      .prepare(`
        select id from items
        where owner_id = ? and name_key = ? and deleted_at is null
          and ${parentId === null ? "parent_id is null" : "parent_id = ?"}
        limit 1
      `)
      .bind(...(parentId === null ? [ownerId, nameKey] : [ownerId, nameKey, parentId]))
      .first<{ id: string }>();
    if (conflict) {
      throw new FileStoreError("同一目录已存在同名项目", "NAME_CONFLICT", 409);
    }
  }

  async #assertStoredParts(sessionId: string, parts: UploadedPart[]): Promise<void> {
    const { results } = await this.#database
      .prepare("select part_number as partNumber, etag from upload_parts where session_id = ? order by part_number asc")
      .bind(sessionId)
      .all<UploadedPart>();
    if (
      results.length !== parts.length ||
      results.some(
        (part, index) =>
          part.partNumber !== parts[index]?.partNumber || part.etag !== parts[index]?.etag,
      )
    ) {
      throw new FileStoreError("上传分片状态不一致，请刷新后重试", "PARTS_MISMATCH", 409);
    }
  }

  #normalizeRelativePath(relativePath: string | null, nameKey: string): string | null {
    if (relativePath === null || !relativePath.trim()) return null;
    let parsed;
    try {
      parsed = parseRelativeFilePath(relativePath);
    } catch {
      throw new FileStoreError("文件相对路径不正确", "INVALID_RELATIVE_PATH", 400);
    }
    if (normalizeItemName(parsed.fileName).nameKey !== nameKey) {
      throw new FileStoreError("文件名与相对路径不一致", "RELATIVE_PATH_MISMATCH", 400);
    }
    return parsed.relativePath;
  }
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Error && /unique constraint|idx_items_active/iu.test(error.message);
}
