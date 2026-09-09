import { heroOrder } from "./resume-hero-order.ts";
import { createHeroStarPositions } from "./resume-hero-stars.ts";

/** 三种简历符号星群：首屏 YL、过渡神经网络、结尾邮件信封。 */
export type StarShape = "spiral" | "weave" | "ring";

const MAX_RADIUS = 1.48;

// 3→4→2 的分层结构，不以随机空间分布代替神经网络拓扑。
const networkNodes: readonly (readonly [number, number, number])[] = [
  [-.88, -.5, -.12], [-.88, 0, -.12], [-.88, .5, -.12],
  [0, -.75, .12], [0, -.25, .12], [0, .25, .12], [0, .75, .12],
  [.88, -.35, -.06], [.88, .35, -.06],
];
const networkEdges: readonly (readonly [number, number])[] = [
  ...[0, 1, 2].flatMap((from) => [3, 4, 5, 6].map((to): [number, number] => [from, to])),
  ...[3, 4, 5, 6].flatMap((from) => [7, 8].map((to): [number, number] => [from, to])),
];


function noise(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x45d9f3b + salt * 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** 抵消 shader 的 xz 0.2、yz 1.05 旋转，使图标正面朝向镜头。 */
function faceCamera(x: number, y: number, z: number): [number, number, number] {
  const cy = Math.cos(1.05);
  const sy = Math.sin(1.05);
  const y1 = y * cy - z * sy;
  const z1 = y * sy + z * cy;
  const cx = Math.cos(0.2);
  const sx = Math.sin(0.2);
  return [x * cx - z1 * sx, y1, x * sx + z1 * cx];
}

type Point = readonly [number, number, number];
interface StarTrack { start: number; count: number; duration?: number }
export interface StarPaths {
  positions: Float32Array;
  samples: Float32Array;
  offsets: Float32Array;
  phases: Float32Array;
  tracks: StarTrack[];
  wander?: Float32Array;
  wanderBase?: Float64Array;
}
interface PathDefinition { weight: number; sample: (t: number) => Point }
const TAU = Math.PI * 2;

/** 按弧长采样闭合笔画，星点经过拐角时不会跳回起点。 */
function outline(vertices: readonly Point[]): (t: number) => Point {
  const lengths = vertices.map((p, i) => {
    const next = vertices[(i + 1) % vertices.length];
    return Math.hypot(next[0] - p[0], next[1] - p[1], next[2] - p[2]);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return (t) => {
    let distance = t * total;
    let segment = 0;
    while (segment < lengths.length - 1 && distance > lengths[segment]) distance -= lengths[segment++];
    const a = vertices[segment], b = vertices[(segment + 1) % vertices.length];
    const fraction = distance / lengths[segment];
    return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction];
  };
}

function pathsFor(shape: StarShape): PathDefinition[] {
  if (shape === "weave") {
    // 纬圈均匀覆盖整个球面，避免相交圆环形成空心节点。
    const nodes = networkNodes.flatMap((node) => Array.from({ length: 7 }, (_, latitude): PathDefinition => ({
      weight: .6 / 63,
      sample: (t) => {
        const z = ((latitude + .5) / 7 * 2 - 1) * .125;
        const radius = Math.sqrt(.125 * .125 - z * z);
        return [node[0] + Math.cos(t * TAU) * radius, node[1] + Math.sin(t * TAU) * radius, node[2] + z];
      },
    })));
    const edges = networkEdges.map(([from, to]): PathDefinition => ({
      weight: .4 / networkEdges.length,
      sample: (t) => {
        const a = networkNodes[from], b = networkNodes[to];
        const along = (1 - Math.cos(t * TAU)) * .5;
        return [a[0] + (b[0] - a[0]) * along, a[1] + (b[1] - a[1]) * along, a[2] + (b[2] - a[2]) * along + Math.sin(t * TAU) * .014];
      },
    }));
    return [...nodes, ...edges];
  }
  const contours: readonly (readonly Point[])[] = [
    [[-.86, .48, 0], [.86, .48, 0], [.86, -.48, 0], [-.86, -.48, 0]],
    [[-.86, .48, 0], [0, -.04, 0], [.86, .48, 0]],
  ];
  return contours.map((vertices) => ({ weight: 1 / contours.length, sample: outline(vertices) }));
}

/** 初始化时预计算循环路径，动画帧只插值，不重复计算三角函数或分配数组。 */
export function createStarPaths(shape: StarShape, count: number): StarPaths {
  const safeCount = Math.max(0, Math.floor(count));
  if (shape === "spiral") {
    const positions = createHeroStarPositions(safeCount);
    for (let i = 0; i < safeCount; i++) {
      positions.set(faceCamera(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]), i * 3);
    }
    // 把原始点云排成闭环：每次插入新增路程最短的位置，避免局部折返。
    const order = heroOrder[safeCount] ? [...heroOrder[safeCount]] : safeCount ? [0] : [];
    const visited = new Uint8Array(safeCount);
    const nearest = new Float64Array(safeCount).fill(Infinity);
    const distance = (a: number, b: number): number => Math.hypot(
      positions[a * 3] - positions[b * 3],
      positions[a * 3 + 1] - positions[b * 3 + 1],
      positions[a * 3 + 2] - positions[b * 3 + 2],
    );
    if (safeCount) visited[0] = 1;
    let latest = 0;
    while (order.length < safeCount) {
      let next = -1, closest = Infinity;
      for (let i = 0; i < safeCount; i++) {
        if (visited[i]) continue;
        nearest[i] = Math.min(nearest[i], distance(i, latest));
        if (nearest[i] < closest) { closest = nearest[i]; next = i; }
      }
      let insertion = 0, cost = Infinity;
      for (let i = 0; i < order.length; i++) {
        const a = order[i], b = order[(i + 1) % order.length];
        const added = distance(a, next) + distance(next, b) - distance(a, b);
        if (added < cost) { cost = added; insertion = i + 1; }
      }
      order.splice(insertion, 0, next); visited[next] = 1; latest = next;
    }
    const samples = new Float32Array(positions.length);
    const phases = new Float32Array(safeCount);
    for (let i = 0; i < safeCount; i++) {
      samples.set(positions.subarray(order[i] * 3, order[i] * 3 + 3), i * 3);
      phases[order[i]] = i;
    }
    // 信封外轮廓周长为 5.36；按相同平均路程速度校准，不把长路径强塞进九十秒。
    let length = 0;
    for (let i = 0; i < order.length; i++) length += distance(order[i], order[(i + 1) % order.length]);
    const duration = Math.max(90, length / (5.36 / 90));
    const wander = new Float32Array(safeCount * 3);
    for (let i = 0; i < safeCount; i++) {
      wander.set([.65 + noise(i, 137) * .7, noise(i, 139) * TAU, noise(i, 149) > .88 ? .09 : .028 + noise(i, 151) * .022], i * 3);
    }
    const wanderBase = new Float64Array(safeCount * 3);
    for (let i = 0; i < safeCount; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const phase = wander[i * 3 + 1] + axis * 2.17;
        wanderBase[i * 3 + axis] = Math.sin(phase) * .65 + Math.sin(phase * 1.7) * .35;
      }
    }
    return { wanderBase, wander, positions, samples, phases, offsets: new Float32Array(positions.length), tracks: safeCount ? [{ start: 0, count: safeCount, duration }] : [] };
  }

  const positions = new Float32Array(safeCount * 3);
  const samples = new Float32Array(safeCount * 3);
  const offsets = new Float32Array(safeCount * 3);
  const phases = new Float32Array(safeCount);
  const tracks: StarTrack[] = [];
  const definitions = pathsFor(shape);
  let start = 0;
  let weight = 0;
  for (const definition of definitions) {
    weight += definition.weight;
    const end = Math.min(safeCount, Math.round(weight * safeCount));
    const length = end - start;
    if (length > 0) tracks.push({ start, count: length });
    for (let i = 0; i < length; i++) {
      const p = definition.sample(i / length);
      const [x, y, z] = faceCamera(p[0], p[1], p[2]);
      const scale = Math.min(1, MAX_RADIUS / Math.hypot(x, y, z));
      const index = start + i;
      samples.set([x * scale, y * scale, z * scale], index * 3);
      phases[index] = noise(index, 43) * length;
      // 大多数星点靠近轮廓，少量向外散开；每点偏移固定，流动时不会随机抽动。
      const halo = noise(index, 47) > .9 ? 2.5 : 1;
      const width = (shape === "weave" ? .018 : .055) * halo;
      const depth = (shape === "weave" ? .025 : .12) * halo;
      offsets.set(faceCamera(
        (noise(index, 51) + noise(index, 53) - 1) * width,
        (noise(index, 57) + noise(index, 59) - 1) * width,
        (noise(index, 61) + noise(index, 67) - 1) * depth,
      ), index * 3);
    }
    start = end;
  }
  const paths = { positions, samples, offsets, phases, tracks };
  advanceStarPaths(positions, paths, 0);
  return paths;
}

