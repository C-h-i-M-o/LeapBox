import assert from "node:assert/strict";
import test from "node:test";
import { getParticleFlowOffset } from "../app/(public)/resume/resume-particle-interaction.ts";

test("静止悬停轻微扰动，快速划过沿移动方向带动粒子", () => {
  const still = getParticleFlowOffset(25, 0, 0, 0, false);
  const sweep = getParticleFlowOffset(25, 0, 24, 0, false);
  const reverse = getParticleFlowOffset(25, 0, -24, 0, false);
  assert.ok(Math.hypot(still.x, still.y) < 12);
  assert.ok(sweep.x > still.x + 10);
  assert.ok(reverse.x < still.x - 10);
});

test("作用范围外不影响文字，中心点与极端指针速度保持有限", () => {
  assert.deepEqual(getParticleFlowOffset(500, 500, 25, 15, true), { x: 0, y: 0 });
  for (const held of [false, true]) {
    for (const distance of [0, 1, 20, 100, 200]) {
      const offset = getParticleFlowOffset(distance, 0, 1e8, -1e8, held);
      assert.ok(Number.isFinite(offset.x) && Number.isFinite(offset.y));
      assert.ok(Math.hypot(offset.x, offset.y) <= 150);
    }
  }
});

test("按住时向中心聚拢，释放悬停保持更小的作用范围", () => {
  const held = getParticleFlowOffset(150, 0, 0, 0, true);
  assert.ok(held.x < 0);
  assert.deepEqual(getParticleFlowOffset(150, 0, 0, 0, false), { x: 0, y: 0 });
});
