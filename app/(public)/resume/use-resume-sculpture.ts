"use client";

import { useEffect, useRef } from "react";
import { markResumePrepared } from "./resume-loading";

/** 装饰模块失败也放行正文；卸载时取消迟到的导入与渲染。 */
export function useResumeSculpture() {
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    const root = stage?.closest<HTMLElement>(".resume-page");
    if (!stage || !root) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import("./resume-sculpture-scene").then(({ mountResumeSculpture }) => {
      if (!cancelled) dispose = mountResumeSculpture(stage);
    }).catch(() => {
      if (!cancelled) root.dataset.starfieldUnavailable = "true";
    }).finally(() => {
      if (!cancelled) markResumePrepared(root, "particlesReady");
    });
    return () => {
      cancelled = true;
      dispose?.();
      delete root.dataset.particlesReady;
    };
  }, []);
  return stageRef;
}
