/**
 * Agent harness contract (Ali's lane). The chat UI, the browser stub planner and the server
 * Qoder planner all speak these types. UI actions are proposals the browser executes; the
 * agent never writes to the issue store, closes issues or confirms causes.
 */
import { z } from "zod";

export const AGENT_CHAT_ROUTE = "/api/agent/chat" as const;

export const UiActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("select_vehicle"), buildId: z.string() }),
  z.object({ type: z.literal("focus_part"), entityId: z.string(), slot: z.string().nullable() }),
  z.object({ type: z.literal("mark"), entityId: z.string().nullable(), slot: z.string().nullable(), wireId: z.string().nullable(), note: z.string(), zoneId: z.string().nullable().default(null), zoneLabel: z.string().nullable().default(null) }),
  z.object({ type: z.literal("clear_marks") }),
  z.object({ type: z.literal("highlight_circuit"), circuitId: z.string().nullable() }),
  z.object({ type: z.literal("show_wiring"), on: z.boolean() }),
  z.object({ type: z.literal("camera"), preset: z.enum(["iso", "left", "right", "front", "rear", "top"]) }),
  z.object({ type: z.literal("open_issue"), issueId: z.string() }),
  z.object({ type: z.literal("open_new_issue"), entityIds: z.array(z.string()), title: z.string().nullable(), note: z.string() }),
  z.object({ type: z.literal("navigate"), view: z.enum(["vehicles", "issues", "resolutions", "insights"]) }),
]);
export type UiAction = z.infer<typeof UiActionSchema>;

export const ToolCallRecordSchema = z.object({
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
  /** Short, human-readable outcome shown in the chat as a tool chip. */
  summary: z.string(),
  ok: z.boolean(),
});
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

export const AgentMessageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) });
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

/** What the browser tells the planner about where the user is. */
export const AgentContextSchema = z.object({
  vehicleBuildId: z.string().nullable(),
  selectedEntityId: z.string().nullable(),
  view: z.enum(["vehicles", "issues", "resolutions", "insights"]),
  openIssueId: z.string().nullable(),
});
export type AgentContext = z.infer<typeof AgentContextSchema>;

export const AgentChatRequestSchema = z.object({
  messages: z.array(AgentMessageSchema).min(1).max(40),
  context: AgentContextSchema,
  sessionId: z.string().max(128).nullable().default(null),
});
export type AgentChatRequest = z.infer<typeof AgentChatRequestSchema>;

export const AgentChatResponseSchema = z.object({
  reply: z.string(),
  toolCalls: z.array(ToolCallRecordSchema),
  uiActions: z.array(UiActionSchema),
  provider: z.object({ name: z.string(), mode: z.enum(["live", "stub"]), model: z.string().nullable() }),
  sessionId: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type AgentChatResponse = z.infer<typeof AgentChatResponseSchema>;
