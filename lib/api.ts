import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { FileStoreError, type FileStore } from "./file-store.ts";
import { getFileStore } from "./server-files.ts";

type ApiContext = {
  user: ChatGPTUser;
  store: FileStore;
};

export async function withApiContext(
  handler: (context: ApiContext) => Promise<Response>,
): Promise<Response> {
  const user = await getChatGPTUser();
  if (!user) return apiError("请先使用 ChatGPT 登录", "UNAUTHENTICATED", 401);

  try {
    const store = getFileStore();
    await store.syncUser(user);
    return await handler({ user, store });
  } catch (error) {
    if (error instanceof FileStoreError) {
      return apiError(error.message, error.code, error.status);
    }
    console.error("文件操作失败", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "未知错误",
    });
    return apiError("操作失败，请稍后重试", "INTERNAL_ERROR", 500);
  }
}

export function apiError(message: string, code: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonRecord(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (!isRecord(value)) throw new FileStoreError("请求内容格式不正确", "INVALID_BODY", 400);
  if ("ownerId" in value) {
    throw new FileStoreError("不能指定文件所有者", "OWNER_NOT_ALLOWED", 400);
  }
  return value;
}

export function nullableId(value: FormDataEntryValue | unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 100) {
    throw new FileStoreError("目录参数不正确", "INVALID_PARENT", 400);
  }
  return value;
}
