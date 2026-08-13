import { FileStoreError } from "@/lib/file-store";
import { nullableId, readJsonRecord, withApiContext } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const { id } = await context.params;
    const body = await readJsonRecord(request);
    let item;
    if (body.action === "rename" && typeof body.name === "string") {
      item = await store.renameItem(user.userId, id, body.name);
    } else if (body.action === "move") {
      item = await store.moveItem(user.userId, id, nullableId(body.parentId));
    } else if (body.action === "favorite" && typeof body.favorite === "boolean") {
      item = await store.setFavorite(user.userId, id, body.favorite);
    } else {
      throw new FileStoreError("不支持的文件操作", "INVALID_ACTION", 400);
    }
    return Response.json({ item });
  });
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const { id } = await context.params;
    await store.permanentlyDelete(user.userId, id);
    return new Response(null, { status: 204 });
  });
}
