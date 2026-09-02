import type { ResumeLocale } from "./resume-content.ts";

export type ResumeInteractionContent = {
  aboutLabels: readonly [string, string, string];
  strengthHint: string;
  particleHint: string;
};

export const resumeInteractionContent: Record<ResumeLocale, ResumeInteractionContent> = {
  zh: {
    aboutLabels: ["关于我", "教育经历", "实习经历"],
    strengthHint: "滚动探索，或点击一项能力。",
    particleHint: "移动形成涡流 · 按住聚拢 · 松开释放",
  },
  en: {
    aboutLabels: ["About me", "Education", "Experience"],
    strengthHint: "Scroll to explore, or select a capability.",
    particleHint: "Move to swirl · Hold to gather · Release to scatter",
  },
};
