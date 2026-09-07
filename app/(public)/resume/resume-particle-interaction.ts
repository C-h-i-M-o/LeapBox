/** 速度增强局部流动；静止时轻扰，按住聚拢，快速扫过时沿指针方向拖曳。 */
export function getParticleFlowOffset(
  dx: number, dy: number, velocityX: number, velocityY: number, held: boolean,
): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  const radius = held ? 240 : 115;
  if (distance >= radius) return { x: 0, y: 0 };
  const weight = (1 - distance / radius) ** 2;
  const speed = Math.hypot(velocityX, velocityY);
  const limit = speed > 28 ? 28 / speed : 1;
  const vx = velocityX * limit;
  const vy = velocityY * limit;
  const tangent = (held ? 24 : 9) + Math.min(speed, 28) * 0.8;
  const radial = held ? -distance * 1.8 : 4;
  const divisor = distance || 1;
  const x = ((dx * radial - dy * tangent) / divisor + vx * 2.5) * weight;
  const y = ((dy * radial + dx * tangent) / divisor + vy * 2.5) * weight;
  const magnitude = Math.hypot(x, y);
  const scale = magnitude > 150 ? 150 / magnitude : 1;
  return { x: x * scale, y: y * scale };
}
