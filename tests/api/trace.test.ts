/**
 * API/unit tests for the assembly trace routes against the trace double, which answers from the
 * LEGACY ROBOTICS REGRESSION fixture (robot ids mapped to vehicle counts). Not EV factory data and
 * not Neo4j persistence.
 */
import { describe, expect, it } from "vitest";
import { ASSEMBLY_REGRESSION, ERROR_HTTP_STATUS, IMPORT_FILE_NAMES, TraceComparisonSchema, TraceResultSchema, type ApiResponse, type ImportPreview, type RevisionInfo, type TraceComparison, type TraceResult } from "@/contracts/recall";
import { createServiceDouble } from "@/server/application/double";
import { createHandlers, type ApiHandlers } from "@/server/application/handlers";

const CTX = { workspaceId: ASSEMBLY_REGRESSION.workspaceId, actorId: "qa" };
const api = (services = createServiceDouble({ workspaceId: ASSEMBLY_REGRESSION.workspaceId })): ApiHandlers =>
  createHandlers({ services: () => services, context: () => CTX, aiProvider: () => null, serviceTimeoutMs: 500, aiTimeoutMs: 500, describeWiring: () => ({}) });
const post = (body: unknown) => new Request("http://t/", { method: "POST", body: JSON.stringify(body) });
const json = async <T>(r: Response) => (await r.json()) as ApiResponse<T>;
const data = async <T>(r: Response): Promise<T> => {
  const b = await json<T>(r);
  if (!b.ok) throw new Error(`${b.error.code}: ${b.error.message}`);
  return b.data;
};
const expectError = async (r: Response, code: keyof typeof ERROR_HTTP_STATUS) => {
  const b = await json(r);
  expect(b.ok).toBe(false);
  if (!b.ok) expect(b.error.code).toBe(code);
  expect(r.status).toBe(ERROR_HTTP_STATUS[code]);
};
const files = () => Object.values(IMPORT_FILE_NAMES).map((name) => ({ name, text: `synthetic ${name}` }));
const importInput = () => ({ contractVersion: "assembly-quality-v4", files: files(), scope: ASSEMBLY_REGRESSION.scope });
const traceReq = (revisionId: string) => ({ contractVersion: "assembly-quality-v4", revisionId, root: ASSEMBLY_REGRESSION.root, scope: ASSEMBLY_REGRESSION.scope });

async function loop(h: ApiHandlers) {
  const preview = await data<ImportPreview>(await h.importPreview(post(importInput())));
  const rev1 = await data<RevisionInfo>(await h.importAccept(post({}), preview.previewId));
  const run1 = await data<TraceResult>(await h.traceCreate(post(traceReq(rev1.revisionId)), "INC-REG-B17"));
  const late = await data<ImportPreview>(await h.lateEvidencePreview(post({ baseRevisionId: rev1.revisionId })));
  const rev2 = await data<RevisionInfo>(await h.importAccept(post({ expectedBaseRevisionId: rev1.revisionId }), late.previewId));
  const run2 = await data<TraceResult>(await h.traceCreate(post(traceReq(rev2.revisionId)), "INC-REG-B17"));
  const cmp = await data<TraceComparison>(await h.traceCompare(run1.runId, run2.runId));
  return { preview, rev1, run1, late, rev2, run2, cmp };
}

