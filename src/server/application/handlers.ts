import {
  AcceptImportRequestSchema,
  AlertExtractRequestSchema,
  CONTRACT_VERSION,
  IdSchema,
  ImportInputSchema,
  LateEvidencePreviewRequestSchema,
  TraceRequestSchema,
  TraceResultSchema,
  type DomainServices,
  type RequestContext,
  type TraceResult,
} from "@/contracts/recall";
import { extractAlertDraft } from "@/server/ai/extract";
import type { AlertExtractionProvider } from "@/server/ai/provider";
import { exportFileName, traceToCsv } from "./export";
import { HttpError, InFlightGuard, jsonOk, readJsonBody, toErrorResponse, validate, withTimeout } from "./http";

export type HandlerDeps = {
  /** Resolves the injected domain services (Codey's graph implementation or the explicit double). */
  services: () => DomainServices;
  /** Server-derived request context. */
  context: () => RequestContext;
  /** Configured AI provider, or null when manual entry only. May throw AI_UNAVAILABLE. */
  aiProvider: () => AlertExtractionProvider | null;
  /** Wall-clock budget for a domain call before the route answers TIMEOUT. */
  serviceTimeoutMs: number;
  aiTimeoutMs: number;
  /** Reported by /api/health; no secrets. */
  describeWiring: () => Record<string, string | boolean | null>;
};

/**
 * Framework-agnostic HTTP handlers. Route files under src/app/api are one-line adapters so the
 * same handlers run in tests against a typed DomainServices double.
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

  const callService = <T>(label: string, work: (services: DomainServices, ctx: RequestContext) => Promise<T>): Promise<T> => {
    const services = deps.services();
    const ctx = deps.context();
    return withTimeout(work(services, ctx), deps.serviceTimeoutMs, label);
  };

  /** Defensive check that a service returned a contract-shaped run before it is exposed or exported. */
  const assertRunShape = (value: unknown): TraceResult => {
    const r = TraceResultSchema.safeParse(value);
    if (!r.success) {
      throw new HttpError("INTERNAL", "Domain service returned a trace that violates the contract.", {
        issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return r.data;
  };

  return {
    health: () =>
      run(async () => jsonOk({ ok: true, contractVersion: CONTRACT_VERSION, ...deps.describeWiring() })),

    importPreview: (req: Request) =>
      run(async () => {
        const input = validate(ImportInputSchema, await readJsonBody(req), "import input");
        const preview = await callService("import preview", (s, ctx) => s.previewImport(ctx, input));
        return jsonOk(preview);
      }),

    importAccept: (req: Request, previewIdRaw: string) =>
      run(async () => {
        const previewId = validate(IdSchema, previewIdRaw, "preview id");
        const body = validate(AcceptImportRequestSchema, await readJsonBody(req), "accept request");
        const ctx = deps.context();
        const revision = await guard.run(`${ctx.workspaceId}:accept:${previewId}`, () =>
          callService("import acceptance", (s, c) =>
            s.acceptImport(c, { previewId, ...(body.expectedBaseRevisionId ? { expectedBaseRevisionId: body.expectedBaseRevisionId } : {}) }),
          ),
        );
        return jsonOk(revision, 201);
      }),

    lateEvidencePreview: (req: Request) =>
      run(async () => {
        const input = validate(LateEvidencePreviewRequestSchema, await readJsonBody(req), "late-evidence request");
        const preview = await callService("late-evidence preview", (s, ctx) => s.previewLateEvidence(ctx, input));
        return jsonOk(preview);
      }),

    alertExtract: (req: Request) =>
      run(async () => {
        const input = validate(AlertExtractRequestSchema, await readJsonBody(req), "alert text");
        const provider = deps.aiProvider();
        if (!provider) {
          throw new HttpError("AI_UNAVAILABLE", "No runtime AI provider is configured (RECALL_AI_PROVIDER=none). Enter the alert fields manually.");
        }
        // Model call happens here, outside any database transaction.
        const result = await withTimeout(extractAlertDraft(provider, input, deps.aiTimeoutMs), deps.aiTimeoutMs + 1000, "alert extraction");
        return jsonOk(result);
      }),

    traceCreate: (req: Request, incidentIdRaw: string) =>
      run(async () => {
        const incidentId = validate(IdSchema, incidentIdRaw, "incident id");
        const body = validate(TraceRequestSchema, await readJsonBody(req), "trace request");
        const request = { ...body, incidentId };
        const ctx = deps.context();
        const key = `${ctx.workspaceId}:trace:${incidentId}:${request.revisionId}:${[...request.rootLotIds].sort().join("|")}`;
        const result = await guard.run(key, () => callService("trace", (s, c) => s.runTrace(c, request)));
        return jsonOk(assertRunShape(result), 201);
      }),

    traceGet: (runIdRaw: string) =>
      run(async () => {
        const runId = validate(IdSchema, runIdRaw, "run id");
        const result = await callService("trace lookup", (s, ctx) => s.getTrace(ctx, { runId }));
        return jsonOk(assertRunShape(result));
      }),

    traceCompare: (runIdRaw: string, otherRaw: string | null) =>
      run(async () => {
        const earlierRunId = validate(IdSchema, runIdRaw, "run id");
        if (otherRaw === null || otherRaw === "") {
          throw new HttpError("VALIDATION_FAILED", "Query parameter 'other' (later run id) is required.");
        }
        const laterRunId = validate(IdSchema, otherRaw, "other run id");
        if (earlierRunId === laterRunId) {
          throw new HttpError("VALIDATION_FAILED", "Cannot compare a run with itself.");
        }
        const comparison = await callService("trace comparison", (s, ctx) => s.compareTraces(ctx, { earlierRunId, laterRunId }));
        return jsonOk(comparison);
      }),

    traceExport: (runIdRaw: string) =>
      run(async () => {
        const runId = validate(IdSchema, runIdRaw, "run id");
        const stored = assertRunShape(await callService("trace export", (s, ctx) => s.getTrace(ctx, { runId })));
        const csv = traceToCsv(stored);
        return new Response(csv, {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${exportFileName(stored)}"`,
            "cache-control": "no-store",
            "x-recallradius-revision": stored.revisionId,
            "x-recallradius-execution-status": stored.executionStatus,
          },
        });
      }),
  };
}

export type ApiHandlers = ReturnType<typeof createHandlers>;
