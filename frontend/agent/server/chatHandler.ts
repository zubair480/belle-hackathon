/**
 * POST /api/agent/chat handler (server). Selects the planner from RECALL_AGENT_PROVIDER
 * (`stub` default, `qoder` for the Qoder Agent SDK) and runs the harness tools against the
 * app's own frozen routes. Returns the ApiResponse envelope. Never falls back from qoder to
 * stub silently: a missing SDK or token is reported as AI_UNAVAILABLE.
 */
import { ERROR_HTTP_STATUS, apiFail, apiOk } from "@/contracts/common";
import { createHttpClient } from "../../features/recall/api/httpClient";
import { createMockClient } from "../../features/recall/api/mockClient";
import type { RecallClient } from "../../features/recall/api/types";
import { runStubTurn } from "../stubPlanner";
import type { ToolContext } from "../tools";
import { AgentChatRequestSchema } from "../types";
import { AgentUnavailableError, runQoderTurn } from "./qoderPlanner";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const respond = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export type AgentProvider = "stub" | "qoder";

export function selectedProvider(): AgentProvider {
  return process.env.RECALL_AGENT_PROVIDER === "qoder" ? "qoder" : "stub";
}

/**
 * Data source for the server-side tools. Default: the app's own frozen routes. With
 * RECALL_AGENT_DATA=mock the tools read a server-side in-memory sample dataset instead, so the
 * Qoder planner can be exercised before Codey's and Zubair's routes exist. The server mock is a
 * separate instance from the browser mock: issues created in the browser are not visible to it.
 */
let serverMock: RecallClient | null = null;
export function toolClient(baseUrl: string): { client: RecallClient; label: string } {
  if (process.env.RECALL_AGENT_DATA === "mock") {
    serverMock ??= createMockClient({ latencyMs: 0 }).client;
    return { client: serverMock, label: "server-side dataset" };
  }
  return { client: createHttpClient(baseUrl), label: `live routes at ${baseUrl}` };
}

export async function handleAgentChat(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return respond(apiFail("VALIDATION_FAILED", "Request body is not valid JSON."), ERROR_HTTP_STATUS.VALIDATION_FAILED);
  }
  const parsed = AgentChatRequestSchema.safeParse(json);
  if (!parsed.success) return respond(apiFail("VALIDATION_FAILED", "Invalid agent chat request.", { issues: parsed.error.issues.slice(0, 10) }), ERROR_HTTP_STATUS.VALIDATION_FAILED);

  const baseUrl = process.env.RECALL_APP_BASE_URL ?? new URL(req.url).origin;
  const { client, label } = toolClient(baseUrl);
  const catalog = await client.getCatalog();
  const ctx: ToolContext = { client, catalog: catalog.ok ? catalog.data : null, context: parsed.data.context, ui: [] };
  const provider = selectedProvider();
  try {
    const response = provider === "qoder" ? await runQoderTurn(ctx, parsed.data) : await runStubTurn(ctx, parsed.data);
    if (!catalog.ok) response.warnings.push(`Reference catalog unavailable (${catalog.error.code}); names are shown as ids.`);
    return respond(apiOk(response), 200);
  } catch (e) {
    if (e instanceof AgentUnavailableError) return respond(apiFail("AI_UNAVAILABLE", e.message), ERROR_HTTP_STATUS.AI_UNAVAILABLE);
    const msg = e instanceof Error ? e.message : "Agent turn failed.";
    return respond(apiFail("AI_OUTPUT_REJECTED", msg.replace(/(token|key|secret)\S*/gi, "[redacted]").slice(0, 300)), ERROR_HTTP_STATUS.AI_OUTPUT_REJECTED);
  }
}
