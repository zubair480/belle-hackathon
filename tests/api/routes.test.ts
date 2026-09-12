import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO,
  DomainError,
  ERROR_HTTP_STATUS,
  IMPORT_FILE_NAMES,
  REFERENCE_EXPECTATIONS,
  TraceComparisonSchema,
  TraceResultSchema,
  apiResponseSchema,
  type ApiResponse,
  type DomainServices,
  type ImportPreview,
  type RevisionInfo,
  type TraceComparison,
  type TraceResult,
} from "@/contracts/recall";
import { createServiceDouble, type ServiceDoubleOptions } from "@/server/application/double";
import { createHandlers, type ApiHandlers } from "@/server/application/handlers";

const CTX = { workspaceId: DEMO.workspaceId, actorId: "qa-reviewer-demo" };

function handlersFor(services: DomainServices | (() => DomainServices), overrides: Partial<Parameters<typeof createHandlers>[0]> = {}): ApiHandlers {
  return createHandlers({
    services: typeof services === "function" ? services : () => services,
    context: () => CTX,
    aiProvider: () => null,
    serviceTimeoutMs: 500,
    aiTimeoutMs: 500,
    describeWiring: () => ({ servicesMode: "double" }),
    ...overrides,
  });
}

const post = (body: unknown) =>
  new Request("http://test.local/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function json<T>(res: Response): Promise<ApiResponse<T>> {
  return (await res.json()) as ApiResponse<T>;
}

function expectError(body: ApiResponse<unknown>, code: keyof typeof ERROR_HTTP_STATUS, status: number) {
  expect(body.ok).toBe(false);
  if (body.ok) return;
  expect(body.error.code).toBe(code);
  expect(status).toBe(ERROR_HTTP_STATUS[code]);
}

const fullImport = () => ({
  files: Object.values(IMPORT_FILE_NAMES).map((name) => ({ name, text: `synthetic ${name} content` })),
  scope: DEMO.scope,
});

/** Runs the complete import -> trace -> late evidence -> trace -> compare loop through the HTTP handlers. */
async function runDemoLoop(api: ApiHandlers) {
  const preview = await json<ImportPreview>(await api.importPreview(post(fullImport())));
  if (!preview.ok) throw new Error(preview.error.message);
  const rev1 = await json<RevisionInfo>(await api.importAccept(post({}), preview.data.previewId));
  if (!rev1.ok) throw new Error(rev1.error.message);
  const run1 = await json<TraceResult>(
    await api.traceCreate(post({ revisionId: rev1.data.revisionId, rootLotIds: [DEMO.rootLotId], scope: DEMO.scope }), DEMO.incidentId),
  );
  if (!run1.ok) throw new Error(run1.error.message);
  const late = await json<ImportPreview>(await api.lateEvidencePreview(post({ baseRevisionId: rev1.data.revisionId })));
  if (!late.ok) throw new Error(late.error.message);
  const rev2 = await json<RevisionInfo>(await api.importAccept(post({ expectedBaseRevisionId: rev1.data.revisionId }), late.data.previewId));
  if (!rev2.ok) throw new Error(rev2.error.message);
  const run2 = await json<TraceResult>(
    await api.traceCreate(post({ revisionId: rev2.data.revisionId, rootLotIds: [DEMO.rootLotId], scope: DEMO.scope }), DEMO.incidentId),
  );
  if (!run2.ok) throw new Error(run2.error.message);
  const cmp = await json<TraceComparison>(await api.traceCompare(run1.data.runId, run2.data.runId));
  if (!cmp.ok) throw new Error(cmp.error.message);
  return { preview: preview.data, rev1: rev1.data, run1: run1.data, late: late.data, rev2: rev2.data, run2: run2.data, cmp: cmp.data };
}

