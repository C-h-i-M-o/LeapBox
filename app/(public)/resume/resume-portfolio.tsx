"use client";

import { useRef } from "react";

import {
  AboutSection,
  ContactSection,
  HeroSection,
  ProjectsSection,
  ResumeNavigation,
  StrengthsSection,
} from "./resume-sections";
import { useResumeLocale } from "./use-resume-locale.ts";
import { useResumeMotion } from "./use-resume-motion";
import { useResumeInteractions } from "./use-resume-interactions";
import { resumeInteractionContent } from "./resume-interaction-content";
import { ResumeLoader } from "./resume-loader";
import { useResumeLoading } from "./use-resume-loading";

export function ResumePortfolio() {
  const rootRef = useRef<HTMLElement>(null);
  const { locale, content, toggleLocale } = useResumeLocale(rootRef);
  const interaction = resumeInteractionContent[locale];
  const loading = useResumeLoading(rootRef);

  useResumeMotion(rootRef);
  useResumeInteractions(rootRef);

  return (
    <main className="resume-page" ref={rootRef} lang={locale === "zh" ? "zh-CN" : "en"} data-loading-state={loading.state}>
      <ResumeLoader {...loading} locale={locale} />
      <div className="resume-content" style={loading.state === "ready" ? undefined : { visibility: "hidden" }} inert={loading.state !== "ready"} aria-hidden={loading.state !== "ready"} aria-busy={loading.state !== "ready"}>
        <div className="resume-reading-progress" aria-hidden="true"><span data-reading-progress /></div>
        <div className="resume-pointer-light" data-pointer-light aria-hidden="true" />
        <ResumeNavigation content={content} locale={locale} toggleLocale={toggleLocale} />
        <HeroSection content={content} />
        <AboutSection content={content} interaction={interaction} />
        <ProjectsSection content={content} />
        <StrengthsSection content={content} />
        <ContactSection content={content} />
      </div>
    </main>
  );
}
