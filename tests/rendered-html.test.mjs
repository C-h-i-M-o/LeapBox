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

test("公开 resume 路由匿名呈现 AI 开发者作品集", async () => {
  const response = await render("/resume", false);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  const html = await response.text();
  assert.match(html, /<title>刘逸伦 · AI 开发者<\/title>/iu);
  assert.match(html, /AI 开发者/u);
  assert.match(html, /<img\b[^>]*src="\/resume\/personal-mark-128-v1\.png"/u);
  assert.match(html, /<link\b(?=[^>]*rel="icon")(?=[^>]*href="\/resume\/favicon-32-v1\.png")[^>]*>/u);
  for (const file of ["personal-mark-128-v1.png", "favicon-32-v1.png", "favicon-64-v1.png"]) {
    await access(new URL(`../public/resume/${file}`, import.meta.url));
  }
  assert.match(html, /EvalSpark/u);
  assert.match(html, /切换为英文|Switch to English/u);
  assert.match(html, /liuyilun0603@163\.com/u);
  assert.match(html, /github\.com\/C-h-i-M-o/u);
  assert.doesNotMatch(html, /owner@example\.com|跃匣主人/u);
  assert.doesNotMatch(html, /15235577669/u);
  assert.doesNotMatch(html, /个人展示页建设中/u);
  assert.doesNotMatch(html, /移动光标，探索另一面|Move your cursor to explore another angle|resume-project-hint/u);
  assert.doesNotMatch(html, />\s*P\s*\/\s*0[1-3]\s*</u, "项目封面不显示用户已移除的序号");
});