describe("API routes against the service double: demo loop", () => {
  let api: ApiHandlers;
  beforeEach(() => {
    api = handlersFor(createServiceDouble({ now: () => "2026-09-12T15:00:00Z" }));
  });

  it("produces the reference outcomes for revision 1, revision 2 and the comparison", async () => {
    const { preview, run1, late, run2, cmp } = await runDemoLoop(api);

    expect(preview.canAccept).toBe(true);
    expect(preview.coverage.missing).toEqual([]);
    expect(preview.issues.map((i) => i.code)).toContain("MISSING_ORIGIN");

    expect(TraceResultSchema.safeParse(run1).success).toBe(true);
    expect(run1.known).toEqual(REFERENCE_EXPECTATIONS.revision1.known);
    expect(run1.unresolvedOnly).toEqual(REFERENCE_EXPECTATIONS.revision1.unresolvedOnly);
    expect(run1.disposedKg).toBe(10);
    expect(run1.executionStatus).toBe("completed");
    expect(run1.dataCompleteness).toBe("gaps_found");
    expect(run1.incidentId).toBe(DEMO.incidentId);
    const knownLots1 = run1.rows.filter((r) => r.knownMaterialPath).map((r) => r.lotId).sort();
    expect(knownLots1).toEqual([...REFERENCE_EXPECTATIONS.revision1.knownPathLots]);
    const fc = run1.rows.find((r) => r.lotId === "F-C");
    expect(fc?.onsiteKg).toBe(50);
    expect(fc?.shipmentLineIds).toEqual(["SL-C"]);
    expect(run1.paths.filter((p) => p.outputLotId === "F-C").length).toBeGreaterThanOrEqual(2); // two material paths, counted once
    const fd = run1.rows.find((r) => r.lotId === "F-D");
    expect(fd).toMatchObject({ knownMaterialPath: false, hasUnresolvedEvidence: false });
    const fe = run1.rows.find((r) => r.lotId === "F-E");
    expect(fe).toMatchObject({ knownMaterialPath: false, hasUnresolvedEvidence: true, onsiteKg: 40, shippedKg: 60 });

    expect(late.canAccept).toBe(true);
    expect(late.issues[0]?.message).toMatch(/supersedes/i);

    expect(run2.known).toEqual(REFERENCE_EXPECTATIONS.revision2.known);
    expect(run2.unresolvedOnly).toEqual({ onsiteKg: 0, shippedKg: 0 });
    expect(run2.disposedKg).toBe(10);
    expect(run2.rows.find((r) => r.lotId === "F-D")).toMatchObject({ knownMaterialPath: false, hasUnresolvedEvidence: false });
    expect(run2.rows.find((r) => r.lotId === "F-E")).toMatchObject({ knownMaterialPath: true, hasUnresolvedEvidence: false });
    expect(run2.dataHash).not.toBe(run1.dataHash);

    expect(TraceComparisonSchema.safeParse(cmp).success).toBe(true);
    expect(cmp.comparable).toBe(true);
    expect(cmp.delta).toEqual(REFERENCE_EXPECTATIONS.delta);
    expect(cmp.addedLotIds).toEqual(["F-E", "R-UNK"]);
    expect(cmp.addedConsigneeIds).toEqual(["C-DeltaFoods"]);
    expect(cmp.resolvedIssueIds).toEqual(["ISSUE-MISSING-ORIGIN-R-UNK", "ISSUE-PROVISIONAL-R-UNK"]);
  });

  it("keeps the earlier run unchanged after late evidence is accepted", async () => {
    const { run1 } = await runDemoLoop(api);
    const again = await json<TraceResult>(await api.traceGet(run1.runId));
    expect(again.ok && again.data).toEqual(run1);
  });

  it("exports the stored run as CSV with revision/scope, categories and no hold applied", async () => {
    const { run1 } = await runDemoLoop(api);
    const res = await api.traceExport(run1.runId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(run1.runId);
    const csv = await res.text();
    expect(csv.split("\r\n")[0]).toContain('"runId","revisionId"');
    expect(csv).toContain(`"${run1.revisionId}"`);
    expect(csv).toContain('"traced_potential_impact"');
    expect(csv).toContain('"unresolved_scope"');
    expect(csv).toContain('"no_recorded_material_path"');
    expect(csv).toContain("Candidate only; no warehouse hold applied");
    expect(csv).toContain('"summary","known.onsiteKg","160"');
  });
});

describe("API routes: validation and stable error envelope", () => {
  const api = handlersFor(createServiceDouble());

  it("rejects malformed JSON", async () => {
    const res = await api.importPreview(new Request("http://t/", { method: "POST", body: "{not json" }));
    expectError(await json(res), "VALIDATION_FAILED", res.status);
  });

  it("rejects unknown import file names and inverted scopes with issue details", async () => {
    const res = await api.importPreview(post({ files: [{ name: "x.csv", text: "a" }], scope: { ...DEMO.scope, eventToExclusive: "2026-01-01T00:00:00Z" } }));
    const body = await json(res);
    expectError(body, "VALIDATION_FAILED", res.status);
    if (!body.ok) expect((body.error.details as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
  });

  it("rejects oversized bodies", async () => {
    const big = { files: [{ name: "events.csv", text: "x".repeat(1_100_000) }], scope: DEMO.scope };
    const res = await api.importPreview(post(big));
    expectError(await json(res), "PAYLOAD_TOO_LARGE", res.status);
  });

  it("rejects an empty root lot list and invalid ids", async () => {
    const res = await api.traceCreate(post({ revisionId: "rev-1", rootLotIds: [], scope: DEMO.scope }), "INC-1");
    expectError(await json(res), "VALIDATION_FAILED", res.status);
    const res2 = await api.traceGet("../etc/passwd");
    expectError(await json(res2), "VALIDATION_FAILED", res2.status);
  });

  it("requires the other run id for comparison and refuses self-comparison", async () => {
    const r1 = await api.traceCompare("run-1", null);
    expectError(await json(r1), "VALIDATION_FAILED", r1.status);
    const r2 = await api.traceCompare("run-1", "run-1");
    expectError(await json(r2), "VALIDATION_FAILED", r2.status);
  });

  it("returns NOT_FOUND for unknown runs, revisions and previews", async () => {
    const r1 = await api.traceGet("run-does-not-exist");
    expectError(await json(r1), "NOT_FOUND", r1.status);
    const r2 = await api.traceCreate(post({ revisionId: "rev-none", rootLotIds: ["T17"], scope: DEMO.scope }), "INC-1");
    expectError(await json(r2), "NOT_FOUND", r2.status);
    const r3 = await api.importAccept(post({}), "preview-none");
    expectError(await json(r3), "NOT_FOUND", r3.status);
  });

  it("every error body validates against the ApiResponse envelope", async () => {
    const schema = apiResponseSchema(TraceResultSchema);
    const res = await api.traceGet("missing");
    expect(schema.safeParse(await res.json()).success).toBe(true);
  });
});

describe("API routes: rejected previews, revisions and duplicate actions", () => {
  it("refuses to accept a preview with blocking issues", async () => {
    const api = handlersFor(createServiceDouble());
    const preview = await json<ImportPreview>(await api.importPreview(post({ files: [{ name: "shipments.csv", text: "only shipments" }], scope: DEMO.scope })));
    expect(preview.ok && preview.data.canAccept).toBe(false);
    if (!preview.ok) return;
    const res = await api.importAccept(post({}), preview.data.previewId);
    expectError(await json(res), "PREVIEW_REJECTED", res.status);
  });

  it("flags conflicting duplicate event ids as blocking", async () => {
    const api = handlersFor(createServiceDouble());
    const files = fullImport();
    files.files[1]!.text = "E1,... CONFLICTING-RECORD";
    const preview = await json<ImportPreview>(await api.importPreview(post(files)));
    expect(preview.ok && preview.data.issues.some((i) => i.code === "CONFLICTING_EVENT_ID" && i.severity === "blocking")).toBe(true);
  });

  it("rejects a second acceptance of the same preview and mismatched base revisions", async () => {
    const api = handlersFor(createServiceDouble());
    const preview = await json<ImportPreview>(await api.importPreview(post(fullImport())));
    if (!preview.ok) throw new Error("preview failed");
    const first = await api.importAccept(post({}), preview.data.previewId);
    expect(first.status).toBe(201);
    const rev1 = await json<RevisionInfo>(first.clone());
    if (!rev1.ok) throw new Error("accept failed");
    const second = await api.importAccept(post({}), preview.data.previewId);
    expectError(await json(second), "DUPLICATE_ACTION", second.status);

    const late = await json<ImportPreview>(await api.lateEvidencePreview(post({ baseRevisionId: rev1.data.revisionId })));
    if (!late.ok) throw new Error("late preview failed");
    const wrongBase = await api.importAccept(post({ expectedBaseRevisionId: "rev-999" }), late.data.previewId);
    expectError(await json(wrongBase), "REVISION_MISMATCH", wrongBase.status);
  });

  it("reports identical source files imported twice as an explicit duplicate", async () => {
    const api = handlersFor(createServiceDouble());
    const p1 = await json<ImportPreview>(await api.importPreview(post(fullImport())));
    if (!p1.ok) throw new Error("p1");
    await api.importAccept(post({}), p1.data.previewId);
    const p2 = await json<ImportPreview>(await api.importPreview(post(fullImport())));
    expect(p2.ok && p2.data.issues.some((i) => i.code === "ALREADY_IMPORTED")).toBe(true);
    if (!p2.ok) return;
    const res = await api.importAccept(post({}), p2.data.previewId);
    expectError(await json(res), "DUPLICATE_ACTION", res.status);
  });

  it("blocks concurrent duplicate trace requests with DUPLICATE_ACTION", async () => {
    const api = handlersFor(createServiceDouble({ delayMs: 50 }));
    const { rev1 } = await (async () => {
      const preview = await json<ImportPreview>(await api.importPreview(post(fullImport())));
      if (!preview.ok) throw new Error("preview");
      const rev = await json<RevisionInfo>(await api.importAccept(post({}), preview.data.previewId));
      if (!rev.ok) throw new Error("accept");
      return { rev1: rev.data };
    })();
    const body = { revisionId: rev1.revisionId, rootLotIds: ["T17"], scope: DEMO.scope };
    const [a, b] = await Promise.all([api.traceCreate(post(body), "INC-T17"), api.traceCreate(post(body), "INC-T17")]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = a.status === 409 ? a : b;
    expectError(await json(failed), "DUPLICATE_ACTION", 409);
  });
});

describe("API routes: ambiguous roots, incomplete results, timeouts and unavailable backends", () => {
  async function acceptedRevision(api: ApiHandlers): Promise<string> {
    const preview = await json<ImportPreview>(await api.importPreview(post(fullImport())));
    if (!preview.ok) throw new Error("preview");
    const rev = await json<RevisionInfo>(await api.importAccept(post({}), preview.data.previewId));
    if (!rev.ok) throw new Error("accept");
    return rev.data.revisionId;
  }

  it("stops for review on an ambiguous root identity", async () => {
    const api = handlersFor(createServiceDouble());
    const revisionId = await acceptedRevision(api);
    const res = await api.traceCreate(post({ revisionId, rootLotIds: ["AMBIGUOUS"], scope: DEMO.scope }), "INC-1");
    const body = await json(res);
    expectError(body, "AMBIGUOUS_ROOT", res.status);
    if (!body.ok) expect(body.error.details).toMatchObject({ candidates: expect.any(Array) });
  });

  it("rejects scope outside the accepted revision", async () => {
    const api = handlersFor(createServiceDouble());
    const revisionId = await acceptedRevision(api);
    const res = await api.traceCreate(post({ revisionId, rootLotIds: ["T17"], scope: { ...DEMO.scope, siteId: "S2" } }), "INC-1");
    expectError(await json(res), "SCOPE_INVALID", res.status);
  });

  it("passes an incomplete run through unchanged (never a clean-looking empty result)", async () => {
    const api = handlersFor(createServiceDouble({ incompleteForRoots: ["T17"] }));
    const revisionId = await acceptedRevision(api);
    const res = await json<TraceResult>(await api.traceCreate(post({ revisionId, rootLotIds: ["T17"], scope: DEMO.scope }), "INC-1"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.executionStatus).toBe("incomplete");
    expect(res.data.issues.some((i) => i.code === "TRAVERSAL_BUDGET_EXCEEDED" && i.severity === "blocking")).toBe(true);
    const csv = await (await api.traceExport(res.data.runId)).text();
    expect(csv).toContain('"incomplete"');
  });

  it("surfaces a service TIMEOUT thrown by the engine", async () => {
    const opts: ServiceDoubleOptions = { failures: [{ method: "runTrace", error: new DomainError("TIMEOUT", "Graph query budget exceeded") }] };
    const api = handlersFor(createServiceDouble(opts));
    const revisionId = await acceptedRevision(api);
    const res = await api.traceCreate(post({ revisionId, rootLotIds: ["T17"], scope: DEMO.scope }), "INC-1");
    expectError(await json(res), "TIMEOUT", res.status);
  });

  it("answers TIMEOUT when the service hangs past the route budget", async () => {
    const api = handlersFor(createServiceDouble({ failures: [{ method: "getTrace", error: new Error("never"), delayMs: 2000 }] }), { serviceTimeoutMs: 100 });
    const res = await api.traceGet("run-1");
    expectError(await json(res), "TIMEOUT", res.status);
  });

  it("answers BACKEND_UNAVAILABLE when no services are wired, without any double fallback", async () => {
    const api = handlersFor(() => {
      throw new DomainError("BACKEND_UNAVAILABLE", "Graph domain services are not wired.");
    });
    const res = await api.traceGet("run-1");
    expectError(await json(res), "BACKEND_UNAVAILABLE", res.status);
  });

  it("never leaks credentials in unexpected errors", async () => {
    const api = handlersFor(createServiceDouble({ failures: [{ method: "getTrace", error: new Error("neo4j+s://user:hunter2@host failed with password hunter2") }] }));
    const res = await api.traceGet("run-1");
    const body = await json(res);
    expect(body.ok).toBe(false);
    if (!body.ok) {
      expect(JSON.stringify(body)).not.toContain("hunter2");
      expect(["BACKEND_UNAVAILABLE", "INTERNAL"]).toContain(body.error.code);
    }
  });

  it("refuses another workspace's context", async () => {
    const api = handlersFor(createServiceDouble(), { context: () => ({ workspaceId: "other-tenant", actorId: "x" }) });
    const res = await api.traceGet("run-1");
    expectError(await json(res), "FORBIDDEN", res.status);
  });
});
