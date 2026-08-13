import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TEXT_PREVIEW_BYTES,
  MAX_UPLOAD_BYTES,
  buildBreadcrumb,
  buildContentDisposition,
  classifyPreview,
  isMoveTargetAllowed,
  mapPublicItem,
  normalizeItemName,
  resolveSort,
  validateUploadSize,
} from "../lib/files-core.ts";

test("文件名规范化保留可见名称并生成不区分大小写的查重键", () => {
  assert.deepEqual(normalizeItemName("  项目 A.PDF  "), {
    name: "项目 A.PDF",
    nameKey: "项目 a.pdf",
  });
});

test("文件名拒绝路径字符、控制字符和特殊目录名", () => {
  for (const value of ["../secret", "a/b", "a\\b", ".", "..", "a\u0000b"]) {
    assert.throws(() => normalizeItemName(value), /文件名/);
  }
});

test("文件名拒绝空值和超过 180 个 Unicode 字符的名称", () => {
  assert.throws(() => normalizeItemName("   "), /不能为空/);
  assert.throws(() => normalizeItemName("🙂".repeat(181)), /180/);
});

test("上传大小集中限制为空文件到 25 MiB", () => {
  assert.equal(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
  assert.throws(() => validateUploadSize(0), /空文件/);
  assert.doesNotThrow(() => validateUploadSize(MAX_UPLOAD_BYTES));
  assert.throws(() => validateUploadSize(MAX_UPLOAD_BYTES + 1), /25 MB/);
});

test("排序参数只能映射到允许的列和方向", () => {
  assert.deepEqual(resolveSort("size", "asc"), {
    column: "size_bytes",
    direction: "ASC",
  });
  assert.deepEqual(resolveSort("unexpected", "drop table"), {
    column: "updated_at",
    direction: "DESC",
  });
});

test("预览仅允许图片、PDF 和受大小限制的纯文本", () => {
  assert.equal(MAX_TEXT_PREVIEW_BYTES, 256 * 1024);
  assert.equal(classifyPreview("image/png", 4_000_000), "image");
  assert.equal(classifyPreview("application/pdf", 4_000_000), "pdf");
  assert.equal(classifyPreview("text/plain", MAX_TEXT_PREVIEW_BYTES), "text");
  assert.equal(
    classifyPreview("application/json", MAX_TEXT_PREVIEW_BYTES + 1),
    "details",
  );
  assert.equal(classifyPreview("text/html", MAX_TEXT_PREVIEW_BYTES), "text");
  assert.equal(classifyPreview("application/zip", 32), "details");
});

test("下载头使用安全 ASCII 回退并保留 UTF-8 原始名称", () => {
  const value = buildContentDisposition('报告 "最终版".pdf');
  assert.match(value, /^attachment; filename="download\.pdf";/);
  assert.match(value, /filename\*=UTF-8''%E6%8A%A5%E5%91%8A/);
  assert.doesNotMatch(value, /\r|\n/);
});

test("公开文件数据绝不包含内部 R2 对象键", () => {
  const item = mapPublicItem({
    id: "file-1",
    ownerId: "owner-1",
    type: "file",
    parentId: null,
    name: "资料.pdf",
    nameKey: "资料.pdf",
    objectKey: "objects/private-random-key",
    mimeType: "application/pdf",
    sizeBytes: 128,
    isFavorite: 1,
    createdAt: 1,
    updatedAt: 2,
    lastAccessedAt: 3,
    deletedAt: null,
    originalParentId: null,
  });
  assert.equal(item.id, "file-1");
  assert.equal(item.previewKind, "pdf");
  assert.equal("objectKey" in item, false);
  assert.equal("ownerId" in item, false);
});

test("面包屑从根目录构造并在断裂父链时判为无效", () => {
  const folders = [
    { id: "a", parentId: null, name: "工作" },
    { id: "b", parentId: "a", name: "项目" },
  ];
  assert.deepEqual(buildBreadcrumb("b", folders), {
    valid: true,
    entries: [
      { id: null, name: "我的文件" },
      { id: "a", name: "工作" },
      { id: "b", name: "项目" },
    ],
  });
  assert.equal(buildBreadcrumb("missing", folders).valid, false);
});

test("目录不能移动到自身或自己的后代", () => {
  const folders = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
  ];
  assert.equal(isMoveTargetAllowed("a", "a", folders), false);
  assert.equal(isMoveTargetAllowed("a", "c", folders), false);
  assert.equal(isMoveTargetAllowed("b", null, folders), true);
});
