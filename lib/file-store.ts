import {
  buildBreadcrumb,
  isMoveTargetAllowed,
  mapPublicItem,
  normalizeItemName,
  resolveSort,
  validateUploadSize,
  type BreadcrumbEntry,
  type FolderLink,
  type ItemRecord,
  type PublicItem,
} from "./files-core.ts";

export interface FileStatement {
  bind(...values: unknown[]): FileStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

export interface FileDatabase {
  prepare(sql: string): FileStatement;
  batch(statements: FileStatement[]): Promise<Array<{ success: boolean }>>;
}

export interface FileObject {
  size: number;
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FileObjectStore {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<FileObject | null>;
  delete(key: string): Promise<void>;
}

export type FileView = "files" | "recent" | "favorites" | "trash" | "search";

export type ListOptions = {
  view: FileView;
  parentId?: string | null;
  query?: string;
  sort?: string | null;
  direction?: string | null;
};

export type ListResult = {
  items: PublicItem[];
  breadcrumb: BreadcrumbEntry[];
  validDirectory: boolean;
};

export type StorageSummary = {
  fileCount: number;
  folderCount: number;
  usedBytes: number;
};

export type FolderOption = {
  id: string;
  name: string;
  location: string;
};

type CountRow = {
  direct: number;
  total: number;
};

type StorageRow = {
  fileCount: number;
  folderCount: number;
  usedBytes: number;
};

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

export class FileStoreError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "FileStoreError";
    this.code = code;
    this.status = status;
  }
}

export class FileStore {
  readonly #database: FileDatabase;
  readonly #objects: FileObjectStore;

  constructor(database: FileDatabase, objects: FileObjectStore) {
    this.#database = database;
    this.#objects = objects;
  }

  async syncUser(user: { userId: string; email: string }): Promise<void> {
    const now = Date.now();
    await this.#database
      .prepare(`
        insert into users (id, email, created_at, updated_at)
        values (?, ?, ?, ?)
        on conflict(id) do update set email = excluded.email, updated_at = excluded.updated_at
      `)
      .bind(user.userId, user.email, now, now)
      .run();
  }

