import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/", authenticated = true) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${pathname}-${authenticated}`,
  );
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
    new Request(new URL(pathname, "http://localhost"), {
      headers,
      redirect: "manual",
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("根路由保持空白且不触发登录", async () => {
  const response = await render("/", false);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  const html = await response.text();
  assert.match(html, /<title>liuyilun\.com\.cn<\/title>/iu);
  assert.doesNotMatch(html, /跃匣 LeapBox|个人展示页建设中|我的文件/u);
});

test("公开 resume 路由允许匿名访问占位页", async () => {
  const response = await render("/resume", false);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  const html = await response.text();
  assert.match(html, /<title>个人展示页 · liuyilun\.com\.cn<\/title>/iu);
  assert.match(html, /个人展示页建设中/u);
  assert.doesNotMatch(html, /owner@example\.com|跃匣主人/u);
});

test("未登录访问 LeapBox 会进入 Sites 的 ChatGPT 登录流程", async () => {
  const response = await render("/leapbox", false);
  assert.ok(response.status >= 300 && response.status < 400);
  assert.equal(
    response.headers.get("location"),
    "/signin-with-chatgpt?return_to=%2Fleapbox",
  );
});

test("已登录访问 LeapBox 直接呈现完整文件管理功能", async () => {
  const response = await render("/leapbox", true);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/iu);
  const html = await response.text();
  assert.match(html, /<title>跃匣 LeapBox · 私人文件管理<\/title>/iu);
  assert.match(html, /我的文件/);
  assert.match(html, /最近使用/);
  assert.match(html, /收藏/);
  assert.match(html, /回收站/);
  assert.match(html, /新建文件夹/);
  assert.match(html, />↑ 上传<\/button>/);
  assert.doesNotMatch(html, /上传文件|上传文件夹/);
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
  assert.match(css, /\.unified-upload-button/u);
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
  assert.match(component, /await startUpload\(ready\);\s*await loadData/u);
  assert.match(component, /setTimeout\([^]*?250/u);
  assert.match(component, /useGSAP/u);
  assert.match(component, /gsap\.matchMedia/u);
});

test("统一上传对话框支持多文件与文件夹且使用产品状态文案", async () => {
  const component = await readFile(
    new URL("../app/components/FileManager.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /type:\s*"upload"/u);
  assert.match(component, /选择文件/u);
  assert.match(component, /选择文件夹/u);
  assert.match(component, /type="file"\s+multiple/u);
  assert.match(component, /webkitdirectory/u);
  assert.doesNotMatch(component, /选择多个文件|分片上传中/u);
  assert.doesNotMatch(component, /folder-upload-button|desktop-upload-label/u);
  assert.match(component, /folderPickerSupported\s*&&/u);
  assert.match(component, /directoryMapped/u);
  assert.match(component, /rootParentId/u);
  assert.doesNotMatch(component, /onClick=\{chooseFiles\}>上传文件|onClick=\{chooseFolder\}>上传文件夹/u);
});

test("上传路径记录匿名阶段耗时而不记录文件信息", async () => {
  const [manager, client] = await Promise.all([
    readFile(new URL("../app/components/FileManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/upload-client.ts", import.meta.url), "utf8"),
  ]);
  const source = `${manager}\n${client}`;
  for (const phase of [
    "selection_received",
    "queue_visible",
    "session_request_started",
    "session_ready",
    "first_part_dispatched",
    "last_part_confirmed",
    "finalize_completed",
  ]) {
    assert.match(source, new RegExp(phase, "u"));
  }
  assert.doesNotMatch(source, /performance\.mark\([^\n]*(?:file\.name|relativePath|parentId)/u);
});

test("表格操作列共享列定义且手机操作保持单行", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/components/FileManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/file-manager.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /className="actions-heading"/u);
  assert.match(css, /--file-columns:/u);
  assert.match(css, /@media \(max-width:\s*1099px\)/u);
  assert.match(css, /grid-template-columns:\s*var\(--file-columns\)/u);
  assert.match(css, /\.actions-heading[^}]*justify-self:\s*end/isu);
  assert.match(css, /@media \(max-width:\s*760px\)[^]*?\.row-actions\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:/isu);
  assert.doesNotMatch(css, /@media \(max-width:\s*760px\)[^]*?\.row-actions\s*\{[^}]*flex-wrap:\s*wrap/isu);
  assert.doesNotMatch(css, /\.file-row\s*>\s*span\[role="cell"\]\s*\{\s*display:\s*none/isu);
});

test("明显 GSAP 动效使用时间线、回弹与 React 安全上下文", async () => {
  const component = await readFile(
    new URL("../app/components/FileManager.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /gsap\.timeline/u);
  assert.match(component, /back\.out/u);
  assert.match(component, /contextSafe/u);
  assert.match(component, /data-animate-logo/u);
  assert.match(component, /animateLogoHover/u);
  assert.match(component, /<Image[^>]*unoptimized/u);
  assert.match(component, /data-upload-trigger/u);
  assert.match(component, /prefers-reduced-motion:\s*reduce/u);
});
