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

export function ResumePortfolio() {
  const rootRef = useRef<HTMLElement>(null);
  const { locale, content, toggleLocale } = useResumeLocale(rootRef);
  const interaction = resumeInteractionContent[locale];

  useResumeMotion(rootRef);
  useResumeInteractions(rootRef);

  return (
    <main className="resume-page" ref={rootRef} lang={locale === "zh" ? "zh-CN" : "en"}>
      <div className="resume-reading-progress" aria-hidden="true"><span data-reading-progress /></div>
      <div className="resume-pointer-light" data-pointer-light aria-hidden="true" />
      <ResumeNavigation content={content} locale={locale} toggleLocale={toggleLocale} />
      <HeroSection content={content} />
      <AboutSection content={content} interaction={interaction} />
      <ProjectsSection content={content} />
      <StrengthsSection content={content} />
      <ContactSection content={content} />
    </main>
  );
}
