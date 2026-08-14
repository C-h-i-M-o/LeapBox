import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const drizzleUrl = new URL("../drizzle/", import.meta.url);

async function readInitialMigration() {
  const files = await readdir(drizzleUrl);
  const migrationName = files.find((name) => /^0000_.+\.sql$/u.test(name));
  assert.ok(migrationName, "缺少初始 D1 迁移");
  return readFile(new URL(migrationName, drizzleUrl), "utf8");
}

async function readAllMigrations() {
  const files = (await readdir(drizzleUrl))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();
  assert.ok(files.length > 0, "缺少 D1 迁移");
  return Promise.all(files.map((name) => readFile(new URL(name, drizzleUrl), "utf8")));
}

test("初始迁移能在空 SQLite 数据库完整执行", async () => {
  const sql = (await readInitialMigration()).replaceAll(
    "--> statement-breakpoint",
    "",
  );
  const database = new DatabaseSync(":memory:");
  try {
    assert.doesNotThrow(() => database.exec(sql));
  } finally {
    database.close();
  }
});

test("同目录重名约束同时覆盖根目录和普通文件夹", async () => {
  const sql = (await readInitialMigration()).replaceAll(
    "--> statement-breakpoint",
    "",
  );
  const database = new DatabaseSync(":memory:");
  database.exec(sql);
  const insertUser = database.prepare(
    "insert into users (id, email, created_at, updated_at) values (?, ?, 1, 1)",
  );
  insertUser.run("owner", "owner@example.com");
  const insertItem = database.prepare(`
    insert into items (
      id, owner_id, type, parent_id, name, name_key, object_key, mime_type,
      size_bytes, is_favorite, created_at, updated_at, last_accessed_at
    ) values (?, 'owner', 'folder', ?, ?, ?, null, null, 0, 0, 1, 1, 1)
  `);

  insertItem.run("root-a", null, "文档", "文档");
  assert.throws(
    () => insertItem.run("root-b", null, "文档", "文档"),
    /UNIQUE constraint failed/,
  );
  insertItem.run("parent", null, "项目", "项目");
  insertItem.run("nested-a", "parent", "资料", "资料");
  assert.throws(
    () => insertItem.run("nested-b", "parent", "资料", "资料"),
    /UNIQUE constraint failed/,
  );
  database.close();
});

test("升级迁移创建受约束的 multipart 上传会话表", async () => {
  const migrations = await readAllMigrations();
  const database = new DatabaseSync(":memory:");
  try {
    for (const sql of migrations) {
      database.exec(sql.replaceAll("--> statement-breakpoint", ""));
    }
    const columns = database.prepare("pragma table_info(upload_sessions)").all();
    assert.deepEqual(
      columns.map((column) => column.name),
      [
        "id", "owner_id", "parent_id", "name", "name_key", "relative_path",
        "object_key", "r2_upload_id", "mime_type", "size_bytes",
        "part_size_bytes", "status", "created_at", "updated_at", "expires_at",
        "item_id", "completed_at",
      ],
    );
    const itemIdIndex = database
      .prepare("select sql from sqlite_master where type = 'index' and name = 'idx_upload_sessions_item_id'")
      .get();
    assert.match(itemIdIndex?.sql ?? "", /create unique index.+item_id.+where.+item_id.+is not null/isu);
    const tableSql = database
      .prepare("select sql from sqlite_master where type = 'table' and name = 'upload_sessions'")
      .get().sql;
    assert.match(tableSql, /status.+active.+completing.+completed.+aborted/is);
    assert.match(tableSql, /size_bytes.+5368709120/is);
    const partColumns = database.prepare("pragma table_info(upload_parts)").all();
    assert.deepEqual(
      partColumns.map((column) => column.name),
      ["session_id", "part_number", "etag", "size_bytes", "uploaded_at"],
    );
    const foreignKeys = database.prepare("pragma foreign_key_list(upload_parts)").all();
    assert.equal(foreignKeys[0]?.table, "upload_sessions");
    assert.equal(String(foreignKeys[0]?.on_delete).toLocaleLowerCase(), "cascade");
  } finally {
    database.close();
  }
});
