import { withApiContext } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, uploads }) => {
    const { id } = await context.params;
    return Response.json({ session: await uploads.getSession(user.userId, id) });
  });
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  return withApiContext(async ({ user, uploads }) => {
    const { id } = await context.params;
    await uploads.abortSession(user.userId, id);
    return new Response(null, { status: 204 });
  });
}
