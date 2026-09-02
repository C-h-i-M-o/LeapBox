import assert from "node:assert/strict";
import test from "node:test";

import { getAwardRingRotation } from "../app/(public)/resume/resume-motion-model.ts";

test("九项奖项在圆环上均匀分布", () => {
  assert.equal(getAwardRingRotation(0, 9), 0);
  assert.equal(getAwardRingRotation(1, 9), 40);
  assert.equal(getAwardRingRotation(8, 9), 320);
  assert.equal(getAwardRingRotation(2, 0), 0);
});
