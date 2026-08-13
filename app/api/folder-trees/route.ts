import { nullableId, readJsonRecord, withApiContext } from "@/lib/api";
import { FileStoreError } from "@/lib/file-store";

export async function POST(request: Request): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const body = await readJsonRecord(request);
    if (!Array.isArray(body.paths) || body.paths.some((path) => typeof path !== "string")) {
      throw new FileStoreError("文件夹路径不正确", "INVALID_FOLDER_TREE", 400);
    }
    const mapping = await store.createFolderTree(
      user.userId,
      nullableId(body.parentId),
      body.paths,
    );
    return Response.json({ mapping }, { status: 201 });
  });
}
