"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  resumeContent,
  type ResumeContent,
  type ResumeLocale,
} from "./resume-content.ts";

export const RESUME_LOCALE_STORAGE_KEY = "resume-locale";
const RESUME_LOCALE_CHANGE_EVENT = "resume-locale-change";

export function normalizeResumeLocale(value: string | null): ResumeLocale {
  return value === "en" ? "en" : "zh";
}

export function getResumeDocumentLanguage(locale: ResumeLocale): "zh-CN" | "en" {
  return locale === "en" ? "en" : "zh-CN";
}

function subscribeResumeLocale(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(RESUME_LOCALE_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(RESUME_LOCALE_CHANGE_EVENT, onStoreChange);
  };
}

function getClientResumeLocale(): ResumeLocale {
  return normalizeResumeLocale(window.localStorage.getItem(RESUME_LOCALE_STORAGE_KEY));
}

function getServerResumeLocale(): ResumeLocale {
  return "zh";
}

export function useResumeLocale(): {
  locale: ResumeLocale;
  setLocale: (locale: ResumeLocale) => void;
  toggleLocale: () => void;
  content: ResumeContent;
} {
  const locale = useSyncExternalStore(
    subscribeResumeLocale,
    getClientResumeLocale,
    getServerResumeLocale,
  );

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = getResumeDocumentLanguage(locale);

    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, [locale]);

  const setLocale = (nextLocale: ResumeLocale) => {
    window.localStorage.setItem(RESUME_LOCALE_STORAGE_KEY, nextLocale);
    window.dispatchEvent(new Event(RESUME_LOCALE_CHANGE_EVENT));
  };

  const toggleLocale = () => setLocale(locale === "zh" ? "en" : "zh");

  const content = useMemo(() => resumeContent[locale], [locale]);

  return { locale, setLocale, toggleLocale, content };
}
