import { FileStoreError } from "@/lib/file-store";
import { readJsonRecord, withApiContext } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const { id } = await context.params;
    const body = await readJsonRecord(request);
    const confirmedCount = body.confirmedCount;
    if (confirmedCount !== undefined && !Number.isSafeInteger(confirmedCount)) {
      throw new FileStoreError("确认数量不正确", "INVALID_CONFIRMATION", 400);
    }
    await store.trashItem(
      user.userId,
      id,
      typeof confirmedCount === "number" ? confirmedCount : undefined,
    );
    return new Response(null, { status: 204 });
  });
}
