import { withApiContext } from "@/lib/api";
import { FileStoreError } from "@/lib/file-store";

type RouteContext = { params: Promise<{ id: string; partNumber: string }> };

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, uploads }) => {
    const { id, partNumber: rawPartNumber } = await context.params;
    const partNumber = Number(rawPartNumber);
    const sizeBytes = Number(
      request.headers.get("content-length") ?? request.headers.get("x-upload-part-size"),
    );
    if (!request.body) {
      throw new FileStoreError("上传分片内容为空", "EMPTY_PART", 400);
    }
    if (!Number.isSafeInteger(partNumber) || !Number.isSafeInteger(sizeBytes)) {
      throw new FileStoreError("上传分片参数不正确", "INVALID_PART", 400);
    }
    const part = await uploads.uploadPart(
      user.userId,
      id,
      partNumber,
      request.body,
      sizeBytes,
    );
    return Response.json({ part });
  });
}
