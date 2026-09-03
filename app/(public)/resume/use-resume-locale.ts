"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from "react";
import type gsap from "gsap";
import type { ScrollTrigger } from "gsap/ScrollTrigger";
import { loadResumeGsap, type ResumeGsapRuntime } from "./use-resume-gsap.ts";
import { getReadingScrollPosition, resumeMotionEvents } from "./resume-motion-model.ts";

import {
  resumeContent,
  type ResumeContent,
  type ResumeLocale,
} from "./resume-content.ts";

export const RESUME_LOCALE_STORAGE_KEY = "resume-locale";
const RESUME_LOCALE_CHANGE_EVENT = "resume-locale-change";
let memoryLocale: ResumeLocale = "zh";
let storageUnavailable = false;

type ReadingPosition = { section: HTMLElement; progress: number; pin?: ScrollTrigger };

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
  if (storageUnavailable) return memoryLocale;
  try {
    return normalizeResumeLocale(window.localStorage.getItem(RESUME_LOCALE_STORAGE_KEY));
  } catch {
    storageUnavailable = true;
    return memoryLocale;
  }
}

function getServerResumeLocale(): ResumeLocale {
  return "zh";
}

export function useResumeLocale(rootRef: RefObject<HTMLElement | null>): {
  locale: ResumeLocale;
  setLocale: (locale: ResumeLocale) => void;
  toggleLocale: () => void;
  content: ResumeContent;
} {
  const transitionRef = useRef<gsap.core.Tween | null>(null);
  const runtimeRef = useRef<ResumeGsapRuntime | null>(null);
  const lockedRef = useRef(false);
  const readingRef = useRef<ReadingPosition | null>(null);
  const targetsRef = useRef<HTMLElement[]>([]);
  const locale = useSyncExternalStore(
    subscribeResumeLocale,
    getClientResumeLocale,
    getServerResumeLocale,
  );
  const previousLocaleRef = useRef(locale);

  useEffect(() => {
    let disposed = false;
    void loadResumeGsap().then((runtime) => {
      if (!disposed) runtimeRef.current = runtime;
    }).catch(() => { /* 动画不可用时语言切换仍可直接生效。 */ });
    return () => { disposed = true; runtimeRef.current = null; };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const runtime = runtimeRef.current;
    if (!root || !runtime) return;
    const { gsap, ScrollTrigger } = runtime;
    const position = readingRef.current;
    // 节点保持稳定，仅刷新几何尺寸，不销毁并重建固定区间。
    // 首次刷新由最后初始化的交互 Hook 统一完成。
    if (previousLocaleRef.current !== locale) {
      ScrollTrigger.refresh();
      previousLocaleRef.current = locale;
    }
    if (position) {
      const top = position.section.getBoundingClientRect().top + window.scrollY;
      const nextY = position.pin
        ? position.pin.start + (position.pin.end - position.pin.start) * position.progress
        : getReadingScrollPosition(top, position.section.offsetHeight, window.innerHeight, position.progress);
      window.scrollTo({ top: nextY, behavior: "instant" });
      ScrollTrigger.update();
    }
    if (lockedRef.current) {
      transitionRef.current = gsap.to(targetsRef.current, {
        "--locale-opacity": 1, "--locale-offset": "0px", duration: 0.7, stagger: 0.018, ease: "power2.out",
        onComplete: () => {
          gsap.set(targetsRef.current, { clearProps: "--locale-opacity,--locale-offset" });
          delete root.dataset.localeSwitching;
          lockedRef.current = false;
          readingRef.current = null;
        },
      });
    }
  }, [locale, rootRef]);

  useEffect(() => () => { transitionRef.current?.kill(); }, []);

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = getResumeDocumentLanguage(locale);

    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, [locale]);

  const setLocale = (nextLocale: ResumeLocale) => {
    if (lockedRef.current || nextLocale === locale) return;
    const root = rootRef.current;
    const commit = () => {
      memoryLocale = nextLocale;
      try { window.localStorage.setItem(RESUME_LOCALE_STORAGE_KEY, nextLocale); } catch {
        // 部分隐私模式允许读取却禁止写入，后续快照必须改用会话值。
        storageUnavailable = true;
      }
      window.dispatchEvent(new Event(RESUME_LOCALE_CHANGE_EVENT));
    };
    const runtime = runtimeRef.current;
    if (!root || !runtime) { commit(); return; }
    const { gsap, ScrollTrigger } = runtime;
    lockedRef.current = true;
    root.dataset.localeSwitching = "true";
    root.dispatchEvent(new Event(resumeMotionEvents.localeStart));
    const pin = ScrollTrigger.getAll().find((trigger) => trigger.isActive && trigger.vars.pin && root.contains(trigger.trigger ?? null));
    const sections = Array.from(root.querySelectorAll<HTMLElement>("section[id]"));
    const section = sections.findLast((item) => item.getBoundingClientRect().top <= 120) ?? sections[0];
    if (section) {
      const rect = section.getBoundingClientRect();
      readingRef.current = {
        section, pin,
        progress: pin ? pin.progress : Math.max(0, -rect.top) / Math.max(1, section.offsetHeight - window.innerHeight),
      };
    }
    targetsRef.current = Array.from(root.querySelectorAll<HTMLElement>("[data-locale-copy]:not([data-hero-title])")).filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    transitionRef.current = gsap.to(targetsRef.current, {
      "--locale-opacity": 0.12, "--locale-offset": "8px", duration: 0.46, ease: "power2.in", onComplete: commit,
    });
  };

  const toggleLocale = () => setLocale(locale === "zh" ? "en" : "zh");

  const content = useMemo(() => resumeContent[locale], [locale]);

  return { locale, setLocale, toggleLocale, content };
}
