import { useEffect, useRef, type RefObject } from "react";
import type gsap from "gsap";
import { markResumePrepared, resumeLoadingEvents, type ResumePreparation } from "./resume-loading.ts";

export type ResumeGsapRuntime = {
  gsap: typeof gsap;
  ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
};

let runtimePromise: Promise<ResumeGsapRuntime> | undefined;

/** 仅在浏览器挂载后调用，避免 Worker 全局作用域启动 GSAP 定时器。 */
export function loadResumeGsap(): Promise<ResumeGsapRuntime> {
  return runtimePromise ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
    .then(([{ default: gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      return { gsap, ScrollTrigger };
    });
}

/** 两组动画仅初始化一次，异步加载完成后仍保持根节点作用域和卸载清理。 */
export function useResumeGsap(
  initialize: (runtime: ResumeGsapRuntime) => void | (() => void),
  { scope, readinessKey }: { scope: RefObject<HTMLElement | null>; readinessKey: ResumePreparation },
): void {
  const initializeRef = useRef(initialize);
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    let disposed = false;
    let initializing = false;
    let context: gsap.Context | undefined;
    const initializeWhenReady = () => {
      if (initializing || root.dataset.assetsReady !== "true") return;
      initializing = true;
      void loadResumeGsap().then((runtime) => {
        if (disposed) return;
        context = runtime.gsap.context(() => initializeRef.current(runtime), scope);
        markResumePrepared(root, readinessKey);
      }).catch(() => {
        if (disposed) return;
        root.dataset.preparationFailed = "true";
        root.dispatchEvent(new Event(resumeLoadingEvents.prepared));
      });
    };
    root.addEventListener(resumeLoadingEvents.assetsReady, initializeWhenReady);
    initializeWhenReady();
    return () => {
      disposed = true;
      root.removeEventListener(resumeLoadingEvents.assetsReady, initializeWhenReady);
      delete root.dataset[readinessKey];
      delete root.dataset.preparationFailed;
      context?.revert();
    };
  }, [scope, readinessKey]);
}
