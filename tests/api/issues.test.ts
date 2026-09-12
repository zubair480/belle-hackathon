/**
 * API/unit tests for the issue workflow routes against the typed service double.
 * They establish HTTP validation, envelope and orchestration behaviour, NOT Neo4j persistence.
 */
import { describe, expect, it } from "vitest";
import { ERROR_HTTP_STATUS, type ApiResponse, type EntityContext } from "@/contracts/common";
import type { DomainServices } from "@/contracts/recall";
import {
  EV_DEMO,
  QUALITY_REGRESSION_EXPECTATIONS,
  IssueDetailSchema,
  InsightsSchema,
  type CauseAssessment,
  type FixRevision,
  type Insights,
  type Issue,
  type IssueDetail,
  type IssuePage,
  type ReferenceCatalog,
  type SimilarResolutions,
  type Verification,
} from "@/contracts/issues";
import { createServiceDouble } from "@/server/application/double";
import { createHandlers, type ApiHandlers } from "@/server/application/handlers";

const CTX = { workspaceId: EV_DEMO.workspaceId, actorId: "qa-reviewer-demo" };
const api = (services: DomainServices | (() => DomainServices), overrides: Partial<Parameters<typeof createHandlers>[0]> = {}): ApiHandlers =>
  createHandlers({ services: typeof services === "function" ? services : () => services, context: () => CTX, aiProvider: () => null, serviceTimeoutMs: 500, aiTimeoutMs: 500, describeWiring: () => ({}), ...overrides });

const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://t/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const patch = (body: unknown) => new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) });
const get = (qs = "") => new Request(`http://t/x${qs}`);
const json = async <T>(r: Response) => (await r.json()) as ApiResponse<T>;
const data = async <T>(r: Response): Promise<T> => {
  const b = await json<T>(r);
  if (!b.ok) throw new Error(`${b.error.code}: ${b.error.message} ${JSON.stringify(b.error.details ?? "")}`);
  return b.data;
};
const expectError = async (r: Response, code: keyof typeof ERROR_HTTP_STATUS) => {
  const b = await json(r);
  expect(b.ok).toBe(false);
  if (!b.ok) expect(b.error.code).toBe(code);
  expect(r.status).toBe(ERROR_HTTP_STATUS[code]);
};

let keyCounter = 0;
const key = () => `key-${String(++keyCounter).padStart(6, "0")}`;

const manualIssue = () => ({
  idempotencyKey: key(),
  title: "Charge-port connector misaligned on DEMO-EV-005",
  description: "Connector does not seat in the charge-port module; found at final inspection.",
  origin: "manual",
  detectedAt: "2026-09-12T10:00:00Z",
  reportingTeamId: EV_DEMO.teams.finalInspection,
  assignedTeamId: null,
  detectionStationId: EV_DEMO.stations.finalInspection,
  processStepId: EV_DEMO.processSteps.chargePortInstall,
  entityIds: [EV_DEMO.entities.module, EV_DEMO.entities.connector, EV_DEMO.entities.bracket, EV_DEMO.entities.vehicle],
  partNumber: EV_DEMO.parts.module,
  partRevision: "A",
  linkedSupplierIds: [EV_DEMO.suppliers.connector],
  defectCode: EV_DEMO.defectCodes.misalignment,
  severity: "major",
  evidenceIds: [],
  newEvidence: [{ sourceName: "Operator note", locator: "note:1", text: "Connector sits 2 mm proud; bracket looks skewed." }],
});

