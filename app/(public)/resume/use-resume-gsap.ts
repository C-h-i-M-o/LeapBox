import { useEffect, useRef, type RefObject } from "react";
import type gsap from "gsap";

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
  { scope }: { scope: RefObject<HTMLElement | null> },
): void {
  const initializeRef = useRef(initialize);
  useEffect(() => {
    let disposed = false;
    let context: gsap.Context | undefined;
    void loadResumeGsap().then((runtime) => {
      if (disposed || !scope.current) return;
      context = runtime.gsap.context(() => initializeRef.current(runtime), scope);
    }).catch(() => { /* 动画库加载失败时保留可阅读的静态简历。 */ });
    return () => {
      disposed = true;
      context?.revert();
    };
  }, [scope]);
}
