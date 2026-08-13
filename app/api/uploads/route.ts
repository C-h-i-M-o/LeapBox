import { nullableId, readJsonRecord, withApiContext } from "@/lib/api";
import { FileStoreError } from "@/lib/file-store";

export async function POST(request: Request): Promise<Response> {
  return withApiContext(async ({ user, uploads }) => {
    const body = await readJsonRecord(request);
    if (typeof body.name !== "string" || typeof body.sizeBytes !== "number") {
      throw new FileStoreError("上传文件参数不完整", "INVALID_UPLOAD", 400);
    }
    if (body.relativePath !== null && body.relativePath !== undefined && typeof body.relativePath !== "string") {
      throw new FileStoreError("文件相对路径不正确", "INVALID_RELATIVE_PATH", 400);
    }
    if (body.mimeType !== undefined && typeof body.mimeType !== "string") {
      throw new FileStoreError("文件类型不正确", "INVALID_MIME_TYPE", 400);
    }
    const session = await uploads.createSession(user.userId, {
      parentId: nullableId(body.parentId),
      name: body.name,
      relativePath: typeof body.relativePath === "string" ? body.relativePath : null,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream",
      sizeBytes: body.sizeBytes,
    });
    return Response.json({ session }, { status: 201 });
  });
}
