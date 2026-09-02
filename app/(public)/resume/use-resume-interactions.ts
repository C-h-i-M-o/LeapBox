"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function useResumeInteractions(rootRef: RefObject<HTMLElement | null>): void {
  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const cleanups: Array<() => void> = [];
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

    const video = root.querySelector<HTMLVideoElement>("[data-hero-video]");
    if (video) {
      let inView = true;
      let disposed = false;
      const playing = () => { video.dataset.ready = "true"; };
      const failed = () => { delete video.dataset.ready; };
      const syncVideo = () => {
        if (!inView || document.hidden) video.pause();
        else void video.play().then(() => {
          if (disposed || !inView || document.hidden) video.pause();
        }).catch(() => { /* 自动播放受限时继续显示本地封面。 */ });
      };
      const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncVideo(); });
      video.addEventListener("playing", playing);
      video.addEventListener("error", failed);
      document.addEventListener("visibilitychange", syncVideo);
      observer.observe(video);
      if (!video.paused && video.readyState >= 2) playing();
      cleanups.push(() => {
        disposed = true;
        observer.disconnect();
        video.pause();
        video.removeEventListener("playing", playing);
        video.removeEventListener("error", failed);
        document.removeEventListener("visibilitychange", syncVideo);
      });
    }

    const media = gsap.matchMedia();
    media.add("(hover: hover) and (pointer: fine)", () => {
      const removeListeners: Array<() => void> = [];
      const light = root.querySelector<HTMLElement>("[data-pointer-light]");
      if (light) {
        const xTo = gsap.quickTo(light, "x", { duration: 0.65, ease: "power3" });
        const yTo = gsap.quickTo(light, "y", { duration: 0.65, ease: "power3" });
        const move = (event: PointerEvent) => {
          xTo(event.clientX);
          yTo(event.clientY);
          if (!root.hasAttribute("data-pointer-active")) root.dataset.pointerActive = "true";
        };
        const leave = () => { delete root.dataset.pointerActive; };
        root.addEventListener("pointermove", move, { passive: true });
        root.addEventListener("pointerleave", leave);
        removeListeners.push(() => {
          root.removeEventListener("pointermove", move);
          root.removeEventListener("pointerleave", leave);
          leave();
        });
      }

      root.querySelectorAll<HTMLElement>("[data-tilt], [data-magnetic]").forEach((element) => {
        const magnetic = element.hasAttribute("data-magnetic");
        const xTo = gsap.quickTo(element, magnetic ? "x" : "rotationY", { duration: 0.45, ease: "power3" });
        const yTo = gsap.quickTo(element, magnetic ? "y" : "rotationX", { duration: 0.45, ease: "power3" });
        const move = (event: PointerEvent) => {
          const rect = element.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          xTo((x - 0.5) * (magnetic ? 12 : 9));
          yTo((y - 0.5) * (magnetic ? 10 : -9));
          if (!magnetic) {
            element.style.setProperty("--pointer-x", `${x * 100}%`);
            element.style.setProperty("--pointer-y", `${y * 100}%`);
          }
        };
        const leave = () => { xTo(0); yTo(0); };
        element.addEventListener("pointermove", move, { passive: true });
        element.addEventListener("pointerleave", leave);
        removeListeners.push(() => {
          element.removeEventListener("pointermove", move);
          element.removeEventListener("pointerleave", leave);
          element.style.removeProperty("--pointer-x");
          element.style.removeProperty("--pointer-y");
        });
      });
      return () => removeListeners.forEach((remove) => remove());
    });
    // 固定章节、导航与进度条均已注册，集中测量一次布局。
    ScrollTrigger.refresh();
    return () => {
      media.revert();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, { scope: rootRef });
}
