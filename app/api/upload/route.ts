import { FileStoreError } from "@/lib/file-store";
import { nullableId, withApiContext } from "@/lib/api";

export async function POST(request: Request): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const formData = await request.formData();
    if (formData.has("ownerId")) {
      throw new FileStoreError("不能指定文件所有者", "OWNER_NOT_ALLOWED", 400);
    }
    const value = formData.get("file");
    if (!(value instanceof File)) {
      throw new FileStoreError("请选择要上传的文件", "FILE_REQUIRED", 400);
    }
    const item = await store.uploadFile(
      user.userId,
      nullableId(formData.get("parentId")),
      value,
    );
    return Response.json({ item }, { status: 201 });
  });
}
