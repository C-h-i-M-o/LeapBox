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
