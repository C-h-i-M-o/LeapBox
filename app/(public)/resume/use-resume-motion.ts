"use client";

import type { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";
import { useResumeGsap } from "./use-resume-gsap";

export function useResumeMotion(
  rootRef: RefObject<HTMLElement | null>,
): void {
  useResumeGsap(
    ({ gsap }) => {
      const root = rootRef.current;
      if (!root) return;
      const aboutButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-about-select]"));
      const strengthButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-strength-select]"));
      let aboutTrigger: ScrollTrigger | undefined;
      let strengthTrigger: ScrollTrigger | undefined;
      const markSelected = (buttons: HTMLButtonElement[], active: number) => {
        if (buttons[active]?.getAttribute("aria-pressed") === "true") return;
        buttons.forEach((button, index) => button.setAttribute("aria-pressed", String(index === active)));
      };
      const navigateStage = (trigger: ScrollTrigger | undefined, nodes: Element[], index: number, progress: number) => {
        if (trigger) window.scrollTo({ top: trigger.start + (trigger.end - trigger.start) * progress, behavior: "smooth" });
        else nodes[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      const click = (event: MouseEvent) => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button");
        if (!button || !root.contains(button)) return;
        if (button.dataset.aboutSelect !== undefined) {
          const index = Number(button.dataset.aboutSelect);
          markSelected(aboutButtons, index);
          navigateStage(aboutTrigger, Array.from(root.querySelectorAll("[data-about-panel]")), index, [0.05, 0.47, 0.9][index]);
        } else if (button.dataset.strengthSelect !== undefined) {
          const index = Number(button.dataset.strengthSelect);
          markSelected(strengthButtons, index);
          navigateStage(strengthTrigger, Array.from(root.querySelectorAll("[data-strength-item]")), index, [0, 0.3, 0.65, 1][index]);
        }
      };
      root.addEventListener("click", click);
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
            onUpdate: (self) => markSelected(aboutButtons, self.progress < 0.33 ? 0 : self.progress < 0.69 ? 1 : 2),
          },
          defaults: { ease: "none" },
        });
        aboutTrigger = aboutTimeline.scrollTrigger;

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
            onUpdate: (self) => markSelected(strengthButtons, self.progress < 0.2 ? 0 : self.progress < 0.54 ? 1 : self.progress < 0.88 ? 2 : 3),
          },
          defaults: { ease: "none" },
        });
        strengthTrigger = strengthsTimeline.scrollTrigger;

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
          aboutTrigger = undefined;
          strengthTrigger = undefined;
        };
      });

      // 入场只播放一次，用独立属性叠加，保留原有滚动与语言动画。
      root.querySelectorAll<HTMLElement>("[data-enter-group]").forEach((group) => {
        const items = Array.from(group.querySelectorAll<HTMLElement>("[data-enter-item]"));
        if (group.getBoundingClientRect().bottom <= 0) return;
        gsap.fromTo(items, { "--enter-opacity": 0, "--enter-y": "22px" }, {
          "--enter-opacity": 1,
          "--enter-y": "0px",
          duration: 0.7,
          stagger: 0.08,
          ease: "power3.out",
          clearProps: "--enter-opacity,--enter-y",
          scrollTrigger: { trigger: group, start: "clamp(top 88%)", once: true },
        });
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
        .from("[data-contact-reveal]", { autoAlpha: 0, y: 28, stagger: 0.12 }, "<0.1")
        .fromTo("[data-contact-action]", { "--enter-opacity": 0, "--enter-y": "16px" }, {
          "--enter-opacity": 1, "--enter-y": "0px", duration: 0.65, stagger: 0.1,
          clearProps: "--enter-opacity,--enter-y",
        }, "<0.14");

      return () => {
        root.removeEventListener("click", click);
        media.revert();
      };
    },
    { scope: rootRef },
  );
}
