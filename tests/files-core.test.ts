import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TEXT_PREVIEW_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_BATCH_ITEMS,
  UPLOAD_PART_BYTES,
  buildBreadcrumb,
  buildContentDisposition,
  classifyPreview,
  decodePageCursor,
  encodePageCursor,
  isMoveTargetAllowed,
  mapPublicItem,
  normalizeItemName,
  parseRelativeFilePath,
  resolveSort,
  validateBatchItemIds,
  validateCompletedParts,
  validateUploadPart,
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

test("上传大小集中限制为空文件到 5 GiB", () => {
  assert.equal(MAX_UPLOAD_BYTES, 5 * 1024 * 1024 * 1024);
  assert.throws(() => validateUploadSize(0), /空文件/);
  assert.doesNotThrow(() => validateUploadSize(MAX_UPLOAD_BYTES));
  assert.throws(() => validateUploadSize(MAX_UPLOAD_BYTES + 1), /5 GB/);
});

test("上传分片固定为 8 MiB，最后一片允许更小", () => {
  assert.equal(UPLOAD_PART_BYTES, 8 * 1024 * 1024);
  const totalSize = UPLOAD_PART_BYTES * 2 + 7;
  assert.doesNotThrow(() => validateUploadPart(1, UPLOAD_PART_BYTES, totalSize));
  assert.doesNotThrow(() => validateUploadPart(2, UPLOAD_PART_BYTES, totalSize));
  assert.doesNotThrow(() => validateUploadPart(3, 7, totalSize));
  assert.throws(() => validateUploadPart(1, 7, totalSize), /分片大小/);
  assert.throws(() => validateUploadPart(4, 1, totalSize), /分片编号/);
});

test("完成上传拒绝缺片、重复片和空 ETag", () => {
  const totalSize = UPLOAD_PART_BYTES + 1;
  assert.deepEqual(
    validateCompletedParts(totalSize, [
      { partNumber: 2, etag: "etag-2" },
      { partNumber: 1, etag: "etag-1" },
    ]),
    [
      { partNumber: 1, etag: "etag-1" },
      { partNumber: 2, etag: "etag-2" },
    ],
  );
  assert.throws(
    () => validateCompletedParts(totalSize, [{ partNumber: 1, etag: "etag-1" }]),
    /分片不完整/,
  );
  assert.throws(
    () => validateCompletedParts(totalSize, [
      { partNumber: 1, etag: "etag-1" },
      { partNumber: 1, etag: "etag-1-copy" },
    ]),
    /分片编号/,
  );
});

test("文件夹相对路径逐段校验并拆分目录与文件名", () => {
  assert.deepEqual(parseRelativeFilePath("项目/素材/封面.png"), {
    directories: ["项目", "素材"],
    fileName: "封面.png",
    relativePath: "项目/素材/封面.png",
  });
  assert.throws(() => parseRelativeFilePath("../secret.txt"), /相对路径/);
  assert.throws(() => parseRelativeFilePath("项目//secret.txt"), /相对路径/);
});

test("批量操作只接受最多 100 个不重复项目", () => {
  assert.equal(MAX_BATCH_ITEMS, 100);
  assert.deepEqual(validateBatchItemIds(["a", "b"]), ["a", "b"]);
  assert.throws(() => validateBatchItemIds(["a", "a"]), /重复/);
  assert.throws(
    () => validateBatchItemIds(Array.from({ length: 101 }, (_, index) => `id-${index}`)),
    /100/,
  );
});

test("分页游标隐藏偏移量并拒绝篡改值", () => {
  const cursor = encodePageCursor(100);
  assert.notEqual(cursor, "100");
  assert.equal(decodePageCursor(cursor), 100);
  assert.equal(decodePageCursor(null), 0);
  assert.throws(() => decodePageCursor("not-a-cursor"), /分页游标/);
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
