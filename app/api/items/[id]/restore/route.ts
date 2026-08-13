import { withApiContext } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, store }) => {
    const { id } = await context.params;
    await store.restoreItem(user.userId, id);
    return new Response(null, { status: 204 });
  });
}
