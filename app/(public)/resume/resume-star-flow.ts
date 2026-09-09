export interface StarFlowPose {
  morph: number;
  scatter: number;
  scale: number;
  aspect: number;
  centerX: number;
  centerY: number;
  rotationX: number;
  rotationY: number;
  perspective?: number;
  roll?: number;
  turn?: number;
}

export interface StarFlowPointer {
  x: number;
  y: number;
  dx: number;
  dy: number;
  active: boolean;
}

/** 速度和位移跨帧保留，没有风段替换或位置硬边界。 */
export function advanceStarFlow(
  offsets: Float32Array, velocities: Float32Array,
  source: Float32Array, target: Float32Array, field: Float32Array, seeds: Float32Array,
  pose: StarFlowPose, pointer: StarFlowPointer, seconds: number,
): number {
  const dt = Math.min(.05, Math.max(0, seconds));
  if (!dt) return 0;
  const cy = Math.cos(pose.rotationX), sy = Math.sin(pose.rotationX);
  const cx = Math.cos(pose.rotationY), sx = Math.sin(pose.rotationY);
  const cr = Math.cos(pose.roll ?? 0), sr = Math.sin(pose.roll ?? 0);
  const ct = Math.cos(pose.turn ?? 0), st = Math.sin(pose.turn ?? 0);
  const morph = pose.morph * pose.morph * (3 - 2 * pose.morph);
  const speed = Math.hypot(pointer.dx, pointer.dy) / dt;
  const inputScale = speed > 1.6 ? 1.6 / speed : 1;
  const vx = pointer.dx / dt * inputScale, vy = pointer.dy / dt * inputScale;
  // 回弹与阻尼同步按时间尺度加速，避免只增强弹力导致振荡。
  const recoveryRate = 1.33;
  const damping = Math.exp(-dt * 3.2 * recoveryRate);
  let energy = 0;
  for (let i = 0; i < seeds.length; i++) {
    const k = i * 3, j = i * 2;
    const x = source[k] + (target[k] - source[k]) * morph;
    const y = source[k + 1] + (target[k + 1] - source[k + 1]) * morph;
    const z = source[k + 2] + (target[k + 2] - source[k + 2]) * morph;
    const rx = cy * x + sy * z, rz = -sy * x + cy * z;
    const ry = cx * y + sx * rz, modelZ = -sx * y + cx * rz;
    const turnedY = ct * ry + st * modelZ;
    const depth = (-st * ry + ct * modelZ) * pose.scale;
    const spread = Math.max(pose.scatter, seeds[i] >= .985 ? 1 : 0);
    const mx = (rx * cr - turnedY * sr) * pose.scale / (1 - depth * (pose.perspective ?? .22)) + pose.centerX;
    const my = (rx * sr + turnedY * cr) * pose.scale / (1 - depth * (pose.perspective ?? .22)) + pose.centerY;
    const px = mx + (field[k] * pose.aspect - mx) * spread + offsets[j];
    const py = my + (field[k + 1] - my) * spread + offsets[j + 1];
    // 以粒子当前位置计算气流作用，鼠标能继续带动已经离开轮廓的粒子。
    const dx = px - pointer.x, dy = py - pointer.y;
    const falloff = Math.max(0, 1 - (dx * dx + dy * dy) / .09);
    const influence = pointer.active ? falloff * falloff : 0;
    const follow = 1 - Math.exp(-influence * dt * 12);
    velocities[j] += (vx * .2926 - velocities[j]) * follow;
    velocities[j + 1] += (vy * .2926 - velocities[j + 1]) * follow;
    // 柔性回弹限制积累的动量，不截断粒子位置。
    const spring = 1.2 * recoveryRate * recoveryRate * (1 - influence * .5);
    velocities[j] = (velocities[j] - offsets[j] * spring * dt) * damping;
    velocities[j + 1] = (velocities[j + 1] - offsets[j + 1] * spring * dt) * damping;
    offsets[j] += velocities[j] * dt;
    offsets[j + 1] += velocities[j + 1] * dt;
    energy += Math.abs(offsets[j]) + Math.abs(offsets[j + 1]) + Math.abs(velocities[j]) + Math.abs(velocities[j + 1]);
  }
  return energy;
}
