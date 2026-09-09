"use client";

import { useResumeSculpture } from "./use-resume-sculpture";

export function ResumeSculpture() {
  const stageRef = useResumeSculpture();

  return (
    <div className="resume-sculpture-stage" aria-hidden="true" ref={stageRef}>
      <div className="resume-sculpture-fallback" />
    </div>
  );
}
