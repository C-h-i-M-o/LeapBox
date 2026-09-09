"use client";

import type { RefObject } from "react";
import { useResumeGsap } from "./use-resume-gsap";

export function useResumeInteractions(rootRef: RefObject<HTMLElement | null>): void {
  useResumeGsap(({ gsap, ScrollTrigger }) => {
    const root = rootRef.current;
    if (!root) return;
    const progress = root.querySelector<HTMLElement>("[data-reading-progress]");
    const navLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>("[data-nav-link]"));
    const setProgress = progress ? gsap.quickSetter(progress, "scaleX") : undefined;
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => setProgress?.(self.progress),
      onRefresh: (self) => setProgress?.(self.progress),
    });
    root.querySelectorAll<HTMLElement>("section[id]").forEach((section) => {
      ScrollTrigger.create({
        trigger: section,
        start: "top 40%",
        end: "bottom 40%",
        onToggle: (self) => {
          if (!self.isActive) return;
          navLinks.forEach((link) => {
            if (link.hash === `#${section.id}`) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          });
        },
      });
    });

    const media = gsap.matchMedia();
    media.add("(hover: hover) and (pointer: fine)", () => {
      const removeListeners: Array<() => void> = [];
      const cachedRects = new WeakMap<HTMLElement, DOMRect>();
      let resetActive: (() => void) | undefined;
      root.querySelectorAll<HTMLElement>("[data-tilt], [data-magnetic]").forEach((element) => {
        const magnetic = element.hasAttribute("data-magnetic");
        const xTo = gsap.quickTo(element, magnetic ? "x" : "rotationY", { duration: 0.45, ease: "power3" });
        const yTo = gsap.quickTo(element, magnetic ? "y" : "rotationX", { duration: 0.45, ease: "power3" });
        const enter = () => { cachedRects.set(element, element.getBoundingClientRect()); resetActive = leave; };
        const move = (event: PointerEvent) => {
          const rect = cachedRects.get(element);
          if (!rect) return;
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          xTo((x - 0.5) * (magnetic ? 12 : 9));
          yTo((y - 0.5) * (magnetic ? 10 : -9));
          if (!magnetic) {
            element.style.setProperty("--pointer-x", `${x * 100}%`);
            element.style.setProperty("--pointer-y", `${y * 100}%`);
          }
        };
        const leave = () => { cachedRects.delete(element); xTo(0); yTo(0); if (resetActive === leave) resetActive = undefined; };
        element.addEventListener("pointerenter", enter, { passive: true });
        element.addEventListener("pointermove", move, { passive: true });
        element.addEventListener("pointerleave", leave);
        removeListeners.push(() => {
          element.removeEventListener("pointerenter", enter);
          element.removeEventListener("pointermove", move);
          element.removeEventListener("pointerleave", leave);
          element.style.removeProperty("--pointer-x");
          element.style.removeProperty("--pointer-y");
        });
      });
      // 滚动或窗口尺寸变化后，旧矩形失效；下次进入元素时重新测量。
      const invalidateRects = () => {
        resetActive?.();
      };
      window.addEventListener("resize", invalidateRects, { passive: true });
      window.addEventListener("scroll", invalidateRects, { passive: true });
      removeListeners.push(() => {
        window.removeEventListener("resize", invalidateRects);
        window.removeEventListener("scroll", invalidateRects);
      });
      return () => removeListeners.forEach((remove) => remove());
    });
    // 固定章节、导航与进度条均已注册，集中测量一次布局。
    ScrollTrigger.refresh();
    return () => {
      media.revert();
    };
  }, { scope: rootRef, readinessKey: "interactionsReady" });
}
