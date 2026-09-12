/**
 * Qoder Agent SDK planner (server only). Wraps the harness tools as an in-process MCP server
 * and runs one turn through `query()` from @qoder-ai/qoder-agent-sdk.
 *
 * The SDK is loaded dynamically so the app typechecks and builds without it; when it is not
 * installed, or QODER_PERSONAL_ACCESS_TOKEN is missing, the handler answers AI_UNAVAILABLE.
 * The SDK launches the local `qodercli` binary (found on PATH or bundled with the package).
 * Install: npm install @qoder-ai/qoder-agent-sdk (Zubair owns dependency changes).
 * Docs consulted 2026-09-12: https://docs.qoder.com/cli/sdk/quick-start.md,
 * .../references-typescript.md, .../tools.md, .../mcp.md, .../authentication.md.
 */
import { z } from "zod";
import { ALL_TOOLS, SYSTEM_PROMPT, runTool, type ToolContext } from "../tools";
import type { AgentChatRequest, AgentChatResponse, ToolCallRecord } from "../types";

export class AgentUnavailableError extends Error {}

type SdkToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
type SdkModule = {
  query: (args: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<unknown>;
  tool: (name: string, description: string, schema: z.ZodRawShape, handler: (input: Record<string, unknown>) => Promise<SdkToolResult>, extra?: Record<string, unknown>) => unknown;
  createSdkMcpServer: (args: { name: string; tools: unknown[] }) => unknown;
  accessTokenFromEnv: () => unknown;
};

const SDK_PACKAGE = "@qoder-ai/qoder-agent-sdk";

async function loadSdk(): Promise<SdkModule | null> {
  try {
    // Indirect import keeps bundlers from resolving the optional package at build time.
    const importer = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
    const mod = (await importer(SDK_PACKAGE)) as Partial<SdkModule>;
    if (typeof mod.query !== "function" || typeof mod.tool !== "function" || typeof mod.createSdkMcpServer !== "function") return null;
    return mod as SdkModule;
  } catch {
    return null;
  }
}

/** Pull text out of an SDK message without depending on exact field names. */
function textOf(msg: unknown): string {
  const m = msg as { type?: string; message?: { content?: unknown }; content?: unknown; text?: string };
  const content = m.message?.content ?? m.content;
  if (typeof m.text === "string") return m.text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "")).join("");
  return "";
}

export function transcriptPrompt(request: AgentChatRequest): string {
  const ctx = request.context;
  const header = `Current screen: view=${ctx.view}, vehicle=${ctx.vehicleBuildId ?? "none"}, selected part=${ctx.selectedEntityId ?? "none"}, open issue=${ctx.openIssueId ?? "none"}.`;
  const turns = request.messages.slice(-12).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
  return `${header}\n\n${turns}\n\nAnswer the last user message using the tools.`;
}

export async function runQoderTurn(ctx: ToolContext, request: AgentChatRequest): Promise<AgentChatResponse> {
  if (!process.env.QODER_PERSONAL_ACCESS_TOKEN) throw new AgentUnavailableError("QODER_PERSONAL_ACCESS_TOKEN is not set on the server. Generate a PAT at qoder.com/account/integrations and set it as an environment variable (never in code).");
  const sdk = await loadSdk();
  if (!sdk) throw new AgentUnavailableError(`${SDK_PACKAGE} is not installed. Run: npm install ${SDK_PACKAGE} (dependency change goes through Zubair).`);

  const records: ToolCallRecord[] = [];
  const tools = ALL_TOOLS.map((t) =>
    sdk.tool(
      t.name,
      t.description,
      t.input,
      async (input) => {
        const { record, result } = await runTool(ctx, t.name, input);
        records.push(record);
        return { content: [{ type: "text", text: result.text }], ...(result.ok === false ? { isError: true } : {}) };
      },
      { annotations: { readOnlyHint: t.readOnly } },
    ),
  );
  const server = sdk.createSdkMcpServer({ name: "recall", tools });
  const allowed = ALL_TOOLS.map((t) => `mcp__recall__${t.name}`);

  const options: Record<string, unknown> = {
    auth: sdk.accessTokenFromEnv(),
    mcpServers: { recall: server },
    allowedTools: allowed,
    /** No file/shell tools: the agent only gets the harness tools. */
    tools: [],
    systemPrompt: SYSTEM_PROMPT,
    permissionMode: "dontAsk",
    maxTurns: Number(process.env.RECALL_AGENT_MAX_TURNS ?? 8),
    model: process.env.QODER_MODEL ?? "auto",
    cwd: process.env.RECALL_AGENT_CWD ?? process.cwd(),
  };
  if (request.sessionId) {
    options.resume = request.sessionId;
    options.continue = true;
  }

  let reply = "";
  let sessionId: string | null = request.sessionId ?? null;
  const q = sdk.query({ prompt: transcriptPrompt(request), options }) as AsyncIterable<unknown> & { close?: () => Promise<void> };
  try {
    for await (const raw of q) {
      // Verified against @qoder-ai/qoder-agent-sdk 1.0.39 types: `type`, `session_id`, and for
      // assistant messages `message.content[]` text blocks.
      const msg = raw as { type?: string; session_id?: string; subtype?: string; is_error?: boolean; error?: unknown };
      if (msg.session_id) sessionId = msg.session_id;
      if (process.env.RECALL_AGENT_DEBUG === "1") {
        const m = raw as { type?: string; subtype?: string; event?: { type?: string }; message?: { content?: unknown; id?: string } };
        console.log(`[agent-debug] type=${m.type} subtype=${m.subtype ?? ""} event=${m.event?.type ?? ""} msgId=${m.message?.id ?? ""} text=${JSON.stringify(textOf(raw)).slice(0, 90)} blocks=${Array.isArray(m.message?.content) ? (m.message!.content as Array<{ type?: string }>).map((b) => b.type).join(",") : typeof m.message?.content}`);
      }
      if (msg.type === "assistant") reply += textOf(raw);
      if (msg.type === "result" && msg.is_error) throw new Error(`Qoder agent returned an error result: ${JSON.stringify(msg.error ?? msg.subtype ?? "unknown")}`);
    }
  } finally {
    await q.close?.().catch(() => undefined);
  }
  return {
    reply: reply.trim() || (records.length ? records.map((r) => r.summary).join("\n") : "The agent returned no text."),
    toolCalls: records,
    uiActions: ctx.ui,
    provider: { name: "Qoder Agent SDK", mode: "live", model: String(options.model) },
    sessionId,
    warnings: [],
  };
}
