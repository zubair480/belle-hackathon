import { z } from "zod";
import { CONTRACT_VERSION, IDEMPOTENCY_HEADER, IdSchema, UtcIsoSchema, type RequestContext } from "@/contracts/common";
import {
  AgentToolRequestSchema,
  CatalogKindSchema,
  CatalogUpsertSchema,
  CauseAssessmentInputSchema,
  CreateIssueCommandSchema,
  FixRevisionInputSchema,
  InsightsFilterSchema,
  IssueCommentInputSchema,
  IssueDetailSchema,
  IssueDraftRequestSchema,
  IssueListFilterSchema,
  IssueUpdateSchema,
  TransitionCommandSchema,
  VerificationInputSchema,
} from "@/contracts/issues";
import {
  AcceptImportRequestSchema,
  AlertExtractRequestSchema,
  ImportInputSchema,
  LateEvidencePreviewRequestSchema,
  TraceRequestSchema,
  TraceResultSchema,
  type DomainServices,
  type TraceResult,
} from "@/contracts/recall";
import { draftIssueFromText, explainResolutions, extractAlertDraft } from "@/server/ai/features";
import type { StructuredOutputProvider } from "@/server/ai/provider";
import { issuesToCsv, safeFileName, traceToCsv } from "./export";
import { HttpError, InFlightGuard, jsonOk, readJsonBody, toErrorResponse, validate, withTimeout } from "./http";

export type HandlerDeps = {
  services: () => DomainServices;
  context: () => RequestContext;
  /** Configured AI provider or null (manual entry only). May throw AI_UNAVAILABLE. */
  aiProvider: () => StructuredOutputProvider | null;
  serviceTimeoutMs: number;
  aiTimeoutMs: number;
  describeWiring: () => Record<string, string | boolean | null>;
};

