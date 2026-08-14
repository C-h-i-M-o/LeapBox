import assert from "node:assert/strict";
import test from "node:test";

import { uploadResumeAction, type ClientUploadSession } from "../app/components/upload-client.ts";

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
