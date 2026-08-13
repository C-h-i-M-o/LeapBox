import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(authenticated = true) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${authenticated}`);
  const { default: worker } = await import(workerUrl.href);
  const headers = new Headers({ accept: "text/html" });
  if (authenticated) {
    headers.set("oai-authenticated-user-id", "owner-test");
    headers.set("oai-authenticated-user-email", "owner@example.com");
    headers.set(
      "oai-authenticated-user-full-name",
      encodeURIComponent("跃匣主人"),
    );
    headers.set(
      "oai-authenticated-user-full-name-encoding",
      "percent-encoded-utf-8",
    );
  }
  return worker.fetch(
    new Request("http://localhost/", { headers, redirect: "manual" }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("未登录访问会进入 Sites 的 ChatGPT 登录流程", async () => {
  const response = await render(false);
  assert.ok(response.status >= 300 && response.status < 400);
  assert.match(response.headers.get("location") ?? "", /^\/signin-with-chatgpt\?/u);
});

test("已登录首屏直接呈现完整文件管理功能", async () => {
  const response = await render(true);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/iu);
  const html = await response.text();
  assert.match(html, /<title>跃匣 LeapBox · 私人文件管理<\/title>/iu);
  assert.match(html, /我的文件/);
  assert.match(html, /最近使用/);
  assert.match(html, /收藏/);
  assert.match(html, /回收站/);
  assert.match(html, /新建文件夹/);
  assert.match(html, /上传文件/);
  assert.match(html, /搜索文件/);
  assert.match(html, /跃匣主人/);
  assert.match(html, /跃匣 LeapBox/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/iu);
});

test("成品移除一次性预览骨架与依赖", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /_sites-preview|codex-preview|SkeletonPreview/iu);
  assert.doesNotMatch(layout, /Starter Project|next\/font\/google/iu);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/iu);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await assert.doesNotReject(access(new URL("../app/components/FileManager.tsx", import.meta.url)));
  await assert.doesNotReject(access(new URL("../app/components/file-manager.css", import.meta.url)));
});

test("文件管理器包含移动端、文件夹上传、分片续传和对话框语义", async () => {
  const [component, uploadClient, css] = await Promise.all([
    readFile(new URL("../app/components/FileManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/upload-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/file-manager.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /onDrop=/u);
  assert.match(component, /webkitdirectory/u);
  assert.match(component, /\/api\/folder-trees/u);
  assert.match(uploadClient, /file\.slice\(/u);
  assert.match(uploadClient, /\/api\/uploads/u);
  assert.match(uploadClient, /indexedDB/u);
  assert.match(uploadClient, /MAX_ACTIVE_PARTS\s*=\s*3/u);
  assert.doesNotMatch(uploadClient, /formData\(|arrayBuffer\(/u);
  assert.match(component, /<dialog/u);
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /aria-label="搜索文件"/u);
  assert.match(css, /@media \(max-width: 760px\)/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /prefers-reduced-motion/u);
  assert.match(css, /\.mobile-upload-label/u);
  assert.doesNotMatch(
    css,
    /\.top-actions \.primary-button \{[^}]*color:\s*transparent/isu,
  );
  assert.doesNotMatch(
    css,
    /\.view-tools select \{[^}]*color:\s*transparent/isu,
  );
});

test("文件管理器支持多选批处理、轻量分页和 GSAP 减少动态效果", async () => {
  const component = await readFile(
    new URL("../app/components/FileManager.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /selectedIds/u);
  assert.match(component, /shiftKey/u);
  assert.match(component, /\/api\/items\/batch/u);
  assert.match(component, /nextCursor/u);
  assert.match(component, /AbortController/u);
  assert.match(component, /setTimeout\([^]*?250/u);
  assert.match(component, /useGSAP/u);
  assert.match(component, /gsap\.matchMedia/u);
});