/** Query-string parsing for list/insight filters (arrays via repeated or comma-separated keys). */
function queryToObject(url: string): Record<string, unknown> {
  const params = new URL(url).searchParams;
  const arrayKeys = new Set(["status", "severity"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of params.entries()) {
    if (arrayKeys.has(k)) {
      const list = (out[k] as string[] | undefined) ?? [];
      list.push(...v.split(",").filter(Boolean));
      out[k] = list;
    } else if (k === "limit") out[k] = Number(v);
    else if (k === "cursor") out[k] = v === "" ? null : v;
    else if (v !== "") out[k] = v;
  }
  return out;
}

const csvResponse = (csv: string, fileName: string, extra: Record<string, string> = {}) =>
  new Response(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store", ...extra } });

/**
 * Framework-agnostic HTTP handlers. Route files under src/app/api are one-line adapters so the
 * same handlers run in tests against typed service doubles.
 */
export function createHandlers(deps: HandlerDeps) {
  const guard = new InFlightGuard();
  const run = async (work: () => Promise<Response>): Promise<Response> => {
    try {
      return await work();
    } catch (e) {
      return toErrorResponse(e);
    }
  };
  const call = <T>(label: string, work: (s: DomainServices, ctx: RequestContext) => Promise<T>): Promise<T> => {
    const s = deps.services();
    const ctx = deps.context();
    return withTimeout(work(s, ctx), deps.serviceTimeoutMs, label);
  };
  const requireAi = (): StructuredOutputProvider => {
    const p = deps.aiProvider();
    if (!p) throw new HttpError("AI_UNAVAILABLE", "No runtime AI provider is configured (RECALL_AI_PROVIDER=none). Enter the fields manually.");
    return p;
  };
  const assertRunShape = (value: unknown): TraceResult => {
    const r = TraceResultSchema.safeParse(value);
    if (!r.success) throw new HttpError("INTERNAL", "Domain service returned a trace that violates the contract.", { issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) });
    return r.data;
  };
  const withHeaderKey = async (req: Request): Promise<Record<string, unknown>> => {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const header = req.headers.get(IDEMPOTENCY_HEADER);
    if (header && typeof body === "object" && body !== null && body.idempotencyKey === undefined) body.idempotencyKey = header;
    return body;
  };
  const issueId = (raw: string) => validate(IdSchema, raw, "issue id");

  return {
    // ----- health -----
    health: () => run(async () => jsonOk({ ok: true, contractVersion: CONTRACT_VERSION, ...deps.describeWiring() })),

    // ----- catalogs and entities -----
    catalog: () => run(async () => jsonOk(await call("catalog", (s, c) => s.getCatalog(c)))),
    catalogUpsert: (req: Request, kindRaw: string) =>
      run(async () => {
        const kind = validate(CatalogKindSchema, kindRaw, "catalog kind");
        const item = validate(CatalogUpsertSchema, await readJsonBody(req), "catalog item");
        return jsonOk(await call("catalog upsert", (s, c) => s.upsertCatalogItem(c, { kind, item })), 201);
      }),
    entityContext: (req: Request, entityIdRaw: string) =>
      run(async () => {
        const entityId = validate(IdSchema, entityIdRaw, "entity id");
        const asOfRaw = new URL(req.url).searchParams.get("configurationAsOf");
        const configurationAsOf = asOfRaw ? validate(UtcIsoSchema, asOfRaw, "configurationAsOf") : null;
        return jsonOk(await call("entity context", (s, c) => s.getEntityContext(c, { entityId, configurationAsOf })));
      }),

    // ----- issues -----
    issueCreate: (req: Request) =>
      run(async () => {
        const command = validate(CreateIssueCommandSchema, await withHeaderKey(req), "issue");
        const ctx = deps.context();
        const result = await guard.run(`${ctx.workspaceId}:create:${command.idempotencyKey}`, () => call("issue create", (s, c) => s.createIssue(c, command)));
        return jsonOk(result.issue, result.replayed ? 200 : 201);
      }),
    issueList: (req: Request) =>
      run(async () => {
        const filter = validate(IssueListFilterSchema, queryToObject(req.url), "issue filter");
        return jsonOk(await call("issue list", (s, c) => s.listIssues(c, filter)));
      }),
    issueGet: (idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        const detail = await call("issue detail", (s, c) => s.getIssue(c, { issueId: id }));
        const parsed = IssueDetailSchema.safeParse(detail);
        if (!parsed.success) throw new HttpError("INTERNAL", "Domain service returned an issue detail that violates the contract.", { issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) });
        return jsonOk(parsed.data);
      }),
    issueUpdate: (req: Request, idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        const update = validate(IssueUpdateSchema, await readJsonBody(req), "issue update");
        return jsonOk(await call("issue update", (s, c) => s.updateIssue(c, { issueId: id, update })));
      }),
    issueComment: (req: Request, idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        const comment = validate(IssueCommentInputSchema, await withHeaderKey(req), "comment");
        return jsonOk(await call("comment", (s, c) => s.addIssueComment(c, { issueId: id, comment })), 201);
      }),
    issueCause: (req: Request, idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        const assessment = validate(CauseAssessmentInputSchema, await withHeaderKey(req), "cause assessment");
        return jsonOk(await call("cause assessment", (s, c) => s.recordCauseAssessment(c, { issueId: id, assessment })), 201);
      }),
    issueFix: (req: Request, idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        const fix = validate(FixRevisionInputSchema, await withHeaderKey(req), "fix revision");
        return jsonOk(await call("fix revision", (s, c) => s.createFixRevision(c, { issueId: id, fix })), 201);
      }),
    issueVerification: (req: Request, idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        const verification = validate(VerificationInputSchema, await withHeaderKey(req), "verification");
        return jsonOk(await call("verification", (s, c) => s.recordVerification(c, { issueId: id, verification })), 201);
      }),
    issueTransition: (req: Request, idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        const command = validate(TransitionCommandSchema, await withHeaderKey(req), "transition");
        const ctx = deps.context();
        return jsonOk(await guard.run(`${ctx.workspaceId}:transition:${id}:${command.idempotencyKey}`, () => call("transition", (s, c) => s.transitionIssue(c, { issueId: id, command }))));
      }),
    issueSimilar: (idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        return jsonOk(await call("similar resolutions", (s, c) => s.findSimilarResolutions(c, { issueId: id })));
      }),
    insights: (req: Request) =>
      run(async () => {
        const filter = validate(InsightsFilterSchema, queryToObject(req.url), "insights filter");
        return jsonOk(await call("insights", (s, c) => s.getInsights(c, filter)));
      }),
    issuesExport: (req: Request) =>
      run(async () => {
        const filter = validate(IssueListFilterSchema, { ...queryToObject(req.url), limit: 200 }, "issue filter");
        const page = await call("issue export", (s, c) => s.listIssues(c, filter));
        const details = await Promise.all(page.items.map((i) => call("issue detail", (s, c) => s.getIssue(c, { issueId: i.id }))));
        const rows = details.map((d) => ({
          issue: d.issue,
          cause: d.causes.find((c) => c.isCurrent && c.state === "confirmed") ?? null,
          fix: d.fixes.find((f) => f.id === d.issue.currentFixRevisionId) ?? null,
          lastVerification: [...d.verifications].sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt) || b.id.localeCompare(a.id))[0] ?? null,
        }));
        return csvResponse(issuesToCsv(rows), safeFileName("recallradius-issues", new Date().toISOString().slice(0, 10)), { "x-recallradius-row-count": String(rows.length) });
      }),

    // ----- optional AI and bounded agent tools -----
    agentDraftIssue: (req: Request) =>
      run(async () => {
        const input = validate(IssueDraftRequestSchema, await readJsonBody(req), "issue text");
        const provider = requireAi();
        return jsonOk(await withTimeout(draftIssueFromText(provider, input, deps.aiTimeoutMs), deps.aiTimeoutMs + 1000, "issue draft"));
      }),
    agentExplainResolutions: (idRaw: string) =>
      run(async () => {
        const id = issueId(idRaw);
        const retrieved = await call("similar resolutions", (s, c) => s.findSimilarResolutions(c, { issueId: id }));
        const provider = requireAi();
        // Model call happens after the graph read completed, never inside a transaction.
        return jsonOk(await withTimeout(explainResolutions(provider, id, retrieved, deps.aiTimeoutMs), deps.aiTimeoutMs + 1000, "resolution explanation"));
      }),
    agentTool: (req: Request) =>
      run(async () => {
        const request = validate(AgentToolRequestSchema, await readJsonBody(req), "agent tool request");
        switch (request.tool) {
          case "find_similar_resolutions":
            return jsonOk({ tool: request.tool, result: await call("tool", (s, c) => s.findSimilarResolutions(c, { issueId: request.issueId })) });
          case "get_entity_context":
            return jsonOk({ tool: request.tool, result: await call("tool", (s, c) => s.getEntityContext(c, { entityId: request.entityId, configurationAsOf: request.configurationAsOf ?? null })) });
          case "get_issue_insights":
            return jsonOk({ tool: request.tool, result: await call("tool", (s, c) => s.getInsights(c, request.filter)) });
        }
      }),
    alertExtract: (req: Request) =>
      run(async () => {
        const input = validate(AlertExtractRequestSchema, await readJsonBody(req), "alert text");
        const provider = requireAi();
        return jsonOk(await withTimeout(extractAlertDraft(provider, input, deps.aiTimeoutMs), deps.aiTimeoutMs + 1000, "alert extraction"));
      }),

    // ----- assembly trace (P1) -----
    importPreview: (req: Request) =>
      run(async () => {
        const input = validate(ImportInputSchema, await readJsonBody(req), "import input");
        return jsonOk(await call("import preview", (s, c) => s.previewImport(c, input)));
      }),
    importAccept: (req: Request, previewIdRaw: string) =>
      run(async () => {
        const previewId = validate(IdSchema, previewIdRaw, "preview id");
        const body = validate(AcceptImportRequestSchema, await readJsonBody(req), "accept request");
        const ctx = deps.context();
        const rev = await guard.run(`${ctx.workspaceId}:accept:${previewId}`, () => call("import acceptance", (s, c) => s.acceptImport(c, { previewId, ...(body.expectedBaseRevisionId ? { expectedBaseRevisionId: body.expectedBaseRevisionId } : {}) })));
        return jsonOk(rev, 201);
      }),
    lateEvidencePreview: (req: Request) =>
      run(async () => {
        const input = validate(LateEvidencePreviewRequestSchema, await readJsonBody(req), "late-evidence request");
        return jsonOk(await call("late-evidence preview", (s, c) => s.previewLateEvidence(c, input)));
      }),
    traceCreate: (req: Request, incidentIdRaw: string) =>
      run(async () => {
        const incidentId = validate(IdSchema, incidentIdRaw, "incident id");
        const body = validate(TraceRequestSchema, await readJsonBody(req), "trace request");
        const request = { ...body, incidentId };
        const ctx = deps.context();
        const key = `${ctx.workspaceId}:trace:${incidentId}:${request.revisionId}:${request.root.kind}:${request.root.id}`;
        const result = await guard.run(key, () => call("trace", (s, c) => s.runTrace(c, request)));
        return jsonOk(assertRunShape(result), 201);
      }),
    traceGet: (runIdRaw: string) =>
      run(async () => {
        const runId = validate(IdSchema, runIdRaw, "run id");
        return jsonOk(assertRunShape(await call("trace lookup", (s, c) => s.getTrace(c, { runId }))));
      }),
    traceCompare: (runIdRaw: string, otherRaw: string | null) =>
      run(async () => {
        const earlierRunId = validate(IdSchema, runIdRaw, "run id");
        if (!otherRaw) throw new HttpError("VALIDATION_FAILED", "Query parameter 'other' (later run id) is required.");
        const laterRunId = validate(IdSchema, otherRaw, "other run id");
        if (earlierRunId === laterRunId) throw new HttpError("VALIDATION_FAILED", "Cannot compare a run with itself.");
        return jsonOk(await call("trace comparison", (s, c) => s.compareTraces(c, { earlierRunId, laterRunId })));
      }),
    traceExport: (runIdRaw: string) =>
      run(async () => {
        const runId = validate(IdSchema, runIdRaw, "run id");
        const stored = assertRunShape(await call("trace export", (s, c) => s.getTrace(c, { runId })));
        return csvResponse(traceToCsv(stored), safeFileName("recallradius-trace", stored.runId), { "x-recallradius-revision": stored.revisionId, "x-recallradius-execution-status": stored.executionStatus });
      }),
  };
}

export type ApiHandlers = ReturnType<typeof createHandlers>;
export const _internal = { queryToObject, z };
