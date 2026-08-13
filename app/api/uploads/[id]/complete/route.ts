import { isRecord, readJsonRecord, withApiContext } from "@/lib/api";
import { FileStoreError } from "@/lib/file-store";
import type { UploadedPart } from "@/lib/files-core";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, uploads }) => {
    const { id } = await context.params;
    const body = await readJsonRecord(request);
    if (!Array.isArray(body.parts)) {
      throw new FileStoreError("上传分片清单不正确", "INVALID_PARTS", 400);
    }
    const parts: UploadedPart[] = body.parts.map((value) => {
      if (
        !isRecord(value) ||
        typeof value.partNumber !== "number" ||
        typeof value.etag !== "string"
      ) {
        throw new FileStoreError("上传分片清单不正确", "INVALID_PARTS", 400);
      }
      return { partNumber: value.partNumber, etag: value.etag };
    });
    const item = await uploads.completeSession(user.userId, id, parts);
    return Response.json({ item }, { status: 201 });
  });
}
