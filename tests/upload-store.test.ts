import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";

import { UPLOAD_PART_BYTES } from "../lib/files-core.ts";
import {
  FileStore,
  type FileDatabase,
  type FileObject,
  type FileObjectStore,
  type FileStatement,
} from "../lib/file-store.ts";
import {
  UploadStore,
  type MultipartObjectStore,
  type MultipartUpload,
  type UploadPartValue,
} from "../lib/upload-store.ts";

type SqlValue = string | number | bigint | null | Uint8Array;

class MemoryStatement implements FileStatement {
  readonly #statement: StatementSync;
  #values: SqlValue[] = [];

  constructor(statement: StatementSync) {
    this.#statement = statement;
  }

  bind(...values: unknown[]): FileStatement {
    this.#values = values.map(toSqlValue);
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.#statement.get(...this.#values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.#statement.all(...this.#values) as T[] };
  }

  async run(): Promise<{ success: boolean }> {
    this.#statement.run(...this.#values);
    return { success: true };
  }
}

class MemoryDatabase implements FileDatabase {
  readonly sqlite = new DatabaseSync(":memory:");
  failNextItemInsert = false;
  failNextBatchWith: string | null = null;
  batchCalls = 0;
  readonly preparedSql: string[] = [];

  prepare(sql: string): FileStatement {
    this.preparedSql.push(sql);
    if (this.failNextItemInsert && /^\s*insert into items/iu.test(sql)) {
      this.failNextItemInsert = false;
      return failingStatement("forced item insert failure");
    }
    return new MemoryStatement(this.sqlite.prepare(sql));
  }

  async batch(statements: FileStatement[]): Promise<Array<{ success: boolean }>> {
    this.batchCalls += 1;
    if (this.failNextBatchWith) {
      const message = this.failNextBatchWith;
      this.failNextBatchWith = null;
      throw new Error(message);
    }
    const results: Array<{ success: boolean }> = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  close(): void {
    this.sqlite.close();
  }
}

type FakeMultipartState = {
  key: string;
  parts: Map<number, string>;
  aborted: boolean;
  completed: boolean;
  completeCalls: number;
};

class MemoryObjectStore implements FileObjectStore, MultipartObjectStore {
  readonly values = new Map<string, Uint8Array>();
  readonly uploads = new Map<string, FakeMultipartState>();
  nextUploadId = 1;

  async put(key: string, value: ArrayBuffer): Promise<void> {
    this.values.set(key, new Uint8Array(value));
  }

