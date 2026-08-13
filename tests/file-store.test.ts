import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";

import {
  FileStore,
  type FileDatabase,
  type FileObject,
  type FileObjectStore,
  type FileStatement,
} from "../lib/file-store.ts";

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

  prepare(sql: string): FileStatement {
    if (this.failNextItemInsert && /^\s*insert into items/iu.test(sql)) {
      this.failNextItemInsert = false;
      return {
        bind: () => ({
          bind: () => this.prepare(sql),
          first: async <T>() => null as T | null,
          all: async <T>() => ({ results: [] as T[] }),
          run: async () => {
            throw new Error("forced insert failure");
          },
        }),
        first: async <T>() => null as T | null,
        all: async <T>() => ({ results: [] as T[] }),
        run: async () => {
          throw new Error("forced insert failure");
        },
      };
    }
    return new MemoryStatement(this.sqlite.prepare(sql));
  }

  async batch(statements: FileStatement[]): Promise<Array<{ success: boolean }>> {
    const results: Array<{ success: boolean }> = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  close(): void {
    this.sqlite.close();
  }
}

class MemoryObjectStore implements FileObjectStore {
  readonly values = new Map<string, Uint8Array>();

  async put(key: string, value: ArrayBuffer): Promise<void> {
    this.values.set(key, new Uint8Array(value));
  }

  async get(key: string): Promise<FileObject | null> {
    const value = this.values.get(key);
    if (!value) return null;
    return {
      size: value.byteLength,
      body: new Blob([value.slice().buffer]).stream(),
      arrayBuffer: async () => value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
      ) as ArrayBuffer,
    };
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
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

async function createStore() {
  const database = new MemoryDatabase();
  const files = await readdir(new URL("../drizzle/", import.meta.url));
  const migration = files.find((name) => /^0000_.+\.sql$/u.test(name));
  assert.ok(migration);
  const sql = await readFile(new URL(`../drizzle/${migration}`, import.meta.url), "utf8");
  database.sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  const objects = new MemoryObjectStore();
  const store = new FileStore(database, objects);
  await store.syncUser({ userId: "owner-a", email: "a@example.com" });
  await store.syncUser({ userId: "owner-b", email: "b@example.com" });
  return { database, objects, store };
}

test("文件夹只能创建在当前用户自己的有效目录中", async () => {
  const { database, store } = await createStore();
  try {
    const root = await store.createFolder("owner-a", "工作", null);
    assert.equal(root.name, "工作");
    await assert.rejects(
      store.createFolder("owner-b", "越权", root.id),
      /目标文件夹不存在/,
    );
  } finally {
    database.close();
  }
});

test("同一目录同名不会覆盖，其他目录允许同名", async () => {
  const { database, store } = await createStore();
  try {
    const first = await store.createFolder("owner-a", "资料", null);
    await assert.rejects(store.createFolder("owner-a", "资料", null), /同名项目/);
    await assert.doesNotReject(store.createFolder("owner-a", "资料", first.id));
  } finally {
    database.close();
  }
});

test("目录不能移动到自身或后代", async () => {
  const { database, store } = await createStore();
  try {
    const a = await store.createFolder("owner-a", "A", null);
    const b = await store.createFolder("owner-a", "B", a.id);
    await assert.rejects(store.moveItem("owner-a", a.id, b.id), /自身或子目录/);
  } finally {
    database.close();
  }
});

test("非空文件夹要求精确确认数量，并可递归进入回收站和恢复", async () => {
  const { database, store } = await createStore();
  try {
    const a = await store.createFolder("owner-a", "A", null);
    const b = await store.createFolder("owner-a", "B", a.id);
    await store.createFolder("owner-a", "C", b.id);
    const count = await store.getFolderCount("owner-a", a.id);
    assert.deepEqual(count, { direct: 1, total: 2 });
    await assert.rejects(store.trashItem("owner-a", a.id, 1), /确认数量已变化/);
    await store.trashItem("owner-a", a.id, 2);
    const trashed = await store.listItems("owner-a", { view: "trash" });
    assert.deepEqual(trashed.items.map((item) => item.name), ["A"]);
    await store.restoreItem("owner-a", a.id);
    const root = await store.listItems("owner-a", { view: "files", parentId: null });
    assert.deepEqual(root.items.map((item) => item.name), ["A"]);
  } finally {
    database.close();
  }
});

test("D1 写入失败会清理已经上传的 R2 对象", async () => {
  const { database, objects, store } = await createStore();
  try {
    database.failNextItemInsert = true;
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    await assert.rejects(store.uploadFile("owner-a", null, file), /上传记录保存失败/);
    assert.equal(objects.values.size, 0);
  } finally {
    database.close();
  }
});

test("永久删除同时移除对象和元数据，之后不能读取", async () => {
  const { database, objects, store } = await createStore();
  try {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const uploaded = await store.uploadFile("owner-a", null, file);
    assert.equal(objects.values.size, 1);
    await store.trashItem("owner-a", uploaded.id);
    await store.permanentlyDelete("owner-a", uploaded.id);
    assert.equal(objects.values.size, 0);
    await assert.rejects(store.getFile("owner-a", uploaded.id, false), /文件不存在/);
  } finally {
    database.close();
  }
});
