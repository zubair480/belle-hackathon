import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

/** Bounded, read-only server tools for the in-app agent. No Cypher, no writes, no credentials. */
export async function POST(req: Request): Promise<Response> {
  return apiHandlers().agentTool(req);
}
