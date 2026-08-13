import { FileStoreError } from "@/lib/file-store";
import { nullableId, readJsonRecord, withApiContext } from "@/lib/api";

export async function POST(request: Request): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const body = await readJsonRecord(request);
    if (typeof body.name !== "string") {
      throw new FileStoreError("请输入文件夹名称", "NAME_REQUIRED", 400);
    }
    const folder = await store.createFolder(
      user.userId,
      body.name,
      nullableId(body.parentId),
    );
    return Response.json({ item: folder }, { status: 201 });
  });
}
