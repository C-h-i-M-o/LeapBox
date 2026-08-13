import { buildContentDisposition, classifyPreview } from "@/lib/files-core";
import { FileStoreError } from "@/lib/file-store";
import { withApiContext } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const { id } = await context.params;
    const mode = new URL(request.url).searchParams.get("mode") ?? "download";
    if (mode !== "download" && mode !== "preview") {
      throw new FileStoreError("内容访问方式不正确", "INVALID_CONTENT_MODE", 400);
    }
    const item = await store.getFile(user.userId, id, false);
    const object = await store.getObject(item);
    const previewKind = classifyPreview(
      item.mimeType ?? "application/octet-stream",
      item.sizeBytes,
    );
    if (mode === "preview" && previewKind === "details") {
      throw new FileStoreError("此文件类型不支持站内预览", "PREVIEW_UNAVAILABLE", 415);
    }
    await store.touchFile(user.userId, item.id);

    const disposition = buildContentDisposition(item.name);
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": mode === "download" ? disposition : disposition.replace(/^attachment/u, "inline"),
      "Content-Length": String(object.size),
      "Content-Type": item.mimeType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    if (mode === "preview" && previewKind === "text") {
      headers.set("Content-Type", "text/plain; charset=utf-8");
      return new Response(await object.arrayBuffer(), { headers });
    }
    return new Response(object.body, { headers });
  });
}
