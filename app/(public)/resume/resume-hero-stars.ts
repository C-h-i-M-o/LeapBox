import { CubicBezierCurve3, Vector3 } from "three";

type P = readonly [number, number, number];
type Segment = readonly [P, P, P, P];

// 书写曲线的所有控制点只定义一次；任何观察角度都使用这一套几何。
const strokes: readonly (readonly Segment[])[] = [
  [
    [[-1.08,.55,-.25],[-1.5,1.2,-.85],[-.36,1.2,-1],[-.43,.47,-.6]],
    [[-.43,.47,-.6],[-.42,.18,-.25],[-.12,-.02,0],[.02,-.13,.05]],
  ],
  [
    [[.02,-.13,.05],[.34,.18,.8],[1.38,1.4,.9],[.98,1.05,.18]],
    [[.98,1.05,.18],[.66,.85,-.3],[.48,.24,-.7],[.12,-.25,-.55]],
    [[.12,-.25,-.55],[-.28,-.82,-.9],[-1.1,-1.16,-.3],[-1.03,-.65,.4]],
    [[-1.03,-.65,.4],[-.95,-.35,.75],[-.2,-.6,.88],[.2,-.65,.6]],
  ],
  [
    [[.45,.04,-.4],[.8,.65,-.1],[.95,.45,.55],[.4,-.4,.65]],
    [[.4,-.4,.65],[.05,-1,-.1],[-.5,-1.3,-.5],[-.45,-.95,-.8]],
    [[-.45,-.95,-.8],[-.35,-.62,-1],[.75,-1.15,-.4],[1.12,-.72,.2]],
    [[1.12,-.72,.2],[1.6,-.16,.7],[.72,-.25,1],[.32,-.48,.4]],
  ],
];

let seed = 731;
function random(): number { seed = Math.imul(1664525, seed) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }
function bell(): number { return (random() + random() + random() - 1.5) / 1.5; }

/** 已确认的 YL / 椭圆星河固定点云；只在初始化时采样。 */
export function createHeroStarPositions(count: number): Float32Array {
  seed = 731;
  count = Math.max(0, Math.floor(count));
  const positions = new Float32Array(count * 3);
  const curves = strokes.flatMap((stroke) => stroke.map((points) => new CubicBezierCurve3(...points.map((p) => new Vector3(...p)) as [Vector3, Vector3, Vector3, Vector3])));
  // 先生成宽而破碎的星系密度场，再以共同横坐标结合书写投影。
  // 所有采样仅在初始化执行，观察角度不会影响任何粒子的坐标。
  const bins = Array.from({ length: 160 }, () => [] as number[]);
  const extent = 1.42;
  const binFor = (x: number): number => Math.max(0, Math.min(159, Math.floor((x + extent) / (extent * 2) * 160)));
  for (let i = 0; i < 60000; i++) {
    const r = .06 + Math.pow(random(), .68) * 1.32;
    const branch = Math.floor(random() * 3);
    const feather = bell();
    const theta = r * 4.8 + branch * Math.PI * 2 / 3
      + .24 * Math.sin(r * 11 + branch * 1.8) + feather * (.30 + r * .24) + (random() < .24 ? .32 * Math.sin(r * 3.2) : 0);
    // 旋臂内部有宽度变化与分叉，外围少量星尘填补臂间空隙。
    const dust = random() < .12;
    const width = dust ? .30 : .056 + .12 * (1 + Math.sin(r * 16 + branch)) * .5;
    const x = Math.cos(theta) * r + bell() * width;
    const z = Math.sin(theta) * r + bell() * width;
    bins[binFor(x)].push(z);
  }
  const lengths = curves.map((curve) => curve.getLength());
  const totalLength = lengths.reduce((total, length) => total + length, 0);
  const point = new Vector3();
  for (let i = 0; i < count; i++) {
    let distance = random() * totalLength;
    let curveIndex = 0;
    while (curveIndex < curves.length - 1 && distance > lengths[curveIndex]) distance -= lengths[curveIndex++];
    const t = distance / lengths[curveIndex];
    curves[curveIndex].getPointAt(t, point);
    const tangent = curves[curveIndex].getTangentAt(t);
    const fringe = random() < .16;
    const width = (.071 + .083 * Math.pow(Math.sin(t * Math.PI + curveIndex * .8), 2)) * (fringe ? 2.8 : 1);
    const offset = bell() * width;
    point.x += -tangent.y * offset + bell() * .018;
    point.y += tangent.x * offset + bell() * .018;
    const choices = bins[binFor(point.x)];
    // 固定压缩纵深，让仰视呈椭圆；旋转过程中不改变形体。
    point.z = (choices[Math.floor(random() * choices.length)] ?? bell() * .2) * .58;
    point.x *= 1.12;
    positions.set(point.toArray(), i * 3);
    random(); random(); random(); random();
  }
  return positions;
}
