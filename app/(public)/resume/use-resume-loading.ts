"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { loadResumeGsap } from "./use-resume-gsap";
import {
  loadResumeDocument, loadResumeImage, loadResumeVideo, resumeLoadingEvents, retryResumeLoading,
  waitForResumePreparation, type ResumeLoadingState,
} from "./resume-loading";

type LoadingStatus = { state: ResumeLoadingState; progress: number };

export function useResumeLoading(rootRef: RefObject<HTMLElement | null>): LoadingStatus & { retry: () => void } {
  const [status, setStatus] = useState<LoadingStatus>({ state: "loading", progress: 0 });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const controller = new AbortController();
    const { signal } = controller;
    const cleanups: Array<() => void> = [];
    const timeout = window.setTimeout(() => {
      setStatus((current) => ({ ...current, state: "error" }));
      controller.abort(new Error("简历资源加载超时，请重试"));
      cleanups.splice(0).forEach((cleanup) => cleanup());
    }, 90_000);

    const prepare = async () => {
      const images = Array.from(root.querySelectorAll<HTMLImageElement>(".resume-content img"));
      const videos = Array.from(root.querySelectorAll<HTMLVideoElement>(".resume-content video"));
      // 视频封面同时也是 CSS 背景；独立解码，不依赖背景图片的 load 事件。
      const posters = [...new Set(videos.map((video) => video.poster).filter(Boolean))].map((url) => {
        const image = new Image();
        image.src = url;
        return image;
      });
      const tasks: Promise<unknown>[] = [
        ...images.concat(posters).map((image) => loadResumeImage(image, signal)),
        ...videos.map((video) => loadResumeVideo(video, signal, (cleanup) => cleanups.push(cleanup))),
        loadResumeDocument(document, window, signal),
        document.fonts.ready,
        loadResumeGsap(),
      ];
      let completed = 0;
      await Promise.all(tasks.map(async (task) => {
        await task;
        signal.throwIfAborted();
        completed += 1;
        setStatus({ state: "loading", progress: Math.floor(completed / (tasks.length + 1) * 100) });
      }));
      signal.throwIfAborted();
      setStatus((current) => ({ ...current, state: "preparing" }));
      // 注册等待再通知动画，兼容同步初始化与已完成的粒子采样。
      const prepared = waitForResumePreparation(root, signal);
      root.dataset.assetsReady = "true";
      root.dispatchEvent(new Event(resumeLoadingEvents.assetsReady));
      await prepared;
      signal.throwIfAborted();
      window.clearTimeout(timeout);
      setStatus({ state: "ready", progress: 100 });
    };

    void prepare().catch(() => {
      if (signal.aborted) return;
      window.clearTimeout(timeout);
      setStatus((current) => ({ ...current, state: "error" }));
      controller.abort(new Error("简历资源加载失败，请重试"));
      cleanups.splice(0).forEach((cleanup) => cleanup());
    });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      cleanups.splice(0).forEach((cleanup) => cleanup());
      delete root.dataset.assetsReady;
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    // React 已移除正文的隐藏与焦点限制后，才启动视频和粒子动画。
    if (status.state === "ready") rootRef.current?.dispatchEvent(new Event(resumeLoadingEvents.reveal));
  }, [status.state, rootRef]);

  return { ...status, retry: retryResumeLoading };
}