  async get(key: string): Promise<FileObject | null> {
    const value = this.values.get(key);
    if (!value) return null;
    return {
      size: value.byteLength,
      body: new Blob([value.slice().buffer]).stream(),
      arrayBuffer: async () => value.slice().buffer,
    };
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async head(key: string): Promise<{ size: number } | null> {
    const value = this.values.get(key);
    return value ? { size: value.byteLength } : null;
  }

  async createMultipartUpload(key: string): Promise<MultipartUpload> {
    const uploadId = `upload-${this.nextUploadId++}`;
    this.uploads.set(uploadId, {
      key,
      parts: new Map(),
      aborted: false,
      completed: false,
      completeCalls: 0,
    });
    return this.resumeMultipartUpload(key, uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): MultipartUpload {
    const state = this.uploads.get(uploadId);
    if (!state || state.key !== key) throw new Error("missing multipart upload");
    return {
      key,
      uploadId,
      uploadPart: async (partNumber: number, value: UploadPartValue) => {
        const bytes = await valueBytes(value);
        const etag = `etag-${partNumber}-${bytes.byteLength}`;
        state.parts.set(partNumber, etag);
        return { partNumber, etag };
      },
      complete: async (parts) => {
        state.completeCalls += 1;
        assert.deepEqual(
          parts,
          [...state.parts].map(([partNumber, etag]) => ({ partNumber, etag })),
        );
        state.completed = true;
        this.values.set(key, new Uint8Array([1, 2, 3]));
      },
      abort: async () => {
        state.aborted = true;
      },
    };
  }
}

async function createStores() {
  const database = new MemoryDatabase();
  const migrationFiles = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();
  for (const name of migrationFiles) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    database.sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const objects = new MemoryObjectStore();
  const files = new FileStore(database, objects);
  await files.syncUser({ userId: "owner-a", email: "a@example.com" });
  await files.syncUser({ userId: "owner-b", email: "b@example.com" });
  const uploads = new UploadStore(database, objects);
  return { database, files, objects, uploads };
}

test("创建会话只返回公开字段并在 R2 建立 multipart 上传", async () => {
  const { database, objects, uploads } = await createStores();
  try {
    const statementStart = database.preparedSql.length;
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "archive.zip",
      relativePath: null,
      mimeType: "application/zip",
      sizeBytes: UPLOAD_PART_BYTES + 1,
    });
    assert.equal(session.status, "active");
    assert.equal(session.partSizeBytes, UPLOAD_PART_BYTES);
    assert.deepEqual(session.parts, []);
    assert.equal(objects.uploads.size, 1);
    assert.equal("objectKey" in session, false);
    assert.equal("r2UploadId" in session, false);
    assert.equal(
      database.preparedSql.slice(statementStart).some((sql) => /select[^]*from upload_sessions/iu.test(sql)),
      false,
      "创建会话后不应重新读取刚写入的会话",
    );
    const stored = database.sqlite
      .prepare("select item_id as itemId from upload_sessions where id = ?")
      .get(session.id) as { itemId: string | null };
    assert.ok(stored.itemId);
  } finally {
    database.close();
  }
});

test("上传目标目录与同名冲突使用一次数据库预检", async () => {
  const { database, files, uploads } = await createStores();
  try {
    const folder = await files.createFolder("owner-a", "目标", null);
    const statementStart = database.preparedSql.length;
    await uploads.createSession("owner-a", {
      parentId: folder.id,
      name: "quick-start.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1,
    });
    const itemReads = database.preparedSql.slice(statementStart)
      .filter((sql) => /select[^]*from items/iu.test(sql));
    assert.equal(itemReads.length, 1);
  } finally {
    database.close();
  }
});

test("上传分片持久化 ETag，刷新状态时可准确跳过已完成分片", async () => {
  const { database, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "movie.bin",
      relativePath: "素材/movie.bin",
      mimeType: "application/octet-stream",
      sizeBytes: UPLOAD_PART_BYTES + 1,
    });
    const batchCalls = database.batchCalls;
    const first = await uploads.uploadPart(
      "owner-a",
      session.id,
      1,
      new Uint8Array(UPLOAD_PART_BYTES),
      UPLOAD_PART_BYTES,
    );
    assert.equal(first.etag, `etag-1-${UPLOAD_PART_BYTES}`);
    assert.equal(database.batchCalls, batchCalls + 1, "分片记录与会话续期应合并为一次批处理");
    const refreshed = await uploads.getSession("owner-a", session.id);
    assert.deepEqual(refreshed.parts, [
      { partNumber: 1, etag: first.etag, sizeBytes: UPLOAD_PART_BYTES },
    ]);
    await assert.rejects(uploads.getSession("owner-b", session.id), /不存在|无权/);
  } finally {
    database.close();
  }
});

test("完成会话写入文件记录并将状态置为 completed", async () => {
  const { database, files, objects, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "dataset.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: UPLOAD_PART_BYTES + 1,
    });
    await uploads.uploadPart(
      "owner-a", session.id, 1, new Uint8Array(UPLOAD_PART_BYTES), UPLOAD_PART_BYTES,
    );
    await uploads.uploadPart(
      "owner-a", session.id, 2, new Uint8Array(1), 1,
    );
    const item = await uploads.completeSession("owner-a", session.id);
    assert.equal(item.name, "dataset.bin");
    assert.equal(item.sizeBytes, UPLOAD_PART_BYTES + 1);
    assert.equal((await uploads.getSession("owner-a", session.id)).status, "completed");
    assert.equal([...objects.uploads.values()][0]?.completed, true);
    assert.deepEqual((await files.listItems("owner-a", { view: "files" })).items, [item]);
  } finally {
    database.close();
  }
});

test("完成接口使用服务端分片清单且重复调用返回同一个文件", async () => {
  const { database, objects, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "idempotent.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1,
    });
    await uploads.uploadPart("owner-a", session.id, 1, new Uint8Array(1), 1);

    const first = await uploads.completeSession("owner-a", session.id);
    const second = await uploads.completeSession("owner-a", session.id);

    assert.equal(second.id, first.id);
    assert.equal(
      database.sqlite.prepare("select count(*) as total from items where id = ?")
        .get(first.id)?.total,
      1,
    );
    assert.equal([...objects.uploads.values()][0]?.completeCalls, 1);
  } finally {
    database.close();
  }
});

