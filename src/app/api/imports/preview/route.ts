import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return apiHandlers().importPreview(req);
}
