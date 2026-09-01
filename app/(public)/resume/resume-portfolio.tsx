"use client";

import { useRef } from "react";

import {
  AboutSection,
  AwardsSection,
  ContactSection,
  HeroSection,
  ProjectsSection,
  ResumeNavigation,
  StrengthsSection,
} from "./resume-sections";
import { useResumeLocale } from "./use-resume-locale.ts";
import { useResumeMotion } from "./use-resume-motion";

export function ResumePortfolio() {
  const rootRef = useRef<HTMLElement>(null);
  const { locale, content, toggleLocale } = useResumeLocale();

  useResumeMotion(rootRef, locale);

  return (
    <main className="resume-page" ref={rootRef} lang={locale === "zh" ? "zh-CN" : "en"}>
      <ResumeNavigation content={content} locale={locale} toggleLocale={toggleLocale} />
      <HeroSection content={content} />
      <AboutSection content={content} />
      <AwardsSection content={content} />
      <ProjectsSection content={content} />
      <StrengthsSection content={content} />
      <ContactSection content={content} />
    </main>
  );
}
