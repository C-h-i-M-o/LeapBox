"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { getParticleRelease, getParticleScatter, resumeMotionEvents } from "./resume-motion-model.ts";
import { getParticleFlowOffset } from "./resume-particle-interaction.ts";
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
    // 为涡流和释放位移预留绘制空间，标题布局与指针坐标不变。
    const canvasPadding = 240;
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
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ink = document.createElement("canvas");
    const inkCtx = ink.getContext("2d");
    const pointer = { active: false, held: false, x: 0, y: 0, vx: 0, vy: 0, time: 0 };
    let trails: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];

    const render = (now: number, dt: number): boolean => {
      if (!visible || document.hidden || disposed || !particles.length || root.dataset.loadingState !== "ready") return false;
      if (!started) started = now;
      ctx.clearRect(-canvasPadding, -canvasPadding, width + canvasPadding * 2, height + canvasPadding * 2);
      const age = now - started;
      // 普通模式始终绘制同一套粒子，底图仅供减少动态模式使用。
      const drawInk = () => {
        ctx.clearRect(-canvasPadding, -canvasPadding, width + canvasPadding * 2, height + canvasPadding * 2);
        ctx.globalAlpha = 1;
        ctx.drawImage(ink, 0, 0, width, height);
      };
      if (motion.matches && inkCtx) {
        drawInk();
        if (!ready) { title.dataset.particleReady = "true"; ready = true; }
        return false;
      }
      const damping = 0.79 ** dt;
      const radiusSquared = (pointer.held ? 240 : 115) ** 2;
      let moving = age < (dispersing ? 490 : 1400) || trails.length > 0 || Math.hypot(pointer.vx, pointer.vy) > 0.05;
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
            const force = getParticleFlowOffset(dx, dy, pointer.vx, pointer.vy, pointer.held);
            x += force.x;
            y += force.y;
          }
        }
        if (!dispersing) for (const trail of trails) {
          const force = getParticleFlowOffset(x - trail.x, y - trail.y, trail.vx, trail.vy, false);
          x += force.x * trail.life * 0.35;
          y += force.y * trail.life * 0.35;
        }
        particle.vx = (particle.vx + (x - particle.x) * 0.045 * dt) * damping;
        particle.vy = (particle.vy + (y - particle.y) * 0.045 * dt) * damping;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        moving ||= Math.abs(x - particle.x) + Math.abs(y - particle.y) > 0.05
          || Math.abs(particle.vx) + Math.abs(particle.vy) > 0.02;
        ctx.globalAlpha = (0.5 + t * 0.5) * particle.alpha;
        ctx.fillRect(particle.x, particle.y, 1.65, 1.65);
      });
      pointer.vx *= 0.86 ** dt;
      pointer.vy *= 0.86 ** dt;
      trails = trails.filter((trail) => { trail.life -= dt / 22; return trail.life > 0; });
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
      canvas.width = Math.round((width + canvasPadding * 2) * dpr);
      canvas.height = Math.round((height + canvasPadding * 2) * dpr);
      canvas.style.inset = `${-canvasPadding}px`;
      canvas.style.width = `${width + canvasPadding * 2}px`;
      canvas.style.height = `${height + canvasPadding * 2}px`;
      ctx.setTransform(dpr, 0, 0, dpr, canvasPadding * dpr, canvasPadding * dpr);
      ink.width = Math.round(width * dpr);
      ink.height = Math.round(height * dpr);
      inkCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        if (inkCtx) {
          inkCtx.font = sampleCtx.font;
          inkCtx.letterSpacing = sampleCtx.letterSpacing;
          inkCtx.textBaseline = "alphabetic";
          inkCtx.fillStyle = rowIndex === 0 ? "#eeeade" : "#83e8c4";
          inkCtx.fillText(textRef.current[rowIndex], left, baseline + rowTop, width - left);
        }
        const pixels = sampleCtx.getImageData(0, 0, width, rowHeight).data;
        const targets: Array<{ x: number; y: number; alpha: number }> = [];
        for (let y = 0; y < rowHeight; y += 1.5) {
          for (let x = (Math.round(y / 1.5) % 2) * 0.75; x < width; x += 1.5) {
            const alpha = pixels[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] / 255;
            if (alpha > 0.12) targets.push({ x, y: y + rowTop, alpha });
          }
        }
        const count = Math.min(targets.length, compact ? 4200 : 7200);
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
      if (event.pointerType === "touch" || motion.matches) return;
      const bounds = title.getBoundingClientRect();
      const x = (event.clientX - bounds.left) * width / bounds.width;
      const y = (event.clientY - bounds.top) * height / bounds.height;
      const elapsed = Math.max(8, event.timeStamp - pointer.time);
      if (pointer.active) {
        pointer.vx = Math.max(-28, Math.min(28, (x - pointer.x) * 16.67 / elapsed));
        pointer.vy = Math.max(-28, Math.min(28, (y - pointer.y) * 16.67 / elapsed));
        if (Math.hypot(x - pointer.x, y - pointer.y) > 6) {
          trails.push({ x: pointer.x, y: pointer.y, vx: pointer.vx, vy: pointer.vy, life: 1 });
          trails = trails.slice(-4);
        }
      }
      pointer.x = x;
      pointer.y = y;
      pointer.time = event.timeStamp;
      pointer.active = true;
      start();
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0 || motion.matches) return;
      move(event);
      pointer.held = true;
      title.setPointerCapture(event.pointerId);
      title.dataset.particleHeld = "true";
    };
    const reset = () => { pointer.held = false; pointer.active = false; delete title.dataset.particleHeld; start(); };
    const up = (event: PointerEvent) => {
      if (pointer.held) particles.forEach((particle) => {
        const impulse = getParticleRelease(particle.x - pointer.x, particle.y - pointer.y, particle.seed);
        particle.vx += impulse.x + pointer.vx * 0.45;
        particle.vy += impulse.y + pointer.vy * 0.45;
      });
      reset();
      if (title.hasPointerCapture(event.pointerId)) title.releasePointerCapture(event.pointerId);
    };
    const leave = () => { if (!pointer.held) { pointer.active = false; start(); } };
    const scatter = () => {
      if (motion.matches) return;
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
    motion.addEventListener("change", queueBuild);
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
      motion.removeEventListener("change", queueBuild);
      delete title.dataset.particleReady;
      delete root.dataset.particlesReady;
      buildRef.current = null;
    };
  }, []);

  return titleRef;
}
