import { withApiContext } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, uploads }) => {
    const { id } = await context.params;
    const item = await uploads.completeSession(user.userId, id);
    return Response.json({ item }, { status: 201 });
  });
}
