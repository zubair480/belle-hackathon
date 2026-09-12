import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return apiHandlers().issueSimilar(id);
}
