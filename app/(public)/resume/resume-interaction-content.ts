import type { ResumeLocale } from "./resume-content.ts";

export type ResumeInteractionContent = {
  aboutLabels: readonly [string, string, string];
};

export const resumeInteractionContent: Record<ResumeLocale, ResumeInteractionContent> = {
  zh: {
    aboutLabels: ["关于我", "教育经历", "实习经历"],
  },
  en: {
    aboutLabels: ["About me", "Education", "Experience"],
  },
};
