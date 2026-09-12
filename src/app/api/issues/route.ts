import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return apiHandlers().issueCreate(req);
}

export async function GET(req: Request): Promise<Response> {
  return apiHandlers().issueList(req);
}
