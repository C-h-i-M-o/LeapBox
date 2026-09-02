import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import * as motionModel from "../app/(public)/resume/resume-motion-model.ts";
import { createParticleLoop } from "../app/(public)/resume/particle-frame-loop.ts";

test("首帧粒子铺开在标题区域内，并随容器尺寸同比缩放", () => {
  assert.equal(typeof motionModel.getParticleScatter, "function");
  const points = Array.from({ length: 96 }, (_, index) => motionModel.getParticleScatter(index, 1000, 160));
  assert.ok(points.every(({ x, y }) => x >= 0 && x <= 1000 && y >= 0 && y <= 160));
  assert.ok(Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)) > 850);
  assert.ok(Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y)) > 120);
  const small = motionModel.getParticleScatter(17, 500, 80);
  assert.equal(small.x, points[17].x / 2);
  assert.equal(small.y, points[17].y / 2);
});

test("翻译改变章节高度后按原阅读比例定位并限制边界", () => {
  assert.equal(typeof motionModel.getReadingScrollPosition, "function");
  assert.equal(motionModel.getReadingScrollPosition(1000, 3000, 900, 0.5), 2050);
  assert.equal(motionModel.getReadingScrollPosition(1000, 600, 900, 0.5), 1000);
  assert.equal(motionModel.getReadingScrollPosition(1000, 3000, 900, 2), 3100);
  assert.equal(motionModel.getReadingScrollPosition(1000, 3000, 900, -1), 1000);
});

test("涡流在指针半径外不影响文字，中心与吸附状态保持有限坐标", () => {
  assert.deepEqual(motionModel.getVortexOffset(240, 0, false), { x: 0, y: 0 });
  for (const held of [false, true]) {
    const center = motionModel.getVortexOffset(0, 0, held);
    assert.ok(Number.isFinite(center.x) && Number.isFinite(center.y));
  }
  const orbit = motionModel.getVortexOffset(40, 0, false);
  assert.ok(orbit.y > 0, "经过指针时应产生切向运动");
  const pull = motionModel.getVortexOffset(40, 0, true);
  assert.ok(pull.x < 0, "按住时朝指针吸附");
});

test("释放冲量向外扩散且距离为零时有确定方向", () => {
  const right = motionModel.getParticleRelease(40, 0, 0.5);
  assert.ok(right.x > 0);
  assert.equal(right.y, 0);
  const center = motionModel.getParticleRelease(0, 0, 0.5);
  assert.ok(Number.isFinite(center.x) && Number.isFinite(center.y));
  assert.ok(Math.hypot(center.x, center.y) > 0);
});

function createFrames(t: TestContext) {
  const frames = new Map<number, FrameRequestCallback>();
  const request = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  const cancel = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  let id = 0;
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true, value: (frame: number) => { frames.delete(frame); },
  });
  t.after(() => {
    if (request) Object.defineProperty(globalThis, "requestAnimationFrame", request);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (cancel) Object.defineProperty(globalThis, "cancelAnimationFrame", cancel);
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  });
  return {
    frames,
    tick: (time: number) => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

test("粒子稳定后不再请求帧，重复唤醒只生成一条循环", (t) => {
  const { frames, tick } = createFrames(t);
  let draws = 0;
  const loop = createParticleLoop(() => ++draws < 3);
  loop.start();
  loop.start();
  assert.equal(frames.size, 1);
  tick(0);
  tick(17);
  tick(34);
  assert.equal(draws, 3);
  assert.equal(frames.size, 0);
  tick(1000);
  assert.equal(draws, 3);
  loop.start();
  tick(1017);
  assert.equal(draws, 4, "停止后新交互必须能重新绘制");
  assert.equal(frames.size, 0);
});

test("高刷新率限制绘制次数，暂停取消待执行帧并重置时间", (t) => {
  const { frames, tick } = createFrames(t);
  const steps: number[] = [];
  const loop = createParticleLoop((_time, dt) => { steps.push(dt); return true; });
  loop.start();
  for (const time of [0, 8.33, 16.67, 25, 33.34]) tick(time);
  assert.equal(steps.length, 3);
  loop.stop();
  assert.equal(frames.size, 0);
  tick(500);
  assert.equal(steps.length, 3);
  loop.start();
  tick(10000);
  assert.equal(steps.at(-1), 1, "后台恢复不应把离开时间累积到物理步长");
  loop.stop();
});