  async createFolder(
    ownerId: string,
    rawName: string,
    parentId: string | null,
  ): Promise<PublicItem> {
    const { name, nameKey } = normalizeItemName(rawName);
    await this.#requireParent(ownerId, parentId);
    await this.#assertNameAvailable(ownerId, parentId, nameKey);
    const now = Date.now();
    const id = crypto.randomUUID();
    try {
      await this.#database
        .prepare(`
          insert into items (
            id, owner_id, type, parent_id, name, name_key, object_key, mime_type,
            size_bytes, is_favorite, created_at, updated_at, last_accessed_at,
            deleted_at, original_parent_id
          ) values (?, ?, 'folder', ?, ?, ?, null, null, 0, 0, ?, ?, ?, null, null)
        `)
        .bind(id, ownerId, parentId, name, nameKey, now, now, now)
        .run();
    } catch (error) {
      throw this.#toWriteError(error);
    }
    return mapPublicItem(await this.#requireItem(ownerId, id, false));
  }

  async uploadFile(
    ownerId: string,
    parentId: string | null,
    file: File,
  ): Promise<PublicItem> {
    validateUploadSize(file.size);
    const { name, nameKey } = normalizeItemName(file.name);
    await this.#requireParent(ownerId, parentId);
    await this.#assertNameAvailable(ownerId, parentId, nameKey);

    const id = crypto.randomUUID();
    const objectKey = `objects/${crypto.randomUUID()}`;
    const mimeType = file.type.trim() || "application/octet-stream";
    const now = Date.now();
    await this.#objects.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: mimeType },
    });

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
          id,
          ownerId,
          parentId,
          name,
          nameKey,
          objectKey,
          mimeType,
          file.size,
          now,
          now,
          now,
        )
        .run();
    } catch (error) {
      await this.#objects.delete(objectKey);
      if (this.#isUniqueError(error)) throw this.#conflictError();
      throw new FileStoreError("上传记录保存失败，请重试", "UPLOAD_RECORD_FAILED", 500);
    }
    return mapPublicItem(await this.#requireItem(ownerId, id, false));
  }

  async listItems(ownerId: string, options: ListOptions): Promise<ListResult> {
    const folders = await this.#activeFolders(ownerId);
    const requestedParent = options.parentId ?? null;
    const breadcrumbResult = buildBreadcrumb(requestedParent, folders);
    const parentId = breadcrumbResult.valid ? requestedParent : null;

    if (options.view === "files" && parentId !== null) {
      await this.#database
        .prepare(
          "update items set last_accessed_at = ?, updated_at = updated_at where id = ? and owner_id = ? and deleted_at is null",
        )
        .bind(Date.now(), parentId, ownerId)
        .run();
    }

    const { column, direction } = resolveSort(options.sort ?? null, options.direction ?? null);
    const orderSql = `case when type = 'folder' then 0 else 1 end asc, ${column} ${direction}, id asc`;
    let statement: FileStatement;

    if (options.view === "recent") {
      statement = this.#database
        .prepare(`select ${ITEM_SELECT} from items where owner_id = ? and deleted_at is null order by last_accessed_at desc, id asc limit 200`)
        .bind(ownerId);
    } else if (options.view === "favorites") {
      statement = this.#database
        .prepare(`select ${ITEM_SELECT} from items where owner_id = ? and deleted_at is null and is_favorite = 1 order by ${orderSql} limit 300`)
        .bind(ownerId);
    } else if (options.view === "trash") {
      statement = this.#database
        .prepare(`
          select ${ITEM_SELECT}
          from items i
          where i.owner_id = ? and i.deleted_at is not null
            and (
              i.parent_id is null or not exists (
                select 1 from items p
                where p.id = i.parent_id and p.owner_id = ? and p.deleted_at is not null
              )
            )
          order by i.deleted_at desc, i.id asc
          limit 300
        `)
        .bind(ownerId, ownerId);
    } else if (options.view === "search") {
      const query = (options.query ?? "").trim().normalize("NFC").toLocaleLowerCase();
      statement = this.#database
        .prepare(`select ${ITEM_SELECT} from items where owner_id = ? and deleted_at is null and name_key like ? escape '\\' order by ${orderSql} limit 300`)
        .bind(ownerId, `%${escapeLike(query)}%`);
    } else {
      const parentClause = parentId === null ? "parent_id is null" : "parent_id = ?";
      statement = this.#database
        .prepare(`select ${ITEM_SELECT} from items where owner_id = ? and deleted_at is null and ${parentClause} order by ${orderSql} limit 300`)
        .bind(...(parentId === null ? [ownerId] : [ownerId, parentId]));
    }

    const { results } = await statement.all<ItemRecord>();
    const includeLocation = options.view === "search" || options.view === "recent" || options.view === "favorites";
    return {
      items: results.map((item) =>
        mapPublicItem(item, includeLocation ? folderLocation(item.parentId, folders) : undefined),
      ),
      breadcrumb: breadcrumbResult.valid
        ? breadcrumbResult.entries
        : buildBreadcrumb(null, folders).entries,
      validDirectory: breadcrumbResult.valid,
    };
  }

  async getStorageSummary(ownerId: string): Promise<StorageSummary> {
    const row = await this.#database
      .prepare(`
        select
          sum(case when type = 'file' then 1 else 0 end) as fileCount,
          sum(case when type = 'folder' then 1 else 0 end) as folderCount,
          coalesce(sum(case when type = 'file' then size_bytes else 0 end), 0) as usedBytes
        from items where owner_id = ?
      `)
      .bind(ownerId)
      .first<StorageRow>();
    return {
      fileCount: Number(row?.fileCount ?? 0),
      folderCount: Number(row?.folderCount ?? 0),
      usedBytes: Number(row?.usedBytes ?? 0),
    };
  }

  async getFolderOptions(ownerId: string): Promise<FolderOption[]> {
    const folders = await this.#activeFolders(ownerId);
    return folders
      .map((folder) => ({
        id: folder.id,
        name: folder.name ?? "未命名文件夹",
        location: folderLocation(folder.parentId, folders),
      }))
      .sort((left, right) =>
        `${left.location}/${left.name}`.localeCompare(
          `${right.location}/${right.name}`,
          "zh-CN",
        ),
      );
  }

  async renameItem(ownerId: string, itemId: string, rawName: string): Promise<PublicItem> {
    const item = await this.#requireItem(ownerId, itemId, false);
    const { name, nameKey } = normalizeItemName(rawName);
    await this.#assertNameAvailable(ownerId, item.parentId, nameKey, item.id);
    try {
      await this.#database
        .prepare("update items set name = ?, name_key = ?, updated_at = ? where id = ? and owner_id = ? and deleted_at is null")
        .bind(name, nameKey, Date.now(), item.id, ownerId)
        .run();
    } catch (error) {
      throw this.#toWriteError(error);
    }
    return mapPublicItem(await this.#requireItem(ownerId, itemId, false));
  }

  async setFavorite(ownerId: string, itemId: string, favorite: boolean): Promise<PublicItem> {
    await this.#requireItem(ownerId, itemId, false);
    await this.#database
      .prepare("update items set is_favorite = ?, updated_at = ? where id = ? and owner_id = ? and deleted_at is null")
      .bind(favorite ? 1 : 0, Date.now(), itemId, ownerId)
      .run();
    return mapPublicItem(await this.#requireItem(ownerId, itemId, false));
  }

  async moveItem(ownerId: string, itemId: string, parentId: string | null): Promise<PublicItem> {
    const item = await this.#requireItem(ownerId, itemId, false);
    await this.#requireParent(ownerId, parentId);
    if (item.type === "folder") {
      const folders = await this.#activeFolders(ownerId);
      if (!isMoveTargetAllowed(item.id, parentId, folders)) {
        throw new FileStoreError("文件夹不能移动到自身或子目录", "INVALID_MOVE", 400);
      }
    }
    await this.#assertNameAvailable(ownerId, parentId, item.nameKey, item.id);
    try {
      await this.#database
        .prepare("update items set parent_id = ?, updated_at = ? where id = ? and owner_id = ? and deleted_at is null")
        .bind(parentId, Date.now(), item.id, ownerId)
        .run();
    } catch (error) {
      throw this.#toWriteError(error);
    }
    return mapPublicItem(await this.#requireItem(ownerId, itemId, false));
  }

  async getFolderCount(ownerId: string, folderId: string): Promise<CountRow> {
    const folder = await this.#requireItem(ownerId, folderId, false);
    if (folder.type !== "folder") {
      throw new FileStoreError("该项目不是文件夹", "NOT_A_FOLDER", 400);
    }
    const row = await this.#database
      .prepare(`
        with recursive descendants(id, parent_id, depth) as (
          select id, parent_id, 1 from items
          where parent_id = ? and owner_id = ? and deleted_at is null
          union all
          select child.id, child.parent_id, descendants.depth + 1
          from items child join descendants on child.parent_id = descendants.id
          where child.owner_id = ? and child.deleted_at is null
        )
        select
          coalesce(sum(case when depth = 1 then 1 else 0 end), 0) as direct,
          count(*) as total
        from descendants
      `)
      .bind(folderId, ownerId, ownerId)
      .first<CountRow>();
    return { direct: Number(row?.direct ?? 0), total: Number(row?.total ?? 0) };
  }

  async trashItem(ownerId: string, itemId: string, confirmedCount?: number): Promise<void> {
    const item = await this.#requireItem(ownerId, itemId, false);
    if (item.type === "folder") {
      const count = await this.getFolderCount(ownerId, item.id);
      if (count.total > 0 && confirmedCount !== count.total) {
        throw new FileStoreError(
          `文件夹内共有 ${count.total} 个项目，确认数量已变化，请重新确认`,
          "CONFIRMATION_MISMATCH",
          409,
        );
      }
    }
    const subtree = await this.#subtree(ownerId, item.id, false);
    const now = Date.now();
    await this.#database.batch(
      subtree.map((entry) =>
        this.#database
          .prepare("update items set deleted_at = ?, original_parent_id = parent_id, updated_at = ? where id = ? and owner_id = ? and deleted_at is null")
          .bind(now, now, entry.id, ownerId),
      ),
    );
  }

  async restoreItem(ownerId: string, itemId: string): Promise<void> {
    const item = await this.#requireItem(ownerId, itemId, true);
    if (item.deletedAt === null) {
      throw new FileStoreError("项目不在回收站中", "NOT_TRASHED", 409);
    }
    const subtree = await this.#subtree(ownerId, item.id, true);
    let targetParent = item.originalParentId;
    if (targetParent !== null) {
      const parent = await this.#findItem(ownerId, targetParent, false);
      if (!parent || parent.type !== "folder") targetParent = null;
    }
    await this.#assertNameAvailable(ownerId, targetParent, item.nameKey, item.id);
    const now = Date.now();
    const statements = subtree.map((entry) => {
      if (entry.id === item.id) {
        return this.#database
          .prepare("update items set parent_id = ?, deleted_at = null, original_parent_id = null, updated_at = ? where id = ? and owner_id = ?")
          .bind(targetParent, now, entry.id, ownerId);
      }
      return this.#database
        .prepare("update items set deleted_at = null, original_parent_id = null, updated_at = ? where id = ? and owner_id = ?")
        .bind(now, entry.id, ownerId);
    });
    try {
      await this.#database.batch(statements);
    } catch (error) {
      throw this.#toWriteError(error);
    }
  }

  async permanentlyDelete(ownerId: string, itemId: string): Promise<void> {
    const item = await this.#requireItem(ownerId, itemId, true);
    if (item.deletedAt === null) {
      throw new FileStoreError("请先将项目移入回收站", "NOT_TRASHED", 409);
    }
    const subtree = await this.#subtree(ownerId, item.id, true);
    for (const entry of subtree) {
      if (entry.type === "file" && entry.objectKey) await this.#objects.delete(entry.objectKey);
    }
    await this.#database.batch(
      subtree
        .reverse()
        .map((entry) =>
          this.#database
            .prepare("delete from items where id = ? and owner_id = ? and deleted_at is not null")
            .bind(entry.id, ownerId),
        ),
    );
  }

  async getFile(ownerId: string, itemId: string, allowDeleted: boolean): Promise<ItemRecord> {
    const item = await this.#requireItem(ownerId, itemId, allowDeleted);
    if (item.type !== "file" || !item.objectKey) {
      throw new FileStoreError("该项目不是文件", "NOT_A_FILE", 400);
    }
    if (!allowDeleted && item.deletedAt !== null) {
      throw new FileStoreError("文件不存在", "FILE_NOT_FOUND", 404);
    }
    return item;
  }

  async getObject(item: ItemRecord): Promise<FileObject> {
    if (!item.objectKey) {
      throw new FileStoreError("文件对象不存在", "OBJECT_MISSING", 404);
    }
    const object = await this.#objects.get(item.objectKey);
    if (!object) {
      throw new FileStoreError("文件内容不存在，元数据仍保留", "OBJECT_MISSING", 404);
    }
    return object;
  }

  async touchFile(ownerId: string, itemId: string): Promise<void> {
    await this.#database
      .prepare("update items set last_accessed_at = ? where id = ? and owner_id = ? and deleted_at is null")
      .bind(Date.now(), itemId, ownerId)
      .run();
  }

  async #requireParent(ownerId: string, parentId: string | null): Promise<void> {
    if (parentId === null) return;
    const parent = await this.#findItem(ownerId, parentId, false);
    if (!parent || parent.type !== "folder") {
      throw new FileStoreError("目标文件夹不存在", "PARENT_NOT_FOUND", 404);
    }
  }

  async #findItem(
    ownerId: string,
    itemId: string,
    includeDeleted: boolean,
  ): Promise<ItemRecord | null> {
    return this.#database
      .prepare(`select ${ITEM_SELECT} from items where id = ? and owner_id = ? ${includeDeleted ? "" : "and deleted_at is null"} limit 1`)
      .bind(itemId, ownerId)
      .first<ItemRecord>();
  }

  async #requireItem(ownerId: string, itemId: string, includeDeleted: boolean): Promise<ItemRecord> {
    const item = await this.#findItem(ownerId, itemId, includeDeleted);
    if (!item) {
      throw new FileStoreError("文件不存在或无权访问", "FILE_NOT_FOUND", 404);
    }
    return item;
  }

  async #assertNameAvailable(
    ownerId: string,
    parentId: string | null,
    nameKey: string,
    exceptId?: string,
  ): Promise<void> {
    const row = await this.#database
      .prepare(`
        select id from items
        where owner_id = ? and name_key = ? and deleted_at is null
          and ${parentId === null ? "parent_id is null" : "parent_id = ?"}
          ${exceptId ? "and id <> ?" : ""}
        limit 1
      `)
      .bind(
        ...[
          ownerId,
          nameKey,
          ...(parentId === null ? [] : [parentId]),
          ...(exceptId ? [exceptId] : []),
        ],
      )
      .first<{ id: string }>();
    if (row) throw this.#conflictError();
  }

  async #activeFolders(ownerId: string): Promise<FolderLink[]> {
    const { results } = await this.#database
      .prepare("select id, parent_id as parentId, name from items where owner_id = ? and type = 'folder' and deleted_at is null")
      .bind(ownerId)
      .all<FolderLink>();
    return results;
  }

  async #subtree(ownerId: string, rootId: string, includeDeleted: boolean): Promise<ItemRecord[]> {
    const deletionFilter = includeDeleted ? "" : "and child.deleted_at is null";
    const { results } = await this.#database
      .prepare(`
        with recursive subtree(id) as (
          select id from items where id = ? and owner_id = ?
          union all
          select child.id from items child join subtree on child.parent_id = subtree.id
          where child.owner_id = ? ${deletionFilter}
        )
        select ${ITEM_SELECT} from items where id in (select id from subtree)
      `)
      .bind(rootId, ownerId, ownerId)
      .all<ItemRecord>();
    return results;
  }

  #isUniqueError(error: unknown): boolean {
    return error instanceof Error && /unique constraint|idx_items_active/iu.test(error.message);
  }

  #conflictError(): FileStoreError {
    return new FileStoreError("同一目录已存在同名项目", "NAME_CONFLICT", 409);
  }

  #toWriteError(error: unknown): FileStoreError {
    if (this.#isUniqueError(error)) return this.#conflictError();
    return new FileStoreError("保存失败，请重试", "WRITE_FAILED", 500);
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function folderLocation(parentId: string | null, folders: FolderLink[]): string {
  const breadcrumb = buildBreadcrumb(parentId, folders);
  if (!breadcrumb.valid) return "我的文件";
  return breadcrumb.entries.map((entry) => entry.name).join(" / ");
}
