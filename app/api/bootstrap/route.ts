import { MAX_UPLOAD_BYTES } from "@/lib/files-core";
import { type FileView } from "@/lib/file-store";
import { nullableId, withApiContext } from "@/lib/api";

const VIEWS = new Set<FileView>(["files", "recent", "favorites", "trash", "search"]);

export async function GET(request: Request): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const url = new URL(request.url);
    const rawView = url.searchParams.get("view") ?? "files";
    const view: FileView = VIEWS.has(rawView as FileView) ? (rawView as FileView) : "files";
    const parentId = nullableId(url.searchParams.get("parentId"));
    const [listing, storage, folders] = await Promise.all([
      store.listItems(user.userId, {
        view,
        parentId,
        query: url.searchParams.get("query") ?? "",
        sort: url.searchParams.get("sort"),
        direction: url.searchParams.get("direction"),
        cursor: url.searchParams.get("cursor"),
      }),
      store.getStorageSummary(user.userId),
      store.getFolderOptions(user.userId),
    ]);

    return Response.json({
      user: { displayName: user.displayName, email: user.email },
      upload: { maxBytes: MAX_UPLOAD_BYTES, maxLabel: "5 GB" },
      storage,
      folders,
      ...listing,
      notice: listing.validDirectory ? null : "目标文件夹不存在，已返回我的文件",
    });
  });
}
