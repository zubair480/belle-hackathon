import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return apiHandlers().issuesExport(req);
}
