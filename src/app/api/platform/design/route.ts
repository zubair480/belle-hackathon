/**
 * Thin adapter (Ali's lane, additive): the platform design dataset as stored in Neo4j.
 * Zubair owns src/app; this file only delegates, like api/agent/chat and the page mount.
 */
import { handlePlatformDesign } from "../../../../../frontend/features/recall/server/platformDesign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handlePlatformDesign();
}
