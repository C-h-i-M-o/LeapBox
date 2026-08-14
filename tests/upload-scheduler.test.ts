import assert from "node:assert/strict";
import test from "node:test";

import * as uploadClient from "../app/components/upload-client.ts";

type Deferred = {
  promise: Promise<void>;
  resolve(): void;
};

function deferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

async function nextTurn(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("全局调度以轮询方式分配四个初始槽位且单文件不超过三个", async () => {
  const Scheduler = uploadClient.AdaptiveUploadScheduler;
  assert.equal(typeof Scheduler, "function", "应导出 AdaptiveUploadScheduler");
  if (typeof Scheduler !== "function") return;

  const scheduler = new Scheduler();
  const gates = Array.from({ length: 6 }, deferred);
  const started: string[] = [];
  const jobs = [
    ...Array.from({ length: 4 }, (_, index) =>
      scheduler.schedule("large", async () => {
        started.push(`large-${index + 1}`);
        await gates[index]?.promise;
      })),
    ...Array.from({ length: 2 }, (_, index) =>
      scheduler.schedule("small", async () => {
        started.push(`small-${index + 1}`);
        await gates[index + 4]?.promise;
      })),
  ];

  await nextTurn();
  assert.deepEqual(started, ["large-1", "small-1", "large-2", "small-2"]);

  gates.forEach((gate) => gate.resolve());
  await Promise.all(jobs);
});

test("六个连续成功分片后允许五个全局请求并在重试时降回四个", async () => {
  const Scheduler = uploadClient.AdaptiveUploadScheduler;
  assert.equal(typeof Scheduler, "function", "应导出 AdaptiveUploadScheduler");
  if (typeof Scheduler !== "function") return;

  const scheduler = new Scheduler();
  for (let index = 0; index < 6; index += 1) {
    await scheduler.schedule(`warm-${index}`, async () => undefined);
  }

  const fastGates = Array.from({ length: 5 }, deferred);
  let active = 0;
  let peak = 0;
  const fastJobs = fastGates.map((gate, index) =>
    scheduler.schedule(`fast-${index}`, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate.promise;
      active -= 1;
    }));
  await nextTurn();
  assert.equal(peak, 5);
  fastGates.forEach((gate) => gate.resolve());
  await Promise.all(fastJobs);

  scheduler.noteRetry();
  const slowGates = Array.from({ length: 5 }, deferred);
  active = 0;
  peak = 0;
  const slowJobs = slowGates.map((gate, index) =>
    scheduler.schedule(`slow-${index}`, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate.promise;
      active -= 1;
    }));
  await nextTurn();
  assert.equal(peak, 4);
  slowGates.forEach((gate) => gate.resolve());
  await Promise.all(slowJobs);
});

test("已确认字节可以达到 100% 并把剩余时间归零", () => {
  const createTracker = uploadClient.createUploadProgressTracker;
  assert.equal(typeof createTracker, "function", "应导出 createUploadProgressTracker");
  if (typeof createTracker !== "function") return;

  const tracker = createTracker(16, 0);
  const halfway = tracker.confirm(8, 1_000);
  const completed = tracker.confirm(8, 2_000);

  assert.equal(halfway.progress, 50);
  assert.equal(completed.progress, 100);
  assert.equal(completed.uploadedBytes, 16);
  assert.equal(completed.remainingSeconds, 0);
});

test("最后一个字节确认前进度不得提前显示 100%", () => {
  const tracker = uploadClient.createUploadProgressTracker(1_000, 0);
  assert.equal(tracker.confirm(999, performance.now() + 1_000).progress, 99);
  assert.equal(tracker.confirm(1, performance.now() + 2_000).progress, 100);
});

test("最后一个分片确认后先报告 100% 再进入保存阶段", async () => {
  const uploadPreparedSession = uploadClient.uploadPreparedSession;
  assert.equal(typeof uploadPreparedSession, "function", "应导出 uploadPreparedSession");
  if (typeof uploadPreparedSession !== "function") return;

  const events: string[] = [];
  const file = new Blob([new Uint8Array(16)]);
  await uploadPreparedSession({
    file,
    session: {
      id: "session-1",
      parentId: null,
      name: "demo.bin",
      relativePath: null,
      mimeType: "application/octet-stream",
      sizeBytes: 16,
      partSizeBytes: 8,
      status: "active",
      parts: [],
    },
    signal: new AbortController().signal,
    scheduler: new uploadClient.AdaptiveUploadScheduler(),
    uploadPart: async (_sessionId, partNumber, body) => {
      events.push(`part-${partNumber}`);
      return { partNumber, etag: `etag-${partNumber}`, sizeBytes: body.size };
    },
    complete: async () => {
      events.push("complete");
    },
    onProgress: (progress) => {
      events.push(`progress-${progress.progress}`);
    },
    onSaving: () => {
      events.push("saving");
    },
  });

  const progress100Index = events.indexOf("progress-100");
  const savingIndex = events.indexOf("saving");
  const completeIndex = events.indexOf("complete");
  assert.ok(progress100Index >= 0);
  assert.ok(savingIndex > progress100Index);
  assert.ok(completeIndex > savingIndex);
});

test("浏览器不支持 IndexedDB 时新上传仍可使用无状态续传存储", async () => {
  const createStore = uploadClient.createUploadResumeStore;
  assert.equal(typeof createStore, "function", "应导出 createUploadResumeStore");
  if (typeof createStore !== "function") return;

  const store = createStore(undefined);
  assert.equal(await store.get("fingerprint"), null);
  await assert.doesNotReject(store.put({ fingerprint: "fingerprint", sessionId: "session-1" }));
  await assert.doesNotReject(store.delete("fingerprint"));
});

test("文件级队列同时准备三个任务但不会启动第四个", async () => {
  const gates = Array.from({ length: 4 }, deferred);
  const started: number[] = [];
  const jobs = [0, 1, 2, 3];
  const running = uploadClient.runWithConcurrency(jobs, uploadClient.MAX_ACTIVE_FILES, async (index) => {
    started.push(index);
    await gates[index]?.promise;
  });

  await nextTurn();
  assert.deepEqual(started, [0, 1, 2]);
  gates.forEach((gate) => gate.resolve());
  await running;
});
