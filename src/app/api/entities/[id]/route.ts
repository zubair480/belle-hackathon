import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return apiHandlers().entityContext(req, id);
}
