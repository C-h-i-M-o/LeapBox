export type ResumeLoadingState = "loading" | "preparing" | "ready" | "error";

export const resumeLoadingEvents = {
  assetsReady: "resume:assets-ready",
  prepared: "resume:prepared",
  reveal: "resume:reveal",
} as const;

export type ResumePreparation = "motionReady" | "interactionsReady" | "particlesReady";

/** 先监听再检查缓存状态，避免资源在两者之间完成而漏掉通知。 */
export function waitForResumeResource(
  target: EventTarget,
  events: readonly string[],
  isReady: () => boolean,
  hasFailed: () => boolean,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      events.forEach((event) => target.removeEventListener(event, check));
      signal.removeEventListener("abort", abort);
    };
    const abort = () => { cleanup(); reject(signal.reason); };
    const check = () => {
      if (signal.aborted) { abort(); return; }
      if (hasFailed()) { cleanup(); reject(new Error("简历资源准备失败")); }
      else if (isReady()) { cleanup(); resolve(); }
    };
    events.forEach((event) => target.addEventListener(event, check));
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}

export async function loadResumeImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  image.loading = "eager";
  await waitForResumeResource(image, ["load", "error"],
    () => image.complete && image.naturalWidth > 0,
    () => image.complete && image.naturalWidth === 0, signal);
  // load 只代表下载完成；解码结束后才允许移除加载遮挡。
  await image.decode();
  signal.throwIfAborted();
}

export async function loadResumeDocument(document: Document, window: Window, signal: AbortSignal): Promise<void> {
  await waitForResumeResource(window, ["load"], () => document.readyState === "complete", () => false, signal);
  // load 也会在样式下载失败后触发，必须确认实际样式表存在。
  const styles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  if (styles.some((style) => !style.disabled && !style.sheet)) throw new Error("简历样式加载失败");
}

/** 完整读取视频再交给播放器，避免 canplay 在仅缓冲少量内容时提前放行。 */
export async function loadResumeVideo(
  video: HTMLVideoElement,
  signal: AbortSignal,
  registerCleanup: (cleanup: () => void) => void,
): Promise<void> {
  const source = video.querySelector("source")?.src;
  if (!source) throw new Error("简历视频地址缺失");
  const response = await fetch(source, { signal });
  if (!response.ok || response.status === 206) throw new Error("简历视频下载未完成");
  const blob = await response.blob();
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  registerCleanup(() => {
    video.pause();
    if (video.getAttribute("src") === url) {
      video.removeAttribute("src");
      video.load();
    }
    URL.revokeObjectURL(url);
  });
  video.src = url;
  video.preload = "auto";
  video.load();
  await waitForResumeResource(video, ["loadeddata", "canplay", "error"],
    () => video.readyState >= 2, () => video.error !== null, signal);
}

export function markResumePrepared(root: HTMLElement, key: ResumePreparation): void {
  root.dataset[key] = "true";
  root.dispatchEvent(new Event(resumeLoadingEvents.prepared));
}

export function waitForResumePreparation(root: HTMLElement, signal: AbortSignal): Promise<void> {
  return waitForResumeResource(root, [resumeLoadingEvents.prepared],
    () => root.dataset.motionReady === "true"
      && root.dataset.interactionsReady === "true"
      && root.dataset.particlesReady === "true",
    () => root.dataset.preparationFailed === "true", signal);
}

export function retryResumeLoading(): void {
  window.location.reload();
}