export function advanceStarPaths(output: Float32Array, paths: StarPaths, seconds: number): void {
  if (paths.tracks.length === 0) { output.set(paths.samples); return; }
  for (const track of paths.tracks) {
    const cycle = ((seconds / (track.duration ?? 90)) % 1 + 1) % 1;
    const shift = cycle * track.count;
    for (let i = 0; i < track.count; i++) {
      const index = track.start + i;
      const wander = paths.wander;
      const drift = wander ? index * 3 : 0;
      // 时间连续，不在循环边界重置速度相位。
      const travel = wander ? seconds / (track.duration ?? 90) * track.count * wander[drift] : shift;
      const progress = paths.phases[index] + travel;
      const whole = Math.floor(progress), fraction = progress - whole;
      const a = ((whole % track.count) + track.count) % track.count;
      const b = (a + 1) % track.count;
      const target = (track.start + i) * 3;
      for (let axis = 0; axis < 3; axis++) {
        const from = paths.samples[(track.start + a) * 3 + axis];
        output[target + axis] = from + (paths.samples[(track.start + b) * 3 + axis] - from) * fraction + paths.offsets[target + axis];
        if (wander) {
          const phase = wander[drift + 1] + axis * 2.17;
          const frequency = .22 + wander[drift] * .13 + axis * .047;
          const wave = Math.sin(seconds * frequency + phase);
          const detail = Math.sin(seconds * frequency * .43 + phase * 1.7);
          output[target + axis] += wander[drift + 2] * (wave * .65 + detail * .35 - paths.wanderBase![target + axis]);
        }
      }
    }
  }
}

export function createStarPositions(shape: StarShape, count: number): Float32Array {
  return createStarPaths(shape, count).positions;
}

export function createStarColors(count: number): Float32Array {
  const safeCount = Math.max(0, Math.floor(count));
  const output = new Float32Array(safeCount * 3);
  for (let index = 0; index < safeCount; index += 1) {
    const pick = noise(index, 101);
    const color: readonly [number, number, number] = pick < 0.58 ? [0.82, 0.94, 1] : pick < 0.82 ? [0.52, 0.78, 1] : pick < 0.9 ? [1, 0.78, 0.43] : pick < 0.96 ? [0.76, 0.62, 1] : [1, 0.42, 0.4];
    output.set(color, index * 3);
  }
  return output;
}
