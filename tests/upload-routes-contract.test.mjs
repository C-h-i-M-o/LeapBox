import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("上传路由提供创建、查询、流式分片、完成和取消接口", async () => {
  const [collection, session, part, complete] = await Promise.all([
    source("app/api/uploads/route.ts"),
    source("app/api/uploads/[id]/route.ts"),
    source("app/api/uploads/[id]/parts/[partNumber]/route.ts"),
    source("app/api/uploads/[id]/complete/route.ts"),
  ]);
  assert.match(collection, /uploads\.createSession/u);
  assert.match(session, /uploads\.getSession/u);
  assert.match(session, /uploads\.abortSession/u);
  assert.match(part, /request\.body/u);
  assert.match(part, /content-length/iu);
  assert.doesNotMatch(part, /arrayBuffer\(|formData\(/u);
  assert.match(part, /uploads\.uploadPart/u);
  assert.match(complete, /uploads\.completeSession/u);
  assert.match(complete, /uploads\.completeSession\(user\.userId, id\)/u);
  assert.doesNotMatch(complete, /readJsonRecord|body\.parts|UploadedPart/u);
  await assert.rejects(access(new URL("app/api/upload/route.ts", root)));
});

test("下载路由直接返回 R2 流而不是完整缓冲文件", async () => {
  const content = await source("app/api/items/[id]/content/route.ts");
  assert.match(content, /new Response\(object\.body/u);
});

test("API 上下文同时提供文件和上传服务", async () => {
  const [api, serverFiles] = await Promise.all([
    source("lib/api.ts"),
    source("lib/server-files.ts"),
  ]);
  assert.match(api, /uploads: UploadStore/u);
  assert.match(api, /getFileServices/u);
  assert.match(serverFiles, /new UploadStore/u);
});

test("文件夹树与批量操作路由调用受所有者保护的存储方法", async () => {
  const [folderTrees, batch] = await Promise.all([
    source("app/api/folder-trees/route.ts"),
    source("app/api/items/batch/route.ts"),
  ]);
  assert.match(folderTrees, /store\.createFolderTree\(\s*user\.userId/us);
  assert.match(batch, /store\.batchItems\(user\.userId/u);
  assert.match(batch, /action === "move"/u);
  assert.match(batch, /action === "trash"/u);
  assert.match(batch, /action === "trash-preview"/u);
  assert.match(batch, /action === "restore"/u);
  assert.match(batch, /action === "delete"/u);
});

test("文件列表提供轻量分页接口且首屏声明 5 GB 上限", async () => {
  const [items, bootstrap] = await Promise.all([
    source("app/api/items/route.ts"),
    source("app/api/bootstrap/route.ts"),
  ]);
  assert.match(items, /cursor:\s*url\.searchParams\.get\("cursor"\)/u);
  assert.match(items, /store\.listItems\(user\.userId/u);
  assert.doesNotMatch(items, /getStorageSummary|getFolderOptions/u);
  assert.match(bootstrap, /maxLabel:\s*"5 GB"/u);
});