test("resume 页面保持双语数据、UI 与 GSAP 行为分层", async () => {
  const [page, portfolio, sections, localeHook, motionHook, css] = await Promise.all([
    readFile(new URL("../app/(public)/resume/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(public)/resume/resume-portfolio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(public)/resume/resume-sections.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(public)/resume/use-resume-locale.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(public)/resume/use-resume-motion.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(public)/resume/resume.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /ResumePortfolio/u);
  assert.match(portfolio, /useResumeLocale/u);
  assert.match(portfolio, /useResumeMotion/u);
  for (const id of ["about", "work", "strengths", "contact"]) {
    assert.match(sections, new RegExp(`id=["']${id}["']`, "u"));
  }
  assert.match(localeHook, /localStorage/u);
  assert.match(motionHook, /useResumeGsap/u);
  assert.match(motionHook, /gsap\.timeline/u);
  assert.match(motionHook, /ScrollTrigger/u);
  assert.match(motionHook, /scrub:/u);
  assert.doesNotMatch(`${motionHook}\n${css}`, /prefers-reduced-motion/u);
  assert.match(css, /--resume-max-width:\s*1700px/u);
  assert.doesNotMatch(sections, /resume-hero-cta/u);
  assert.doesNotMatch(motionHook, /const heroTimeline/u);
  assert.match(
    css,
    /\.resume-hero h1 > span\s*\{[^}]*overflow:\s*visible;/su,
    "首屏标题的动画元素不能裁切自身文字",
  );
});

test("resume 首屏封面优先，视频与非首屏图片不在解析 HTML 时抢先加载", async () => {
  const response = await render("/resume", false);
  const html = await response.text();
  const images = html.match(/<img\b[^>]*>/gu) ?? [];
  const belowFold = images.filter((image) => /portrait-line|project-/u.test(image));
  assert.equal(belowFold.length, 4);
  for (const image of belowFold) {
    assert.match(image, /loading="lazy"/u);
    assert.match(image, /decoding="async"/u);
    assert.match(image, /width="\d+"/u);
    assert.match(image, /height="\d+"/u);
  }
  assert.match(html, /<link\b(?=[^>]*href="\/resume\/hero-poster\.jpg")(?=[^>]*fetchPriority="high")[^>]*>/iu);
  const video = html.match(/<video\b[^>]*>/u)?.[0] ?? "";
  assert.match(video, /preload="none"/u);
  assert.doesNotMatch(video, /autoplay/iu);
});

test("resume 服务端首帧带加载界面，正文不可见且不可聚焦", async () => {
  const response = await render("/resume", false);
  const html = await response.text();
  assert.match(html, /<main\b[^>]*data-loading-state="loading"/u);
  assert.match(html, /data-resume-loader/u);
  assert.match(html, /<div\b(?=[^>]*class="resume-content")(?=[^>]*inert="")(?=[^>]*aria-hidden="true")(?=[^>]*aria-busy="true")[^>]*>/u);
  assert.match(html, /<div\b(?=[^>]*class="resume-content")(?=[^>]*style="visibility:hidden")[^>]*>/u, "样式文件尚未抵达时也不能闪现正文");
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="0"/u);
  assert.match(html, /精彩，即将呈现/u);
  assert.match(html, /<noscript>/u);
  const css = await readFile(new URL("../app/(public)/resume/resume-loading.css", import.meta.url), "utf8");
  assert.match(css, /visibility:\s*hidden\s*!important/u);
  assert.match(css, /animation-play-state:\s*paused\s*!important/u);
  assert.match(css, /overflow:\s*hidden/u);
});

test("resume 仅保留共享粒子标题，撤回电影叙事、项目探照和能力流程", async () => {
  const response = await render("/resume", false);
  const html = await response.text();
  const page = html.slice(0, html.indexOf("</main>"));
  assert.doesNotMatch(page, /data-lens-toggle|data-flow-panel|data-story-canvas|data-flow-replay|data-cinema-heading/u);
  const title = page.match(/<h1\b[\s\S]*?<\/h1>/u)?.[0] ?? "";
  assert.match(title, /resume-particle-seed/u, "脚本启动前仍以散点进入");
  assert.match(title, /resume-particle-fallback/u, "Canvas 不可用时仍有语义文本");
  assert.equal((title.match(/<canvas\b/gu) ?? []).length, 1, "两行粒子必须共用一个画布，跨行交互不裁切");
  assert.equal((title.match(/class="resume-particle-line"/gu) ?? []).length, 2, "共享画布仍保留两行文字的语义与排版");
  assert.doesNotMatch(page, /(?:id="awards"|>\s*P\s*\/\s*0[1-3]\s*<)/u);
});

test("resume 奖项在经历区完整展示，导航与页面均不再包含独立荣誉区", async () => {
  const response = await render("/resume", false);
  const html = await response.text();
  const about = html.match(/<section\b[^>]*\bid="about"[^>]*>[\s\S]*?<\/section>/u)?.[0] ?? "";
  for (const award of [
    "CACC 上海市二等奖",
    "东华大学程序设计新人邀请赛银奖",
    "第十六届蓝桥杯上海赛区 C/C++ 程序设计大学 A 组二等奖",
    "东华大学数学竞赛二等奖",
    "金马五校程序设计竞赛铜奖",
    "中国大学生程序设计竞赛（CCPC）上海市赛铜奖",
    "东华大学一等奖学金",
    "东华大学优秀学生干部",
  ]) {
    assert.ok(about.includes(award), `经历区应保留奖项：${award}`);
  }
  assert.match(about, /队长/u);
  assert.match(about, /TypeScript/u);
  assert.doesNotMatch(html, /(?:id="awards"|href="#awards"|暂停旋转|下一项荣誉)/u);

  const [sections, motionHook, css] = await Promise.all([
    readFile(new URL("../app/(public)/resume/resume-sections.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(public)/resume/use-resume-motion.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(public)/resume/resume.css", import.meta.url), "utf8"),
  ]);

  assert.match(sections, /<img className="resume-brand-mark"/u);
  for (const attribute of [
    "data-about-stage",
    "data-tech-track",
    "data-project-card",
    "data-strengths-stage",
    "data-strength-item",
    "data-strength-glow",
  ]) {
    assert.match(sections, new RegExp(attribute, "u"));
  }
  assert.doesNotMatch(sections, /resume-stats|content\.hero\.availability/u);

  assert.doesNotMatch(motionHook, /getScrollInfluencedTimeScale|\.timeScale\(|getVelocity\(/u);
  assert.match(motionHook, /pin:\s*true/u);

  assert.match(css, /\.resume-project-card\s*\{[^}]*position:\s*sticky/isu);
  assert.match(css, /@keyframes\s+resume-tech-forward/u);
  assert.match(css, /@keyframes\s+resume-tech-reverse/u);
  assert.match(css, /scrollbar-width:\s*none/u);
  assert.match(css, /\.resume-strength-glow/u);

  const aboutStageStart = sections.indexOf('data-about-stage');
  const techMarquee = sections.indexOf('className="resume-tech-marquee"');
  const aboutSectionEnd = sections.indexOf('</section>', techMarquee);
  assert.ok(aboutStageStart >= 0 && techMarquee > aboutStageStart);
  assert.ok(aboutSectionEnd > techMarquee);
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
  assert.doesNotMatch(
    packageJson,
    /"(?:dev|build|start)":\s*"WRANGLER_LOG_PATH=/u,
    "npm 脚本需能直接在 Windows 中运行",
  );
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
