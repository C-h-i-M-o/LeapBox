import assert from "node:assert/strict";
import test from "node:test";

import {
  completeUploadSessionWithRecovery,
  uploadResumeAction,
  type ClientUploadSession,
  type UploadRequest,
} from "../app/components/upload-client.ts";

function session(status: ClientUploadSession["status"]): ClientUploadSession {
  return {
    id: "session-1",
    parentId: null,
    name: "video.bin",
    relativePath: null,
    mimeType: "application/octet-stream",
    sizeBytes: 4,
    partSizeBytes: 2,
    status,
    parts: [],
  };
}

const file = new File([new Uint8Array(4)], "video.bin");

test("completing 会话只重试保存而不重新上传分片", () => {
  assert.equal(uploadResumeAction(session("completing"), file, null, null), "complete");
});

test("completed 会话直接视为成功，aborted 会话重新创建", () => {
  assert.equal(uploadResumeAction(session("completed"), file, null, null), "done");
  assert.equal(uploadResumeAction(session("aborted"), file, null, null), "create");
});

test("文件指纹字段不一致时不能复用旧会话", () => {
  assert.equal(uploadResumeAction(session("active"), file, "other-folder", null), "create");
  assert.equal(uploadResumeAction(session("active"), file, null, "folder/video.bin"), "create");
});

test("完成请求断网后以服务端 completed 状态直接收敛", async () => {
  const calls: string[] = [];
  const request: UploadRequest = async <T>(url, init) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "POST") throw new TypeError("network failed");
    return { session: session("completed") } as T;
  };

  await completeUploadSessionWithRecovery("session-1", new AbortController().signal, request);
  assert.deepEqual(calls, [
    "POST /api/uploads/session-1/complete",
    "GET /api/uploads/session-1",
  ]);
});

test("服务端仍为 completing 时只重试完成接口而不重传分片", async () => {
  const calls: string[] = [];
  let postCount = 0;
  const request: UploadRequest = async <T>(url, init) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "POST") {
      postCount += 1;
      if (postCount === 1) throw new TypeError("network failed");
      return undefined as T;
    }
    return { session: session("completing") } as T;
  };

  await completeUploadSessionWithRecovery("session-1", new AbortController().signal, request);
  assert.deepEqual(calls, [
    "POST /api/uploads/session-1/complete",
    "GET /api/uploads/session-1",
    "POST /api/uploads/session-1/complete",
  ]);
  assert.equal(calls.some((call) => call.includes("/parts/")), false);
});

test("服务端已终止的保存会话不会继续重试", async () => {
  const request: UploadRequest = async <T>(_url, init) => {
    if (init?.method === "POST") throw new TypeError("network failed");
    return { session: session("aborted") } as T;
  };

  await assert.rejects(
    completeUploadSessionWithRecovery("session-1", new AbortController().signal, request),
    /无法恢复/u,
  );
});
