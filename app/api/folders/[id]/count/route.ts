import { withApiContext } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const { id } = await context.params;
    return Response.json(await store.getFolderCount(user.userId, id));
  });
}
