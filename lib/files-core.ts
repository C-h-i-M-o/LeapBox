export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_PREVIEW_BYTES = 256 * 1024;

export type ItemType = "file" | "folder";
export type SortKey = "name" | "type" | "size" | "updated";
export type SortDirection = "ASC" | "DESC";
export type PreviewKind = "image" | "pdf" | "text" | "details";

export type NormalizedItemName = {
  name: string;
  nameKey: string;
};

export type ResolvedSort = {
  column: "name_key" | "type" | "size_bytes" | "updated_at";
  direction: SortDirection;
};

export type ItemRecord = {
  id: string;
  ownerId: string;
  type: ItemType;
  parentId: string | null;
  name: string;
  nameKey: string;
  objectKey: string | null;
  mimeType: string | null;
  sizeBytes: number;
  isFavorite: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  deletedAt: number | null;
  originalParentId: string | null;
};

export type PublicItem = {
  id: string;
  type: ItemType;
  parentId: string | null;
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  deletedAt: number | null;
  previewKind: PreviewKind;
  location?: string;
};

export type FolderLink = {
  id: string;
  parentId: string | null;
  name?: string;
};

export type BreadcrumbEntry = {
  id: string | null;
  name: string;
};

const SORT_COLUMNS: Record<SortKey, ResolvedSort["column"]> = {
  name: "name_key",
  type: "type",
  size: "size_bytes",
  updated: "updated_at",
};

const TEXT_MIME_TYPES = new Set([
  "application/csv",
  "application/json",
  "application/ld+json",
  "application/markdown",
  "application/xml",
  "application/x-ndjson",
  "text/csv",
  "text/markdown",
]);

export function normalizeItemName(value: string): NormalizedItemName {
  const name = value.trim().normalize("NFC");
  if (!name) {
    throw new Error("文件名不能为空");
  }
  if (Array.from(name).length > 180) {
    throw new Error("文件名不能超过 180 个字符");
  }
  const hasControlCharacter = Array.from(name).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\") || hasControlCharacter) {
    throw new Error("文件名包含不允许的字符");
  }
  return { name, nameKey: name.toLocaleLowerCase() };
}

export function validateUploadSize(sizeBytes: number): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("不能上传空文件");
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error("单个文件不能超过 25 MB");
  }
}

export function resolveSort(sort: string | null, direction: string | null): ResolvedSort {
  const key: SortKey =
    sort === "name" || sort === "type" || sort === "size" || sort === "updated"
      ? sort
      : "updated";
  return {
    column: SORT_COLUMNS[key],
    direction: direction === "asc" ? "ASC" : "DESC",
  };
}

export function classifyPreview(mimeType: string, sizeBytes: number): PreviewKind {
  const normalizedMime = mimeType.toLocaleLowerCase().split(";", 1)[0].trim();
  if (normalizedMime.startsWith("image/")) return "image";
  if (normalizedMime === "application/pdf") return "pdf";
  if (
    sizeBytes <= MAX_TEXT_PREVIEW_BYTES &&
    (normalizedMime.startsWith("text/") || TEXT_MIME_TYPES.has(normalizedMime))
  ) {
    return "text";
  }
  return "details";
}

export function buildContentDisposition(fileName: string): string {
  const normalized = normalizeItemName(fileName).name.replace(/[\r\n]/gu, "");
  const extensionMatch = normalized.match(/(\.[a-zA-Z0-9]{1,10})$/u);
  const fallback = `download${extensionMatch?.[1]?.toLocaleLowerCase() ?? ""}`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(normalized)}`;
}

export function mapPublicItem(record: ItemRecord, location?: string): PublicItem {
  return {
    id: record.id,
    type: record.type,
    parentId: record.parentId,
    name: record.name,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    isFavorite: record.isFavorite === 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastAccessedAt: record.lastAccessedAt,
    deletedAt: record.deletedAt,
    previewKind:
      record.type === "file"
        ? classifyPreview(record.mimeType ?? "application/octet-stream", record.sizeBytes)
        : "details",
    ...(location ? { location } : {}),
  };
}

export function buildBreadcrumb(
  targetId: string | null,
  folders: FolderLink[],
): { valid: boolean; entries: BreadcrumbEntry[] } {
  const root: BreadcrumbEntry = { id: null, name: "我的文件" };
  if (targetId === null) return { valid: true, entries: [root] };

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: BreadcrumbEntry[] = [];
  const visited = new Set<string>();
  let currentId: string | null = targetId;

  while (currentId !== null) {
    if (visited.has(currentId)) return { valid: false, entries: [root] };
    visited.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) return { valid: false, entries: [root] };
    path.push({ id: folder.id, name: folder.name ?? "未命名文件夹" });
    currentId = folder.parentId;
  }

  return { valid: true, entries: [root, ...path.reverse()] };
}

export function isMoveTargetAllowed(
  movingFolderId: string,
  targetParentId: string | null,
  folders: Pick<FolderLink, "id" | "parentId">[],
): boolean {
  if (targetParentId === null) return true;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  let currentId: string | null = targetParentId;

  while (currentId !== null) {
    if (currentId === movingFolderId || visited.has(currentId)) return false;
    visited.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) return false;
    currentId = folder.parentId;
  }
  return true;
}
