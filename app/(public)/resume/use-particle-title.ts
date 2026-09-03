"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { getParticleRelease, getParticleScatter, getVortexOffset, resumeMotionEvents } from "./resume-motion-model.ts";
import { createParticleLoop } from "./particle-frame-loop.ts";
import { markResumePrepared, resumeLoadingEvents } from "./resume-loading";

type Particle = {
  x: number; y: number; tx: number; ty: number; sx: number; sy: number;
  vx: number; vy: number; seed: number; alpha: number; tone: number;
};

/** 引擎跨语言切换保留，重采样从当前坐标继续，不重新显示完整文本。 */
export function useParticleTitle(lines: readonly string[]) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef(lines);
  const buildRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    textRef.current = lines;
    buildRef.current?.();
  }, [lines]);

  useEffect(() => {
    const title = titleRef.current;
    const root = title?.closest<HTMLElement>(".resume-page");
    if (!title || !root) return;
    const canvas = title.querySelector("canvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      title.dataset.particleFailed = "true";
      markResumePrepared(root, "particlesReady");
      return;
    }
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let started = 0;
    let ready = false;
    let resizeFrame = 0;
    let visible = false;
    let buildId = 0;
    let disposed = false;
    let dispersing = false;
    const pointer = { active: false, held: false, x: 0, y: 0 };

    const render = (now: number, dt: number): boolean => {
      if (!visible || document.hidden || disposed || !particles.length || root.dataset.loadingState !== "ready") return false;
      if (!started) started = now;
      ctx.clearRect(0, 0, width, height);
      const age = now - started;
      const damping = 0.79 ** dt;
      const radiusSquared = (pointer.held ? 320 : 135) ** 2;
      let moving = age < (dispersing ? 490 : 1180);
      let tone = -1;
      particles.forEach((particle) => {
        if (particle.tone !== tone) {
          tone = particle.tone;
          ctx.fillStyle = tone === 0 ? "#eeeade" : "#83e8c4";
        }
        const t = Math.max(0, Math.min(1, (age - particle.seed * 130) / (dispersing ? 360 : 1050)));
        const ease = 1 - (1 - t) ** 3;
        let x = particle.sx + (particle.tx - particle.sx) * ease;
        let y = particle.sy + (particle.ty - particle.sy) * ease;
        if (pointer.active && !dispersing) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          if (dx * dx + dy * dy < radiusSquared) {
            const force = getVortexOffset(dx, dy, pointer.held);
            x += force.x;
            y += force.y;
          }
        }
        particle.vx = (particle.vx + (x - particle.x) * 0.045 * dt) * damping;
        particle.vy = (particle.vy + (y - particle.y) * 0.045 * dt) * damping;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        moving ||= Math.abs(x - particle.x) + Math.abs(y - particle.y) > 0.05
          || Math.abs(particle.vx) + Math.abs(particle.vy) > 0.02;
        ctx.globalAlpha = (0.5 + t * 0.5) * particle.alpha;
        ctx.fillRect(particle.x, particle.y, 1.8, 1.8);
      });
      ctx.globalAlpha = 1;
      if (!ready) { title.dataset.particleReady = "true"; ready = true; }
      return moving;
    };
    const loop = createParticleLoop(render);
    const stop = loop.stop;
    const start = () => {
      if (visible && !document.hidden && particles.length && !disposed && root.dataset.loadingState === "ready") loop.start();
    };
    const build = async () => {
      const id = ++buildId;
      await document.fonts.ready;
      if (disposed || id !== buildId) return;
      const previousWidth = width || title.clientWidth;
      const previousHeight = height || title.clientHeight;
      width = title.clientWidth;
      height = title.clientHeight;
      if (!width || !height) return;
      const compact = window.matchMedia("(max-width: 760px)").matches;
      const dpr = Math.min(devicePixelRatio || 1, compact ? 1.5 : 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const previous = particles;
      // 两行只负责字形测量，所有目标坐标都转换到同一标题画布。
      particles = Array.from(title.querySelectorAll<HTMLElement>(".resume-particle-line")).flatMap((row, rowIndex) => {
        const fallback = row.querySelector<HTMLElement>(".resume-particle-fallback");
        const rowHeight = row.clientHeight;
        const rowTop = row.offsetTop;
        if (!fallback || !rowHeight) return [];
        const style = getComputedStyle(fallback);
        const sample = document.createElement("canvas");
        sample.width = width;
        sample.height = rowHeight;
        const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
        if (!sampleCtx) return [];
        sampleCtx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        sampleCtx.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
        sampleCtx.textBaseline = "alphabetic";
        const metrics = sampleCtx.measureText(textRef.current[rowIndex]);
        const baseline = (rowHeight - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
        const left = row.offsetLeft + (Number.parseFloat(getComputedStyle(row).paddingLeft) || 0);
        sampleCtx.fillText(textRef.current[rowIndex], left, baseline, width - left);
        const pixels = sampleCtx.getImageData(0, 0, width, rowHeight).data;
        const targets: Array<{ x: number; y: number; alpha: number }> = [];
        for (let y = 0; y < rowHeight; y += 2) {
          for (let x = 0; x < width; x += 2) {
            const alpha = pixels[(y * width + x) * 4 + 3] / 255;
            if (alpha > 0.12) targets.push({ x, y: y + rowTop, alpha });
          }
        }
        const count = Math.min(targets.length, compact ? 3600 : 5400);
        const oldGroup = previous.filter((particle) => particle.tone === rowIndex);
        return Array.from({ length: count }, (_, index) => {
          const target = targets[Math.floor(index * targets.length / count)];
          const old = oldGroup[Math.floor(index * oldGroup.length / count)];
          const scatter = getParticleScatter(index + rowIndex * 541, width, height);
          const sx = old ? old.x * width / previousWidth : scatter.x;
          const sy = old ? old.y * height / previousHeight : scatter.y;
          return {
            x: sx, y: sy, sx, sy, tx: target.x, ty: target.y, vx: 0, vy: 0,
            seed: ((index * 9301 + 49297) % 233280) / 233280, alpha: target.alpha, tone: rowIndex,
          };
        });
      });
      if (!particles.length) {
        title.dataset.particleFailed = "true";
        markResumePrepared(root, "particlesReady");
        return;
      }
      delete title.dataset.particleFailed;
      dispersing = false;
      started = 0;
      markResumePrepared(root, "particlesReady");
      start();
    };
    const queueBuild = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        void build().catch(() => {
          if (!disposed) {
            stop();
            title.dataset.particleFailed = "true";
            markResumePrepared(root, "particlesReady");
          }
        });
      });
    };
    buildRef.current = queueBuild;
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const bounds = title.getBoundingClientRect();
      pointer.x = (event.clientX - bounds.left) * width / bounds.width;
      pointer.y = (event.clientY - bounds.top) * height / bounds.height;
      pointer.active = true;
      start();
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      move(event);
      pointer.held = true;
      title.setPointerCapture(event.pointerId);
      title.dataset.particleHeld = "true";
    };
    const reset = () => { pointer.held = false; pointer.active = false; delete title.dataset.particleHeld; start(); };
    const up = (event: PointerEvent) => {
      if (pointer.held) particles.forEach((particle) => {
        const impulse = getParticleRelease(particle.x - pointer.x, particle.y - pointer.y, particle.seed);
        particle.vx += impulse.x;
        particle.vy += impulse.y;
      });
      reset();
      if (title.hasPointerCapture(event.pointerId)) title.releasePointerCapture(event.pointerId);
    };
    const leave = () => { if (!pointer.held) { pointer.active = false; start(); } };
    const scatter = () => {
      reset();
      dispersing = true;
      started = 0;
      particles.forEach((particle, index) => {
        const point = getParticleScatter(index, width, height);
        particle.sx = particle.x; particle.sy = particle.y;
        particle.tx = point.x; particle.ty = point.y;
      });
      start();
    };
    const visibility = () => { if (document.hidden) { reset(); stop(); } else start(); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start(); else { reset(); stop(); }
    });
    const resize = new ResizeObserver(() => {
      if (width !== title.clientWidth || height !== title.clientHeight) queueBuild();
    });
    observer.observe(title);
    resize.observe(title);
    title.addEventListener("pointermove", move);
    title.addEventListener("pointerdown", down);
    title.addEventListener("pointerup", up);
    title.addEventListener("pointerleave", leave);
    title.addEventListener("pointercancel", reset);
    title.addEventListener("lostpointercapture", reset);
    window.addEventListener("blur", reset);
    root.addEventListener(resumeMotionEvents.localeStart, scatter);
    root.addEventListener(resumeLoadingEvents.reveal, start);
    document.addEventListener("visibilitychange", visibility);
    queueBuild();
    return () => {
      disposed = true;
      buildId += 1;
      stop();
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      resize.disconnect();
      title.removeEventListener("pointermove", move);
      title.removeEventListener("pointerdown", down);
      title.removeEventListener("pointerup", up);
      title.removeEventListener("pointerleave", leave);
      title.removeEventListener("pointercancel", reset);
      title.removeEventListener("lostpointercapture", reset);
      window.removeEventListener("blur", reset);
      root.removeEventListener(resumeMotionEvents.localeStart, scatter);
      root.removeEventListener(resumeLoadingEvents.reveal, start);
      document.removeEventListener("visibilitychange", visibility);
      delete title.dataset.particleReady;
      delete root.dataset.particlesReady;
      buildRef.current = null;
    };
  }, []);

  return titleRef;
}