test("迁移前活动会话会补分配 item_id 后再完成", async () => {
  const { database, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "legacy.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1,
    });
    database.sqlite.prepare("update upload_sessions set item_id = null where id = ?")
      .run(session.id);
    await uploads.uploadPart("owner-a", session.id, 1, new Uint8Array(1), 1);

    const item = await uploads.completeSession("owner-a", session.id);
    const stored = database.sqlite
      .prepare("select item_id as itemId from upload_sessions where id = ?")
      .get(session.id) as { itemId: string | null };
    assert.equal(stored.itemId, item.id);
  } finally {
    database.close();
  }
});

test("R2 已合并但 D1 未落库时可从 completing 状态恢复", async () => {
  const { database, objects, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "recover.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1,
    });
    await uploads.uploadPart("owner-a", session.id, 1, new Uint8Array(1), 1);
    const raw = database.sqlite.prepare(`
      select object_key as objectKey, r2_upload_id as uploadId
      from upload_sessions where id = ?
    `).get(session.id) as { objectKey: string; uploadId: string };
    await objects.resumeMultipartUpload(raw.objectKey, raw.uploadId)
      .complete([{ partNumber: 1, etag: "etag-1-1" }]);
    database.sqlite.prepare("update upload_sessions set status = 'completing' where id = ?")
      .run(session.id);

    const item = await uploads.completeSession("owner-a", session.id);
    assert.equal(item.name, "recover.bin");
    assert.equal((await uploads.getSession("owner-a", session.id)).status, "completed");
    assert.equal([...objects.uploads.values()][0]?.completeCalls, 1);
  } finally {
    database.close();
  }
});

test("D1 暂时故障保留 completing 和 R2 对象以便再次保存", async () => {
  const { database, objects, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "retry-save.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1,
    });
    await uploads.uploadPart("owner-a", session.id, 1, new Uint8Array(1), 1);
    database.failNextBatchWith = "D1_ERROR: database is locked";

    await assert.rejects(
      uploads.completeSession("owner-a", session.id),
      /暂时失败|重试/u,
    );
    assert.equal((await uploads.getSession("owner-a", session.id)).status, "completing");
    assert.equal(objects.values.size, 1);

    const item = await uploads.completeSession("owner-a", session.id);
    assert.equal(item.name, "retry-save.bin");
    assert.equal([...objects.uploads.values()][0]?.completeCalls, 1);
  } finally {
    database.close();
  }
});

test("文件记录写入失败时清理已完成对象并终止会话", async () => {
  const { database, objects, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "broken.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1,
    });
    await uploads.uploadPart(
      "owner-a", session.id, 1, new Uint8Array(1), 1,
    );
    database.failNextItemInsert = true;
    await assert.rejects(
      uploads.completeSession("owner-a", session.id),
      /上传记录保存失败/,
    );
    assert.equal(objects.values.size, 0);
    assert.equal((await uploads.getSession("owner-a", session.id)).status, "aborted");
  } finally {
    database.close();
  }
});

test("取消会话会中止 R2 multipart 并禁止继续传片", async () => {
  const { database, objects, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "cancel.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1,
    });
    await uploads.abortSession("owner-a", session.id);
    assert.equal([...objects.uploads.values()][0]?.aborted, true);
    assert.equal((await uploads.getSession("owner-a", session.id)).status, "aborted");
    await assert.rejects(
      uploads.uploadPart("owner-a", session.id, 1, new Uint8Array(1), 1),
      /无法继续/,
    );
  } finally {
    database.close();
  }
});

test("查询已过期的活动会话会要求客户端重新创建上传", async () => {
  const { database, uploads } = await createStores();
  try {
    const session = await uploads.createSession("owner-a", {
      parentId: null,
      name: "expired.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 1,
    });
    database.sqlite
      .prepare("update upload_sessions set expires_at = ? where id = ?")
      .run(Date.now() - 1, session.id);
    await assert.rejects(uploads.getSession("owner-a", session.id), /已过期/);
  } finally {
    database.close();
  }
});

function failingStatement(message: string): FileStatement {
  const statement: FileStatement = {
    bind: () => statement,
    first: async <T>() => null as T | null,
    all: async <T>() => ({ results: [] as T[] }),
    run: async () => {
      throw new Error(message);
    },
  };
  return statement;
}

function toSqlValue(value: unknown): SqlValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError(`不支持的测试 SQL 参数：${String(value)}`);
}

async function valueBytes(value: UploadPartValue): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(await new Response(value).arrayBuffer());
}
