import assert from "node:assert/strict";
import test from "node:test";
import {
  loadResumeDocument, loadResumeImage, loadResumeVideo, markResumePrepared, resumeLoadingEvents,
  waitForResumePreparation, waitForResumeResource,
} from "../app/(public)/resume/resume-loading.ts";

class TestImage extends EventTarget {
  loading = "lazy";
  complete = false;
  naturalWidth = 0;
  decode = async (): Promise<void> => {};
}

class TestVideo extends EventTarget {
  src = "";
  preload = "none";
  readyState = 0;
  error: MediaError | null = null;
  paused = true;
  querySelector() { return { src: "https://example.test/hero.mp4" }; }
  getAttribute() { return this.src; }
  removeAttribute() { this.src = ""; }
  load() { this.readyState = 0; }
  pause() { this.paused = true; }
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("等待文档及样式加载完成，不能在样式未就绪时展示正文", async () => {
  const page = new EventTarget();
  const document = { readyState: "interactive", querySelectorAll: () => [{ disabled: false, sheet: {} }] };
  let finished = false;
  const pending = loadResumeDocument(document as unknown as Document, page as unknown as Window, new AbortController().signal)
    .then(() => { finished = true; });
  await nextTurn();
  assert.equal(finished, false);
  document.readyState = "complete";
  page.dispatchEvent(new Event("load"));
  await pending;
  assert.equal(finished, true);
});

test("样式加载失败时即使文档 load 已完成也不能放行", async () => {
  const document = { readyState: "complete", querySelectorAll: () => [{ disabled: false, sheet: null }] };
  await assert.rejects(loadResumeDocument(document as unknown as Document, new EventTarget() as unknown as Window, new AbortController().signal), /样式加载失败/u);
});

test("资源未就绪时保持等待，缓存命中则立即完成", async () => {
  const target = new EventTarget();
  const signal = new AbortController().signal;
  let ready = false;
  let finished = false;
  const result = waitForResumeResource(target, ["load"], () => ready, () => false, signal).then(() => { finished = true; });
  target.dispatchEvent(new Event("load"));
  await nextTurn();
  assert.equal(finished, false);
  ready = true;
  target.dispatchEvent(new Event("load"));
  await result;
  assert.equal(finished, true);
  await waitForResumeResource(target, ["load"], () => ready, () => false, signal);
});

test("图片提前加载且必须等解码完成，不能仅凭 load 放行", async () => {
  const image = new TestImage();
  let finishDecode: () => void = () => {};
  image.decode = () => new Promise<void>((resolve) => { finishDecode = resolve; });
  let finished = false;
  const result = loadResumeImage(image as unknown as HTMLImageElement, new AbortController().signal)
    .then(() => { finished = true; });
  assert.equal(image.loading, "eager");
  image.complete = true;
  image.naturalWidth = 1024;
  image.dispatchEvent(new Event("load"));
  await nextTurn();
  assert.equal(finished, false);
  finishDecode();
  await result;
  assert.equal(finished, true);
});

test("损坏的缓存图片或解码错误必须进入失败路径", async () => {
  const image = new TestImage();
  image.complete = true;
  await assert.rejects(loadResumeImage(image as unknown as HTMLImageElement, new AbortController().signal), /资源准备失败/u);
  image.naturalWidth = 1024;
  image.decode = async () => { throw new Error("图片解码失败"); };
  await assert.rejects(loadResumeImage(image as unknown as HTMLImageElement, new AbortController().signal), /图片解码失败/u);
});

test("取消未完成任务和已取消的任务均立即结束等待", async () => {
  const target = new EventTarget();
  const controller = new AbortController();
  const pending = waitForResumeResource(target, ["load"], () => false, () => false, controller.signal);
  controller.abort(new Error("页面已卸载"));
  await assert.rejects(pending, /页面已卸载/u);
  await assert.rejects(waitForResumeResource(target, ["load"], () => true, () => false, controller.signal), /页面已卸载/u);
});

test("三组动画全部准备好才能放行，通知顺序不影响结果", async () => {
  const root = Object.assign(new EventTarget(), { dataset: {} as Record<string, string> });
  const element = root as unknown as HTMLElement;
  markResumePrepared(element, "particlesReady");
  let finished = false;
  const pending = waitForResumePreparation(element, new AbortController().signal).then(() => { finished = true; });
  markResumePrepared(element, "interactionsReady");
  await nextTurn();
  assert.equal(finished, false);
  markResumePrepared(element, "motionReady");
  await pending;
  assert.equal(finished, true);
  await waitForResumePreparation(element, new AbortController().signal);
});

test("动画初始化失败不能当作已准备完成", async () => {
  const root = Object.assign(new EventTarget(), { dataset: {} as Record<string, string> });
  const pending = waitForResumePreparation(root as unknown as HTMLElement, new AbortController().signal);
  root.dataset.preparationFailed = "true";
  root.dispatchEvent(new Event(resumeLoadingEvents.prepared));
  await assert.rejects(pending, /资源准备失败/u);
});

test("视频完整下载并解码首帧后才完成，卸载回收 Blob", async (t) => {
  const video = new TestVideo();
  const cleanups: Array<() => void> = [];
  let finishDownload: (blob: Blob) => void = () => {};
  const response = new Response("完整视频");
  t.mock.method(response, "blob", () => new Promise<Blob>((resolve) => { finishDownload = resolve; }));
  t.mock.method(globalThis, "fetch", async () => response);
  t.mock.method(URL, "createObjectURL", () => "blob:resume-test");
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  let finished = false;
  const pending = loadResumeVideo(video as unknown as HTMLVideoElement, new AbortController().signal, (cleanup) => cleanups.push(cleanup))
    .then(() => { finished = true; });
  await nextTurn();
  video.dispatchEvent(new Event("canplay"));
  assert.equal(video.src, "", "完整下载前不能交给播放器，也不能被 canplay 放行");
  assert.equal(finished, false);
  finishDownload(new Blob(["完整视频"], { type: "video/mp4" }));
  await nextTurn();
  assert.equal(video.src, "blob:resume-test");
  assert.equal(finished, false, "下载结束后还须等待首帧");
  video.readyState = 2;
  video.dispatchEvent(new Event("loadeddata"));
  await pending;
  assert.equal(finished, true);
  assert.equal(video.paused, true, "准备阶段不能启动自动播放");
  cleanups.forEach((cleanup) => cleanup());
  assert.equal(video.src, "");
  assert.equal(revoke.mock.callCount(), 1);
});

test("视频 HTTP 失败及不完整的分段响应均不放行", async (t) => {
  const video = new TestVideo();
  const mockedFetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  const load = () => loadResumeVideo(video as unknown as HTMLVideoElement, new AbortController().signal, () => {});
  await assert.rejects(load(), /视频下载未完成/u);
  mockedFetch.mock.mockImplementation(async () => new Response("片段", { status: 206 }));
  await assert.rejects(load(), /视频下载未完成/u);
  assert.equal(video.src, "");
});

test("视频下载期间卸载，不创建失效的 Blob URL", async (t) => {
  const controller = new AbortController();
  const video = new TestVideo();
  const response = new Response("完整视频");
  let finishDownload: (blob: Blob) => void = () => {};
  t.mock.method(response, "blob", () => new Promise<Blob>((resolve) => { finishDownload = resolve; }));
  t.mock.method(globalThis, "fetch", async () => response);
  const createUrl = t.mock.method(URL, "createObjectURL", () => "blob:resume-test");
  const pending = loadResumeVideo(video as unknown as HTMLVideoElement, controller.signal, () => {});
  await nextTurn();
  controller.abort(new Error("页面已卸载"));
  finishDownload(new Blob(["完整视频"]));
  await assert.rejects(pending, /页面已卸载/u);
  assert.equal(createUrl.mock.callCount(), 0);
});
