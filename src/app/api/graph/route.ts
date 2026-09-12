/**
 * Thin adapter (Ali's lane, additive, read-only): the workspace graph for the Graph view and the
 * assistant's relationship tools. Zubair owns src/app; this file only delegates like api/agent/chat.
 */
import { handleGraph } from "../../../../frontend/features/recall/server/graphRead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleGraph();
}
