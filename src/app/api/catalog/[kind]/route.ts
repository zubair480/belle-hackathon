import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await ctx.params;
  return apiHandlers().catalogUpsert(req, kind);
}
