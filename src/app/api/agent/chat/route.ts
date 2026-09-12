/**
 * Thin adapter for the agent chat harness (Ali's lane, frontend/agent). Zubair owns src/app;
 * this file only delegates, like the RecallWorkspace mount in page.tsx.
 */
import { handleAgentChat } from "../../../../../frontend/agent/server/chatHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handleAgentChat(req);
}
