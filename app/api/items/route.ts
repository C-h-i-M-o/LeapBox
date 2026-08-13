import { nullableId, withApiContext } from "@/lib/api";
import { type FileView } from "@/lib/file-store";

const VIEWS = new Set<FileView>(["files", "recent", "favorites", "trash", "search"]);

export async function GET(request: Request): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const url = new URL(request.url);
    const rawView = url.searchParams.get("view") ?? "files";
    const view: FileView = VIEWS.has(rawView as FileView) ? (rawView as FileView) : "files";
    const listing = await store.listItems(user.userId, {
      view,
      parentId: nullableId(url.searchParams.get("parentId")),
      query: url.searchParams.get("query") ?? "",
      sort: url.searchParams.get("sort"),
      direction: url.searchParams.get("direction"),
      cursor: url.searchParams.get("cursor"),
    });
    return Response.json({
      ...listing,
      notice: listing.validDirectory ? null : "目标文件夹不存在，已返回我的文件",
    });
  });
}
