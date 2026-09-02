/** 首帧与 Canvas 共用分散位置，初始点阵不依赖字体就绪。 */
export function getParticleScatter(index: number, width: number, height: number): { x: number; y: number } {
  return {
    x: (0.04 + ((index * 73 + 19) % 997) / 997 * 0.92) * width,
    y: (0.08 + ((index * 37 + 11) % 149) / 149 * 0.84) * height,
  };
}

export const initialParticlePoints = Array.from({ length: 96 }, (_, index) => getParticleScatter(index, 1000, 160));

export function getReadingScrollPosition(top: number, height: number, viewport: number, progress: number): number {
  return top + Math.max(0, height - viewport) * Math.min(1, Math.max(0, progress));
}

/** 指针附近的径向吸附和切向涡流，半径外不改变字形。 */
export function getVortexOffset(dx: number, dy: number, held: boolean): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  const radius = held ? 320 : 135;
  const weight = Math.max(0, 1 - distance / radius) ** 2;
  if (!weight || !distance) return { x: 0, y: 0 };
  const radial = held ? -distance * 0.95 : 14;
  const tangent = held ? 30 : 42;
  return {
    x: (dx * radial - dy * tangent) / distance * weight,
    y: (dy * radial + dx * tangent) / distance * weight,
  };
}

export function getParticleRelease(dx: number, dy: number, seed: number): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  const angle = distance ? Math.atan2(dy, dx) : seed * Math.PI * 2;
  const speed = Math.max(0, 1 - distance / 360) * (9 + seed * 9);
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}

export const resumeMotionEvents = {
  localeStart: "resume:locale-start",
} as const;