describe("issue workflow: manual creation without import or AI", () => {
  it("creates, lists and reloads a manual issue; idempotent replay returns the same record", async () => {
    const h = api(createServiceDouble({ now: () => "2026-09-12T15:00:00Z" }));
    const cmd = manualIssue();
    const created = await h.issueCreate(post(cmd));
    expect(created.status).toBe(201);
    const issue = await data<Issue>(created);
    expect(issue.status).toBe("open");
    expect(issue.version).toBe(1);
    expect(issue.evidenceIds.length).toBe(1);

    const replay = await h.issueCreate(post(cmd));
    expect(replay.status).toBe(200);
    expect((await data<Issue>(replay)).id).toBe(issue.id);

    const conflict = await h.issueCreate(post({ ...cmd, title: "different payload, same key" }));
    await expectError(conflict, "DUPLICATE_ACTION");

    const viaHeader = await h.issueCreate(post({ ...cmd, idempotencyKey: undefined }, { "idempotency-key": "header-key-000001" }));
    expect(viaHeader.status).toBe(201);

    const page = await data<IssuePage>(await h.issueList(get("?status=open&limit=10")));
    expect(page.items.some((i) => i.id === issue.id)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(2);

    const detail = await data<IssueDetail>(await h.issueGet(issue.id));
    expect(IssueDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail.issue).toEqual(issue);
    expect(detail.audit[0]?.kind).toBe("created");
    expect(detail.evidence.some((e) => e.sourceKind === "manual")).toBe(true);
  });

  it("exposes both sourcing paths on the issue detail", async () => {
    const h = api(createServiceDouble());
    const issue = await data<Issue>(await h.issueCreate(post(manualIssue())));
    const detail = await data<IssueDetail>(await h.issueGet(issue.id));
    const connector = detail.entities.find((e) => e.id === EV_DEMO.entities.connector);
    const bracket = detail.entities.find((e) => e.id === EV_DEMO.entities.bracket);
    const vehicle = detail.entities.find((e) => e.id === EV_DEMO.entities.vehicle);
    expect(connector?.origin).toMatchObject({ sourcingType: "supplier", supplierId: EV_DEMO.suppliers.connector, supplierBatchCode: EV_DEMO.supplierLotCode, manufacturingTeamId: null });
    expect(bracket?.origin).toMatchObject({ sourcingType: "in_house", supplierId: null, manufacturingLotCode: EV_DEMO.manufacturingLotCode, workOrderId: EV_DEMO.workOrderId, manufacturingTeamId: EV_DEMO.teams.inHouseManufacturing });
    expect(vehicle?.vehicle).toEqual({ entityId: EV_DEMO.entities.vehicle, buildId: EV_DEMO.vehicleBuildId, vin: null });
    const bracketCtx = detail.entityContexts.find((c) => c.entity.id === EV_DEMO.entities.bracket);
    expect(bracketCtx?.currentVehicleIds).toEqual([EV_DEMO.entities.vehicle]);
    expect(bracketCtx?.currentParents.map((p) => p.id)).toEqual([EV_DEMO.entities.module, EV_DEMO.entities.vehicle]);
  });

  it("rejects invalid bodies, unknown references and oversized payloads", async () => {
    const h = api(createServiceDouble());
    await expectError(await h.issueCreate(post({ ...manualIssue(), severity: "huge" })), "VALIDATION_FAILED");
    await expectError(await h.issueCreate(post({ ...manualIssue(), reportingTeamId: "TEAM-NOPE" })), "INVALID_REFERENCE");
    await expectError(await h.issueCreate(post({ ...manualIssue(), entityIds: ["GHOST-1"] })), "INVALID_REFERENCE");
    await expectError(await h.issueCreate(post({ ...manualIssue(), description: "x".repeat(1_100_000) })), "PAYLOAD_TOO_LARGE");
    await expectError(await h.issueGet("nope-404"), "NOT_FOUND");
    await expectError(await h.issueList(get("?limit=9999")), "VALIDATION_FAILED");
  });

  it("serves the seeded reference catalog and manual directory entries", async () => {
    const h = api(createServiceDouble());
    const cat = await data<ReferenceCatalog>(await h.catalog());
    expect(cat.teams.map((t) => t.id)).toContain(EV_DEMO.teams.inHouseManufacturing);
    expect(cat.defectCodes.length).toBeGreaterThan(0);
    const created = await h.catalogUpsert(post({ name: "Battery pack line" }), "stations");
    expect(created.status).toBe(201);
    expect((await data<{ id: string }>(created)).id).toBe("BATTERY-PACK-LINE");
    await expectError(await h.catalogUpsert(post({ name: "x" }), "widgets"), "VALIDATION_FAILED");
  });
});

describe("issue workflow: assignment, attribution, reuse, verification-gated closure", () => {
  async function seeded() {
    const h = api(createServiceDouble({ now: () => "2026-09-12T15:00:00Z" }));
    const issue = await data<Issue>(await h.issueCreate(post(manualIssue())));
    return { h, issue };
  }

  it("PATCH assigns with expectedVersion and rejects stale updates; status cannot be patched", async () => {
    const { h, issue } = await seeded();
    const assigned = await data<Issue>(await h.issueUpdate(patch({ expectedVersion: 1, assignedTeamId: EV_DEMO.teams.inHouseManufacturing }), issue.id));
    expect(assigned.version).toBe(2);
    expect(assigned.assignedTeamId).toBe(EV_DEMO.teams.inHouseManufacturing);
    expect(assigned.reportingTeamId).toBe(EV_DEMO.teams.finalInspection);
    await expectError(await h.issueUpdate(patch({ expectedVersion: 1, title: "stale" }), issue.id), "STALE_VERSION");
    await expectError(await h.issueUpdate(patch({ title: "no version" }), issue.id), "VALIDATION_FAILED");
    const notPatched = await data<Issue>(await h.issueUpdate(patch({ expectedVersion: 2, status: "closed", title: "still open" }), issue.id));
    expect(notPatched.status).toBe("open");
  });

  it("runs the full loop: cause -> prior verified fix -> reuse as new proposal -> fail -> pass -> close -> reopen", async () => {
    const { h, issue } = await seeded();
    // Transition through work
    let cur = await data<Issue>(await h.issueTransition(post({ idempotencyKey: key(), action: "triage", expectedVersion: issue.version }), issue.id));
    cur = await data<Issue>(await h.issueTransition(post({ idempotencyKey: key(), action: "start_work", expectedVersion: cur.version }), issue.id));
    expect(cur.status).toBe("in_progress");
    await expectError(await h.issueTransition(post({ idempotencyKey: key(), action: "triage", expectedVersion: cur.version }), issue.id), "INVALID_TRANSITION");

    // Hypothesis first, then confirmed in-house manufacturing cause: reporter stays Final Inspection
    const hyp = await data<CauseAssessment>(await h.issueCause(post({ idempotencyKey: key(), state: "hypothesis", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: EV_DEMO.suppliers.connector, causalStationId: null, rationale: "Connector could be out of spec.", evidenceIds: [] }), issue.id));
    expect(hyp.isCurrent).toBe(true);
    const confirmed = await data<CauseAssessment>(await h.issueCause(post({ idempotencyKey: key(), state: "confirmed", causeType: "in_house_manufacturing", responsibleTeamId: EV_DEMO.teams.inHouseManufacturing, responsibleSupplierId: null, causalStationId: EV_DEMO.stations.bracketCell, causalProcessStepId: EV_DEMO.processSteps.bracketForming, rationale: "Bracket out of tolerance confirmed by gauge.", evidenceIds: [], supersedesId: hyp.id }), issue.id));
    let detail = await data<IssueDetail>(await h.issueGet(issue.id));
    expect(detail.issue.confirmedCauseId).toBe(confirmed.id);
    expect(detail.causes.find((c) => c.id === hyp.id)?.isCurrent).toBe(false);
    expect(detail.issue.reportingTeamId).toBe(EV_DEMO.teams.finalInspection);

    // Prior verified fix is retrieved with reasons and no supplier-based match
    const similar = await data<SimilarResolutions>(await h.issueSimilar(issue.id));
    expect(similar.results[0]?.sourceFixRevisionId).toBe(EV_DEMO.priorVerifiedFixId);
    expect(similar.results[0]?.matchReasons.join(" ")).toMatch(/part family CP-BRKT-200/);
    expect(similar.results[0]?.matchReasons.join(" ")).toMatch(/in_house_manufacturing/);
    expect(similar.results[0]?.verificationId).toBe("VERIFY-BRKT-PRIOR");

    // Reuse creates a new proposal; the old fix is untouched
    const fix = await data<FixRevision>(await h.issueFix(post({ idempotencyKey: key(), summary: "Re-set forming die per WI-BRKT-12 rev 2 (reused)", steps: [{ order: 1, instruction: "Apply WI-BRKT-12 rev 2." }], applicability: { partNumber: EV_DEMO.parts.bracket, partRevision: "A", processStepId: EV_DEMO.processSteps.bracketForming, limitations: [] }, sourceFixRevisionId: EV_DEMO.priorVerifiedFixId, workInstructionRef: "WI-BRKT-12 rev 2", evidenceIds: [] }), issue.id));
    expect(fix.state).toBe("proposed");
    expect(fix.sourceFixRevisionId).toBe(EV_DEMO.priorVerifiedFixId);
    const prior = await data<IssueDetail>(await h.issueGet(EV_DEMO.priorIssueId));
    expect(prior.fixes[0]).toMatchObject({ id: EV_DEMO.priorVerifiedFixId, state: "verified", version: 1 });
    expect(prior.issue.status).toBe("closed");

    // Closure blocked before verification
    cur = (await data<IssueDetail>(await h.issueGet(issue.id))).issue;
    await expectError(await h.issueTransition(post({ idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: fix.id }), issue.id), "VERIFICATION_REQUIRED");
    cur = await data<Issue>(await h.issueTransition(post({ idempotencyKey: key(), action: "request_verification", expectedVersion: cur.version }), issue.id));
    expect(cur.status).toBe("pending_verification");

    // Failed verification does not close; issue returns to work
    const failed = await data<Verification>(await h.issueVerification(post({ idempotencyKey: key(), fixRevisionId: fix.id, outcome: "fail", method: "Gauge check", resultNotes: "Still 1 mm proud.", evidenceIds: [] }), issue.id));
    expect(failed.outcome).toBe("fail");
    cur = (await data<IssueDetail>(await h.issueGet(issue.id))).issue;
    expect(cur.status).toBe("in_progress");
    await expectError(await h.issueTransition(post({ idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: fix.id }), issue.id), "VERIFICATION_REQUIRED");

    // Passed verification then close
    await data<Verification>(await h.issueVerification(post({ idempotencyKey: key(), fixRevisionId: fix.id, outcome: "pass", method: "Gauge check", resultNotes: "Within tolerance.", evidenceIds: [], newEvidence: [{ sourceName: "Gauge sheet", locator: "gauge:2", text: "PASS 0.1 mm" }] }), issue.id));
    cur = (await data<IssueDetail>(await h.issueGet(issue.id))).issue;
    await expectError(await h.issueTransition(post({ idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: "FIX-9999" }), issue.id), "INVALID_REFERENCE");
    cur = await data<Issue>(await h.issueTransition(post({ idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: fix.id, reason: "Verified" }), issue.id));
    expect(cur.status).toBe("closed");
    expect(cur.currentFixRevisionId).toBe(fix.id);

    // Reload preserves history; reopen returns to in_progress and keeps the close event
    detail = await data<IssueDetail>(await h.issueGet(issue.id));
    expect(detail.verifications.map((v) => v.outcome)).toEqual(["fail", "pass"]);
    expect(detail.fixes[0]?.state).toBe("verified");
    const closeEvents = detail.audit.filter((a) => a.kind === "transition" && a.toStatus === "closed");
    expect(closeEvents.length).toBe(1);
    cur = await data<Issue>(await h.issueTransition(post({ idempotencyKey: key(), action: "reopen", expectedVersion: cur.version, reason: "Recurred on DEMO-EV-006" }), issue.id));
    expect(cur.status).toBe("in_progress");
    detail = await data<IssueDetail>(await h.issueGet(issue.id));
    expect(detail.audit.filter((a) => a.kind === "transition" && a.toStatus === "closed").length).toBe(1);
    expect(detail.audit.some((a) => a.fromStatus === "closed" && a.toStatus === "in_progress")).toBe(true);

    // The new verified resolution is retrievable from a later similar issue
    const later = await data<Issue>(await h.issueCreate(post({ ...manualIssue(), title: "Bracket skew on DEMO-EV-004", entityIds: ["BRKT-0004", "CPM-0004", "DEMO-EV-004"], partNumber: EV_DEMO.parts.bracket, defectCode: EV_DEMO.defectCodes.bracketDimension })));
    const laterSimilar = await data<SimilarResolutions>(await h.issueSimilar(later.id));
    expect(laterSimilar.results.map((r) => r.sourceFixRevisionId)).toContain(fix.id);
    expect(laterSimilar.results.map((r) => r.sourceFixRevisionId)).toContain(EV_DEMO.priorVerifiedFixId);
  });

  it("stale transition and duplicate transition commands are rejected", async () => {
    const { h, issue } = await seeded();
    const k = key();
    const first = await h.issueTransition(post({ idempotencyKey: k, action: "start_work", expectedVersion: 1 }), issue.id);
    expect(first.status).toBe(200);
    const replay = await h.issueTransition(post({ idempotencyKey: k, action: "start_work", expectedVersion: 1 }), issue.id);
    expect(replay.status).toBe(200);
    expect((await data<Issue>(replay)).status).toBe("in_progress");
    await expectError(await h.issueTransition(post({ idempotencyKey: key(), action: "request_verification", expectedVersion: 1 }), issue.id), "STALE_VERSION");
  });

  it("verification must reference a fix of the same issue; comments are idempotent", async () => {
    const { h, issue } = await seeded();
    await expectError(await h.issueVerification(post({ idempotencyKey: key(), fixRevisionId: EV_DEMO.priorVerifiedFixId, outcome: "pass", method: "m", resultNotes: "n", evidenceIds: [] }), issue.id), "INVALID_REFERENCE");
    const k = key();
    const c1 = await h.issueComment(post({ idempotencyKey: k, body: "Checked bracket" }), issue.id);
    const c2 = await h.issueComment(post({ idempotencyKey: k, body: "Checked bracket" }), issue.id);
    expect(c1.status).toBe(201);
    expect((await data<{ id: string }>(c2)).id).toBe((await data<{ id: string }>(c1)).id);
  });
});

describe("insights: attribution-aware counts and nullable rates", () => {
  it("separates reporting from confirmed cause and keeps linked suppliers out of confirmed counts", async () => {
    const h = api(createServiceDouble());
    const issue = await data<Issue>(await h.issueCreate(post(manualIssue())));
    await data<CauseAssessment>(await h.issueCause(post({ idempotencyKey: key(), state: "confirmed", causeType: "in_house_manufacturing", responsibleTeamId: EV_DEMO.teams.inHouseManufacturing, responsibleSupplierId: null, causalStationId: EV_DEMO.stations.bracketCell, rationale: "Bracket cell die offset.", evidenceIds: [] }), issue.id));
    const ins = await data<Insights>(await h.insights(get()));
    expect(InsightsSchema.safeParse(ins).success).toBe(true);
    const fi = ins.teams.find((t) => t.teamId === EV_DEMO.teams.finalInspection)!;
    const mfg = ins.teams.find((t) => t.teamId === EV_DEMO.teams.inHouseManufacturing)!;
    expect(fi.reportedIssueIds).toContain(issue.id);
    expect(fi.confirmedCauseIssueIds).not.toContain(issue.id);
    expect(mfg.confirmedCauseIssueIds).toContain(issue.id);
    const sup = ins.suppliers.find((s) => s.supplierId === EV_DEMO.suppliers.connector)!;
    expect(sup.linkedIssueIds).toContain(issue.id);
    expect(sup.confirmedIssueIds).not.toContain(issue.id);
    expect(sup.confirmedIssueIds).toContain("ISS-CONN-SUPPLIER");
    expect(sup.affectedUnitRate).toBeNull();
    expect(sup.inspectedUnitCount).toBeNull();
    expect(ins.detectionStations.find((b) => b.id === EV_DEMO.stations.finalInspection)?.issueIds).toContain(issue.id);
    expect(ins.causalProcessSteps.filter((b) => b.id === EV_DEMO.processSteps.bracketForming || b.id === EV_DEMO.stations.bracketCell).flatMap((b) => b.issueIds)).toContain(issue.id);
    const filtered = await data<Insights>(await h.insights(get(`?teamRole=confirmed_cause&supplierId=${EV_DEMO.suppliers.connector}`)));
    expect(filtered.totalIssueCount).toBeGreaterThanOrEqual(1);
  });

  it("matches the quality regression oracle: SUP-A 4/3/20 = 15%, SUP-B 2/2/10 = 20%", async () => {
    const h = api(createServiceDouble({ issues: { includeQualityRegression: true } }));
    const ins = await data<Insights>(await h.insights(get()));
    const a = ins.suppliers.find((s) => s.supplierId === "SUP-A")!;
    const b = ins.suppliers.find((s) => s.supplierId === "SUP-B")!;
    expect(a).toMatchObject({ confirmedIssueCount: 4, distinctAffectedUnitCount: 3, inspectedUnitCount: 20, affectedUnitRate: QUALITY_REGRESSION_EXPECTATIONS["SUP-A"].affectedUnitRate });
    expect(b).toMatchObject({ confirmedIssueCount: 2, distinctAffectedUnitCount: 2, inspectedUnitCount: 10, affectedUnitRate: 0.2 });
    expect(a.linkedIssueCount).toBe(6); // includes the unconfirmed hypothesis issue and the assembly issue
    const ft = ins.teams.find((t) => t.teamId === "TEAM-FINAL-TEST")!;
    const mech = ins.teams.find((t) => t.teamId === "TEAM-MECHANICAL")!;
    expect(ft.reportedIssueIds).toContain("ISS-ASM-01");
    expect(ft.confirmedCauseIssueIds).not.toContain("ISS-ASM-01");
    expect(mech.confirmedCauseIssueIds).toContain("ISS-ASM-01");
  });
});

describe("entity context and agent tools", () => {
  it("returns origin, parents and vehicles for a component; unknown entity is NOT_FOUND", async () => {
    const h = api(createServiceDouble());
    const ctx = await data<EntityContext>(await h.entityContext(get(), EV_DEMO.entities.connector));
    expect(ctx.entity.origin?.sourcingType).toBe("supplier");
    expect(ctx.currentVehicleIds).toEqual([EV_DEMO.entities.vehicle]);
    await expectError(await h.entityContext(get(), "NOPE-1"), "NOT_FOUND");
    await expectError(await h.entityContext(get("?configurationAsOf=yesterday"), EV_DEMO.entities.connector), "VALIDATION_FAILED");
  });

  it("agent tools are bounded to the three read-only operations", async () => {
    const h = api(createServiceDouble());
    const r = await data<{ tool: string; result: EntityContext }>(await h.agentTool(post({ tool: "get_entity_context", entityId: EV_DEMO.entities.bracket })));
    expect(r.tool).toBe("get_entity_context");
    expect(r.result.entity.origin?.sourcingType).toBe("in_house");
    await expectError(await h.agentTool(post({ tool: "run_cypher", query: "MATCH (n) DETACH DELETE n" })), "VALIDATION_FAILED");
    const ins = await data<{ tool: string; result: Insights }>(await h.agentTool(post({ tool: "get_issue_insights", filter: {} })));
    expect(ins.result.totalIssueCount).toBeGreaterThan(0);
  });
});

describe("failure modes", () => {
  it("BACKEND_UNAVAILABLE when nothing is wired; TIMEOUT when the service hangs; FORBIDDEN for another workspace", async () => {
    const unwired = api(() => {
      throw Object.assign(new Error("Graph domain services are not wired."), { name: "DomainError", code: "BACKEND_UNAVAILABLE" });
    });
    await expectError(await unwired.catalog(), "BACKEND_UNAVAILABLE");
    const hanging = api(createServiceDouble({ issues: { failures: [{ method: "getCatalog", error: new Error("never"), delayMs: 2000 }] } }), { serviceTimeoutMs: 100 });
    await expectError(await hanging.catalog(), "TIMEOUT");
    const other = api(createServiceDouble(), { context: () => ({ workspaceId: "other-tenant", actorId: "x" }) });
    await expectError(await other.catalog(), "FORBIDDEN");
  });

  it("never leaks credentials from unexpected errors", async () => {
    const h = api(createServiceDouble({ issues: { failures: [{ method: "getCatalog", error: new Error("neo4j+s://user:hunter2@host failed, password hunter2") }] } }));
    const res = await h.catalog();
    expect(await res.text()).not.toContain("hunter2");
  });

  it("exports the filtered issue list as CSV with attribution columns", async () => {
    const h = api(createServiceDouble());
    const res = await h.issuesExport(get("?status=closed"));
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv.split("\r\n")[0]).toContain('"confirmedResponsibleTeamId"');
    expect(csv).toContain(`"${EV_DEMO.priorIssueId}"`);
    expect(csv).toContain(`"${EV_DEMO.teams.inHouseManufacturing}"`);
  });
});
