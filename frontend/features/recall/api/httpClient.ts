/**
 * Live HTTP client for the frozen assembly-quality-v4 routes. Validates every envelope with the
 * shared Zod schemas. A failed or malformed response becomes an explicit error; it never falls
 * back to sample data (see mockClient.ts for the visibly labeled development mock).
 */
import { z } from "zod";
import { EntityContextSchema, IDEMPOTENCY_HEADER, apiResponseSchema, type ApiResponse } from "@/contracts/common";
import {
  CauseAssessmentSchema,
  FixRevisionSchema,
  ISSUE_ROUTES,
  InsightsSchema,
  IssueCommentSchema,
  IssueDetailSchema,
  IssuePageSchema,
  IssueSchema,
  ReferenceCatalogSchema,
  SimilarResolutionsSchema,
  VerificationSchema,
  type InsightsFilter,
  type IssueListFilter,
} from "@/contracts/issues";
import { ROUTES, TraceResultSchema } from "@/contracts/recall";
import { AGENT_CHAT_ROUTE, AgentChatResponseSchema } from "../../../agent/types";
import { clientFail, clientOk, type ClientResult, type RecallClient } from "./types";

type Method = "GET" | "POST" | "PATCH";

/** Query encoding assumption (recorded in docs/handoffs/ALI.md): arrays repeat the key. */
export function toQuery(filter: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((item) => p.append(k, String(item)));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function call<T extends z.ZodTypeAny>(
  method: Method,
  path: string,
  schema: T,
  body?: unknown,
  idempotencyKey?: string,
  baseUrl = "",
): Promise<ClientResult<z.infer<T>>> {
  let res: Response;
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey;
    res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  } catch (e) {
    return clientFail("NETWORK", `Backend unavailable: ${e instanceof Error ? e.message : "request failed"}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return clientFail("NETWORK", `Backend returned a non-JSON response (HTTP ${res.status}).`);
  }
  const parsed = apiResponseSchema(schema).safeParse(json);
  if (!parsed.success) {
    return clientFail("NETWORK", `Backend response did not match contract assembly-quality-v4 (HTTP ${res.status}).`, {
      issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const envelope = parsed.data as ApiResponse<z.infer<T>>;
  if (!envelope.ok) return clientFail(envelope.error.code, envelope.error.message, envelope.error.details);
  return clientOk(envelope.data);
}

/** `baseUrl` is only set server-side (the agent route calls the app's own routes); browsers use relative paths. */
export function createHttpClient(baseUrl = ""): RecallClient {
  const b = baseUrl;
  return {
    mode: "live",
    modeLabel: "Live API (mocks disabled)",
    getCatalog: () => call("GET", ISSUE_ROUTES.catalog.path, ReferenceCatalogSchema, undefined, undefined, b),
    getEntityContext: (entityId, configurationAsOf) =>
      call("GET", ISSUE_ROUTES.entityContext.path(entityId) + toQuery({ configurationAsOf }), EntityContextSchema, undefined, undefined, b),
    createIssue: (command) => call("POST", ISSUE_ROUTES.issueCreate.path, IssueSchema, command, command.idempotencyKey, b),
    listIssues: (filter: Partial<IssueListFilter>) => call("GET", ISSUE_ROUTES.issueList.path + toQuery(filter), IssuePageSchema, undefined, undefined, b),
    getIssue: (id) => call("GET", ISSUE_ROUTES.issueGet.path(id), IssueDetailSchema, undefined, undefined, b),
    updateIssue: (id, update) => call("PATCH", ISSUE_ROUTES.issueUpdate.path(id), IssueSchema, update, undefined, b),
    addComment: (id, input) => call("POST", ISSUE_ROUTES.issueComment.path(id), IssueCommentSchema, input, input.idempotencyKey, b),
    recordCause: (id, input) => call("POST", ISSUE_ROUTES.issueCause.path(id), CauseAssessmentSchema, input, input.idempotencyKey, b),
    createFix: (id, input) => call("POST", ISSUE_ROUTES.issueFix.path(id), FixRevisionSchema, input, input.idempotencyKey, b),
    recordVerification: (id, input) =>
      call("POST", ISSUE_ROUTES.issueVerification.path(id), VerificationSchema, input, input.idempotencyKey, b),
    transition: (id, command) => call("POST", ISSUE_ROUTES.issueTransition.path(id), IssueSchema, command, command.idempotencyKey, b),
    findSimilarResolutions: (id) => call("GET", ISSUE_ROUTES.issueSimilar.path(id), SimilarResolutionsSchema, undefined, undefined, b),
    getInsights: (filter: InsightsFilter) => call("GET", ISSUE_ROUTES.insights.path + toQuery(filter), InsightsSchema, undefined, undefined, b),
    runTrace: (incidentId, request) => call("POST", ROUTES.traceCreate.path(incidentId), TraceResultSchema, request, undefined, b),
    agentChat: (request) => call("POST", AGENT_CHAT_ROUTE, AgentChatResponseSchema, request, undefined, b),
  };
}
