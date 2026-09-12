/**
 * Live HTTP client for the frozen assembly-quality-v4 routes. Validates every envelope with the
 * shared Zod schemas. A failed or malformed response becomes an explicit error; it never falls
 * back to sample data (see mockClient.ts for the visibly labeled development mock).
 */
import { z } from "zod";
import { WorkspaceGraphSchema } from "../graph/model";
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
export const HEALTH_ROUTE = "/api/health" as const;
/** Additive read-only route (Ali's lane): the workspace graph from Neo4j. Thin adapter in src/app/api/graph. */
export const GRAPH_ROUTE = "/api/graph" as const;
const CatalogItemLooseSchema = z.looseObject({ id: z.string(), name: z.string(), active: z.boolean().default(true) });
/** Additive route (Ali's lane): platform design read from Neo4j. Thin adapter in src/app/api/platform/design. */
export const PLATFORM_DESIGN_ROUTE = "/api/platform/design" as const;
const BackendHealthSchema = z.looseObject({ ok: z.boolean(), contractVersion: z.string(), servicesMode: z.string(), servicesRegistered: z.boolean(), neo4jConfigured: z.boolean(), aiProvider: z.string(), workspaceId: z.string().nullable() });
const PlatformDesignSchema = z.object({
  platform: z.string(),
  revision: z.string(),
  source: z.enum(["neo4j", "bundled"]),
  counts: z.object({ slots: z.number(), wires: z.number(), circuits: z.number(), connectors: z.number() }),
  slotIds: z.array(z.string()),
  wireIds: z.array(z.string()),
  circuitIds: z.array(z.string()),
});

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
    getHealth: () => call("GET", HEALTH_ROUTE, BackendHealthSchema, undefined, undefined, b),
    getPlatformDesign: () => call("GET", PLATFORM_DESIGN_ROUTE, PlatformDesignSchema, undefined, undefined, b),
    getGraph: () => call("GET", GRAPH_ROUTE, WorkspaceGraphSchema, undefined, undefined, b),
    upsertCatalogItem: (kind, item) => call("POST", ISSUE_ROUTES.catalogUpsert.path(kind), CatalogItemLooseSchema, item, undefined, b),
  };
}
