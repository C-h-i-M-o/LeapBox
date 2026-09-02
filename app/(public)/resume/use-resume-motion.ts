"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

import type { ResumeLocale } from "./resume-content.ts";
import { getAwardRingRotation } from "./resume-motion-model.ts";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function useResumeMotion(
  rootRef: RefObject<HTMLElement | null>,
  locale: ResumeLocale,
): void {
  useGSAP(
    () => {
      const heroIntro = gsap.timeline({
        defaults: { duration: 0.9, ease: "power3.out" },
      });

      heroIntro
        .from("[data-hero-reveal]", { autoAlpha: 0, y: 24, stagger: 0.1 })
        .from("[data-hero-line]", { autoAlpha: 0, yPercent: 110, stagger: 0.12 }, "<0.08");

      const media = gsap.matchMedia();

      media.add("(min-width: 1181px)", () => {
        const aboutPanels = gsap.utils.toArray<HTMLElement>("[data-about-panel]");
        gsap.set(aboutPanels.slice(1), { autoAlpha: 0, y: 38 });

        const aboutTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: "[data-about-stage]",
            start: "top top",
            end: () => `+=${window.innerHeight * 2.4}`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
          defaults: { ease: "none" },
        });

        aboutTimeline
          .to("[data-about-portrait] img", { scale: 1.08, yPercent: -3, duration: 1 }, 0)
          .to("[data-about-scan]", { yPercent: 780, duration: 1 }, 0);

        aboutPanels.slice(1).forEach((panel, index) => {
          const previousPanel = aboutPanels[index];
          const position = 0.22 + index * 0.36;
          aboutTimeline
            .to(previousPanel, { autoAlpha: 0, y: -30, duration: 0.12 }, position)
            .fromTo(
              panel,
              { autoAlpha: 0, y: 38 },
              { autoAlpha: 1, y: 0, duration: 0.14, immediateRender: false },
              position + 0.04,
            );
        });

        const awardsStage = document.querySelector<HTMLElement>("[data-awards-stage]");
        const awardsRing = document.querySelector<HTMLElement>("[data-awards-ring]");
        const awardItems = gsap.utils.toArray<HTMLElement>("[data-award-item]");
        const removeAwardListeners: Array<() => void> = [];

        if (awardsStage && awardsRing && awardItems.length > 0) {
          const ringRadius = Math.min(310, Math.max(220, window.innerHeight * 0.28));
          awardItems.forEach((item, index) => {
            const rotation = getAwardRingRotation(index, awardItems.length);
            gsap.set(item, {
              transform: `rotateX(${rotation}deg) translateZ(${ringRadius}px)`,
            });
          });

          const ringTween = gsap.to(awardsRing, {
            rotationX: "-=360",
            duration: 34,
            ease: "none",
            repeat: -1,
            paused: true,
          });
          let ringIsVisible = false;

          const awardsTimeline = gsap.timeline({
            scrollTrigger: {
              trigger: awardsStage,
              start: "top top",
              end: () => `+=${window.innerHeight * 1.6}`,
              pin: true,
              scrub: 1,
              anticipatePin: 1,
              invalidateOnRefresh: true,
              onEnter: () => {
                ringIsVisible = true;
                ringTween.play();
              },
              onLeave: () => {
                ringIsVisible = false;
                ringTween.pause();
              },
              onEnterBack: () => {
                ringIsVisible = true;
                ringTween.play();
              },
              onLeaveBack: () => {
                ringIsVisible = false;
                ringTween.pause();
              },
            },
            defaults: { ease: "none" },
          });

          awardsTimeline
            .fromTo(
              "[data-awards-viewport]",
              { autoAlpha: 0.45, scale: 0.88 },
              { autoAlpha: 1, scale: 1, duration: 0.45 },
              0,
            )
            .to("[data-awards-viewport]", { scale: 0.94, duration: 0.35 }, 0.65);

          const pauseRing = () => ringTween.pause();
          const resumeRing = () => {
            if (ringIsVisible) {
              ringTween.play();
            }
          };

          awardItems.forEach((item) => {
            item.addEventListener("pointerenter", pauseRing);
            item.addEventListener("pointerleave", resumeRing);
            item.addEventListener("focusin", pauseRing);
            item.addEventListener("focusout", resumeRing);
            removeAwardListeners.push(() => {
              item.removeEventListener("pointerenter", pauseRing);
              item.removeEventListener("pointerleave", resumeRing);
              item.removeEventListener("focusin", pauseRing);
              item.removeEventListener("focusout", resumeRing);
            });
          });
        }

        gsap.utils.toArray<HTMLElement>("[data-project-card]").forEach((card) => {
          const image = card.querySelector<HTMLElement>("[data-project-image] img");
          const copy = card.querySelector<HTMLElement>("[data-project-copy]");

          if (image) {
            gsap.fromTo(
              image,
              { scale: 1.04, yPercent: -3 },
              {
                scale: 1.11,
                yPercent: 4,
                ease: "none",
                scrollTrigger: {
                  trigger: card,
                  start: "top bottom",
                  end: "bottom top",
                  scrub: 0.8,
                },
              },
            );
          }

          if (copy) {
            gsap.fromTo(
              copy,
              { autoAlpha: 0.58, y: 36 },
              {
                autoAlpha: 1,
                y: 0,
                ease: "none",
                scrollTrigger: {
                  trigger: card,
                  start: "top 78%",
                  end: "top 24%",
                  scrub: 0.7,
                },
              },
            );
          }
        });

        const strengthItems = gsap.utils.toArray<HTMLElement>("[data-strength-item]");
        const strengthGlow = gsap.utils.toArray<HTMLElement>("[data-strength-glow]")[0];
        gsap.set(strengthItems.slice(1), { autoAlpha: 0.24, scale: 0.96 });
        if (strengthGlow) {
          gsap.set(strengthGlow, { autoAlpha: 0.78, y: 0 });
        }

        const strengthsTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: "[data-strengths-stage]",
            start: "top top",
            end: () => `+=${window.innerHeight * 2.2}`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
          defaults: { ease: "none" },
        });

        strengthItems.slice(1).forEach((item, index) => {
          const previousItem = strengthItems[index];
          const position = index * 0.33;
          strengthsTimeline
            .to(previousItem, { autoAlpha: 0.24, scale: 0.96, duration: 0.14 }, position)
            .to(item, { autoAlpha: 1, scale: 1, duration: 0.18 }, position + 0.1);

          if (strengthGlow) {
            strengthsTimeline.to(
              strengthGlow,
              {
                y: () => item.offsetTop - strengthItems[0].offsetTop,
                duration: 0.2,
              },
              position + 0.08,
            );
          }
        });

        return () => {
          removeAwardListeners.forEach((removeListener) => removeListener());
        };
      });

      const contactTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: "#contact",
          start: "top 72%",
          toggleActions: "play none none none",
          once: true,
        },
        defaults: { duration: 0.95, ease: "power3.out" },
      });

      contactTimeline
        .from("[data-contact-title] > span", { autoAlpha: 0, yPercent: 105, stagger: 0.12 })
        .from("[data-contact-reveal]", { autoAlpha: 0, y: 28, stagger: 0.12 }, "<0.1");

      ScrollTrigger.refresh();

      return () => media.revert();
    },
    { scope: rootRef, dependencies: [locale], revertOnUpdate: true },
  );
}