describe("assembly trace routes (regression fixture)", () => {
  it("reproduces the regression oracle for both revisions and the comparison", async () => {
    const h = api();
    const { preview, run1, run2, cmp } = await loop(h);
    expect(preview.canAccept).toBe(true);
    expect(TraceResultSchema.safeParse(run1).success).toBe(true);
    expect(run1.counts).toEqual(ASSEMBLY_REGRESSION.revision1.counts);
    expect(run1.dataCompleteness).toBe("gaps_found");
    const vehicles1 = run1.rows.filter((r) => r.entityKind === "vehicle" && r.currentContainment).map((r) => r.entityId);
    expect(vehicles1).toEqual([...ASSEMBLY_REGRESSION.revision1.currentVehicleIds]);
    expect(run1.rows.find((r) => r.entityId === "R002")?.currentContainment).toBe(true); // two suspect encoders, one vehicle
    expect(run1.rows.find((r) => r.entityId === "R004")).toMatchObject({ currentContainment: false, historicalContainment: false });
    expect(run1.rows.find((r) => r.entityId === "R006")).toMatchObject({ currentContainment: false, historicalContainment: true, engineeringReview: "pending" });
    expect(run1.rows.find((r) => r.entityId === "R005")).toMatchObject({ currentContainment: false, hasUnresolvedEvidence: true });
    expect(run1.rows.find((r) => r.entityId === "E006")?.locationState).toBe("quarantine");
    expect(run1.paths.some((p) => p.kind === "BATCH_HAS_COMPONENT")).toBe(true);
    expect(run1.paths.some((p) => p.kind === "INSTALLED_IN" && p.validTo !== null)).toBe(true);

    expect(run2.counts).toEqual(ASSEMBLY_REGRESSION.revision2.counts);
    expect(run2.dataCompleteness).toBe("reviewed_scope");
    expect(TraceComparisonSchema.safeParse(cmp).success).toBe(true);
    expect(cmp.comparable).toBe(true);
    expect(cmp.delta).toEqual(ASSEMBLY_REGRESSION.delta);
    expect(cmp.addedCurrentVehicleIds).toEqual(["R005"]);
    expect(cmp.addedCurrentCustomerIds).toEqual(["CUST-C"]);
    expect(cmp.resolvedIssueIds).toContain("ISSUE-UNKNOWN-ORIGIN-R005");
  });

  it("keeps the earlier run unchanged and exports stored data as CSV", async () => {
    const h = api();
    const { run1 } = await loop(h);
    expect(await data<TraceResult>(await h.traceGet(run1.runId))).toEqual(run1);
    const res = await h.traceExport(run1.runId);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain('"current_containment"');
    expect(csv).toContain('"historical_only_review"');
    expect(csv).toContain('"no_recorded_link"');
    expect(csv).toContain("no hold or shipment release applied");
    expect(csv).toContain('"summary","counts.currentShippedVehicleCount","2"');
  });

  it("rejects v3 payloads, unknown roots, foreign sites and ambiguous roots", async () => {
    const h = api();
    await expectError(await h.importPreview(post({ ...importInput(), contractVersion: "assembly-quality-v3" })), "VALIDATION_FAILED");
    const preview = await data<ImportPreview>(await h.importPreview(post(importInput())));
    const rev = await data<RevisionInfo>(await h.importAccept(post({}), preview.previewId));
    await expectError(await h.traceCreate(post({ ...traceReq(rev.revisionId), root: { kind: "supplier_batch", id: "B99" } }), "INC-1"), "NOT_FOUND");
    await expectError(await h.traceCreate(post({ ...traceReq(rev.revisionId), root: { kind: "manufacturing_lot", id: "LOT-MFG-01" } }), "INC-1"), "NOT_FOUND");
    await expectError(await h.traceCreate(post({ ...traceReq(rev.revisionId), scope: { ...ASSEMBLY_REGRESSION.scope, siteId: "S9" } }), "INC-1"), "SCOPE_INVALID");
    await expectError(await h.traceCreate(post({ ...traceReq(rev.revisionId), root: { kind: "supplier_batch", id: "AMBIGUOUS" } }), "INC-1"), "AMBIGUOUS_ROOT");
  });

  it("blocks rejected previews, duplicate acceptance and base-revision mismatches", async () => {
    const h = api();
    const partial = await data<ImportPreview>(await h.importPreview(post({ ...importInput(), files: [{ name: "shipments.csv", text: "x" }] })));
    expect(partial.canAccept).toBe(false);
    await expectError(await h.importAccept(post({}), partial.previewId), "PREVIEW_REJECTED");
    const preview = await data<ImportPreview>(await h.importPreview(post(importInput())));
    const rev1 = await data<RevisionInfo>(await h.importAccept(post({}), preview.previewId));
    await expectError(await h.importAccept(post({}), preview.previewId), "DUPLICATE_ACTION");
    const late = await data<ImportPreview>(await h.lateEvidencePreview(post({ baseRevisionId: rev1.revisionId })));
    await expectError(await h.importAccept(post({ expectedBaseRevisionId: "rev-999" }), late.previewId), "REVISION_MISMATCH");
  });

  it("passes an incomplete run through as incomplete, never as a clean empty answer", async () => {
    const h = api(createServiceDouble({ workspaceId: ASSEMBLY_REGRESSION.workspaceId, trace: { incompleteForRoots: ["B17"] } }));
    const preview = await data<ImportPreview>(await h.importPreview(post(importInput())));
    const rev = await data<RevisionInfo>(await h.importAccept(post({}), preview.previewId));
    const run = await data<TraceResult>(await h.traceCreate(post(traceReq(rev.revisionId)), "INC-1"));
    expect(run.executionStatus).toBe("incomplete");
    expect(run.issues.some((i) => i.code === "TRAVERSAL_BUDGET_EXCEEDED" && i.severity === "blocking")).toBe(true);
  });
});
