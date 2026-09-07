"use client";

import { useEffect, useRef } from "react";

// 只延展原 Y/L 标识的厚度，源图标及粒子画布保持独立。
const markOutline = "M21 22H36L61 49L53 58Z M91 22H107L65 65V90H105L93 102H54V61Z";

export function ResumeSculpture() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void import("./resume-sculpture-scene").then(({ mountResumeSculpture }) => {
      if (!cancelled) dispose = mountResumeSculpture(stage);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <div className="resume-sculpture-stage" aria-hidden="true" ref={stageRef}>
      <svg className="resume-sculpture-fallback" viewBox="0 0 128 128" focusable="false">
        <path d={markOutline} fill="#25493e" stroke="#9be4c8" strokeWidth="1.2" />
      </svg>
    </div>
  );
}
