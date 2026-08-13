import { nullableId, readJsonRecord, withApiContext } from "@/lib/api";
import { FileStoreError, type BatchItemsInput } from "@/lib/file-store";

export async function POST(request: Request): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const body = await readJsonRecord(request);
    const action = body.action;
    if (action === "trash-preview") {
      return Response.json(await store.getBatchTrashCount(user.userId, body.ids));
    }
    let input: BatchItemsInput;
    if (action === "move") {
      input = { action, ids: body.ids, parentId: nullableId(body.parentId) };
    } else if (action === "favorite") {
      if (typeof body.favorite !== "boolean") {
        throw new FileStoreError("收藏状态不正确", "INVALID_FAVORITE", 400);
      }
      input = { action, ids: body.ids, favorite: body.favorite };
    } else if (action === "trash") {
      const confirmedDescendantCount = body.confirmedDescendantCount;
      if (
        confirmedDescendantCount !== undefined &&
        (typeof confirmedDescendantCount !== "number" ||
          !Number.isSafeInteger(confirmedDescendantCount) ||
          confirmedDescendantCount < 0)
      ) {
        throw new FileStoreError("确认数量不正确", "INVALID_CONFIRMATION", 400);
      }
      input = {
        action,
        ids: body.ids,
        ...(typeof confirmedDescendantCount === "number"
          ? { confirmedDescendantCount }
          : {}),
      };
    } else if (action === "restore" || action === "delete") {
      input = { action, ids: body.ids };
    } else {
      throw new FileStoreError("不支持的批量操作", "INVALID_BATCH_ACTION", 400);
    }
    return Response.json(await store.batchItems(user.userId, input));
  });
}
