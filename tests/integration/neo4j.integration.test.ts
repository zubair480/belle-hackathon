/**
 * Real-database acceptance checks. They run ONLY when NEO4J_URI/NEO4J_USERNAME/NEO4J_PASSWORD are
 * set and Codey's graph services are present on the checkout; otherwise they are skipped and
 * reported as UNVERIFIED (never as passed). Doubles are never used here.
 *
 * Part 1: driver connectivity.
 * Part 2: EV issue acceptance loop through the HTTP handlers against the real services.
 * Part 3: regression-only assembly trace (robot ids) against the real services.
 */
import neo4j from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApiResponse } from "@/contracts/common";
import { EV_DEMO, type CauseAssessment, type FixRevision, type Insights, type Issue, type IssueDetail, type SimilarResolutions, type Verification } from "@/contracts/issues";
import { ASSEMBLY_REGRESSION, type DomainServices, type ImportPreview, type RevisionInfo, type TraceComparison, type TraceResult } from "@/contracts/recall";
import { createHandlers } from "@/server/application/handlers";

const env = process.env;
const hasCreds = Boolean(env.NEO4J_URI && env.NEO4J_USERNAME && env.NEO4J_PASSWORD && !env.NEO4J_URI.includes("<"));
const graphMode = env.RECALL_SERVICES !== "double";

async function loadGraphServices(): Promise<DomainServices | null> {
  const modulePath = "@/server/graph"; // FINAL INTEGRATION: replace with a static import
  try {
    const mod = (await import(/* @vite-ignore */ modulePath)) as { graphServices?: DomainServices; default?: DomainServices };
    return mod.graphServices ?? mod.default ?? null;
  } catch {
    return null;
  }
}

const post = (body: unknown) => new Request("http://t/", { method: "POST", body: JSON.stringify(body) });
const patch = (body: unknown) => new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) });
const unwrap = async <T>(res: Response): Promise<T> => {
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message} ${JSON.stringify(body.error.details ?? "")}`);
  return body.data;
};
let n = 0;
const key = () => `int-${Date.now()}-${++n}`;

describe.skipIf(!hasCreds)("Neo4j connectivity (real database)", () => {
  let driver: ReturnType<typeof neo4j.driver>;
  beforeAll(() => {
    driver = neo4j.driver(env.NEO4J_URI!, neo4j.auth.basic(env.NEO4J_USERNAME!, env.NEO4J_PASSWORD!));
  });
  afterAll(async () => {
    await driver?.close();
  });
  it("connects and runs a trivial read", async () => {
    await driver.verifyConnectivity();
    const session = driver.session({ database: env.NEO4J_DATABASE ?? "neo4j", defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run("RETURN 1 AS one");
      const v = result.records[0]?.get("one");
      expect(typeof v?.toNumber === "function" ? v.toNumber() : v).toBe(1);
    } finally {
      await session.close();
    }
  });
});

describe.skipIf(!hasCreds || !graphMode)("EV acceptance against real graph services", () => {
  let services: DomainServices | null = null;
  beforeAll(async () => {
    services = await loadGraphServices();
  });
  const handlers = () =>
    createHandlers({ services: () => services!, context: () => ({ workspaceId: env.RECALL_WORKSPACE_ID ?? EV_DEMO.workspaceId, actorId: env.RECALL_DEMO_ACTOR_ID ?? "qa-reviewer-demo" }), aiProvider: () => null, serviceTimeoutMs: 60_000, aiTimeoutMs: 1000, describeWiring: () => ({}) });

  it("manual issue persists, exposes both origins, gates closure on verification, and is reusable", async (ctx) => {
    if (!services) return ctx.skip("src/server/graph not present; integration UNVERIFIED");
    const api = handlers();
    const created = await unwrap<Issue>(await api.issueCreate(post({ idempotencyKey: key(), title: "Charge-port connector misaligned on DEMO-EV-005", description: "Integration run", origin: "manual", detectedAt: "2026-09-12T10:00:00Z", reportingTeamId: EV_DEMO.teams.finalInspection, assignedTeamId: null, detectionStationId: EV_DEMO.stations.finalInspection, processStepId: EV_DEMO.processSteps.chargePortInstall, entityIds: [EV_DEMO.entities.module, EV_DEMO.entities.connector, EV_DEMO.entities.bracket, EV_DEMO.entities.vehicle], partNumber: EV_DEMO.parts.module, partRevision: "A", linkedSupplierIds: [EV_DEMO.suppliers.connector], defectCode: EV_DEMO.defectCodes.misalignment, severity: "major", evidenceIds: [] })));
    const detail = await unwrap<IssueDetail>(await api.issueGet(created.id));
    expect(detail.issue.id).toBe(created.id);
    expect(detail.entities.find((e) => e.id === EV_DEMO.entities.connector)?.origin?.sourcingType).toBe("supplier");
    expect(detail.entities.find((e) => e.id === EV_DEMO.entities.bracket)?.origin?.sourcingType).toBe("in_house");
    let cur = await unwrap<Issue>(await api.issueUpdate(patch({ expectedVersion: created.version, assignedTeamId: EV_DEMO.teams.inHouseManufacturing }), created.id));
    cur = await unwrap<Issue>(await api.issueTransition(post({ idempotencyKey: key(), action: "start_work", expectedVersion: cur.version }), created.id));
    await unwrap<CauseAssessment>(await api.issueCause(post({ idempotencyKey: key(), state: "confirmed", causeType: "in_house_manufacturing", responsibleTeamId: EV_DEMO.teams.inHouseManufacturing, responsibleSupplierId: null, causalStationId: EV_DEMO.stations.bracketCell, causalProcessStepId: EV_DEMO.processSteps.bracketForming, rationale: "Bracket out of tolerance.", evidenceIds: [] }), created.id));
    const similar = await unwrap<SimilarResolutions>(await api.issueSimilar(created.id));
    expect(similar.results.length).toBeGreaterThan(0);
    const source = similar.results[0]!;
    const fix = await unwrap<FixRevision>(await api.issueFix(post({ idempotencyKey: key(), summary: "Reuse prior bracket fix", steps: [{ order: 1, instruction: "Apply referenced work instruction." }], applicability: { partNumber: EV_DEMO.parts.bracket, partRevision: "A", processStepId: EV_DEMO.processSteps.bracketForming, limitations: [] }, sourceFixRevisionId: source.sourceFixRevisionId, evidenceIds: [] }), created.id));
    expect(fix.state).toBe("proposed");
    const sourceDetail = await unwrap<IssueDetail>(await api.issueGet(source.sourceIssueId));
    expect(sourceDetail.fixes.find((f) => f.id === source.sourceFixRevisionId)?.state).toBe("verified");
    cur = (await unwrap<IssueDetail>(await api.issueGet(created.id))).issue;
    const blocked = await api.issueTransition(post({ idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: fix.id }), created.id);
    expect(blocked.status).toBe(409);
    await unwrap<Verification>(await api.issueVerification(post({ idempotencyKey: key(), fixRevisionId: fix.id, outcome: "fail", method: "Gauge", resultNotes: "Fail", evidenceIds: [] }), created.id));
    cur = (await unwrap<IssueDetail>(await api.issueGet(created.id))).issue;
    expect(cur.status).not.toBe("closed");
    await unwrap<Verification>(await api.issueVerification(post({ idempotencyKey: key(), fixRevisionId: fix.id, outcome: "pass", method: "Gauge", resultNotes: "Pass", evidenceIds: [] }), created.id));
    cur = (await unwrap<IssueDetail>(await api.issueGet(created.id))).issue;
    cur = await unwrap<Issue>(await api.issueTransition(post({ idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: fix.id }), created.id));
    expect(cur.status).toBe("closed");
    const later = await unwrap<Issue>(await api.issueCreate(post({ idempotencyKey: key(), title: "Bracket skew on DEMO-EV-004", description: "Integration reuse check", origin: "manual", detectedAt: "2026-09-12T11:00:00Z", reportingTeamId: EV_DEMO.teams.finalInspection, assignedTeamId: null, detectionStationId: null, processStepId: null, entityIds: [], partNumber: EV_DEMO.parts.bracket, partRevision: "A", linkedSupplierIds: [], defectCode: EV_DEMO.defectCodes.bracketDimension, severity: "major", evidenceIds: [] })));
    const laterSimilar = await unwrap<SimilarResolutions>(await api.issueSimilar(later.id));
    expect(laterSimilar.results.map((r) => r.sourceFixRevisionId)).toContain(fix.id);
    const ins = await unwrap<Insights>(await api.insights(new Request("http://t/x")));
    const fi = ins.teams.find((t) => t.teamId === EV_DEMO.teams.finalInspection)!;
    expect(fi.reportedIssueIds).toContain(created.id);
    expect(fi.confirmedCauseIssueIds).not.toContain(created.id);
    const sup = ins.suppliers.find((s) => s.supplierId === EV_DEMO.suppliers.connector)!;
    expect(sup.confirmedIssueIds).not.toContain(created.id);
  });

  it("supplier-lot and manufacturing-lot vehicle queries answer separately (EV fixture)", async (ctx) => {
    if (!services) return ctx.skip("src/server/graph not present; integration UNVERIFIED");
    const api = handlers();
    const bracket = await unwrap<{ entity: { origin: { sourcingType: string } | null }; currentVehicleIds: string[] }>(await api.entityContext(new Request("http://t/x"), EV_DEMO.entities.bracket));
    expect(bracket.entity.origin?.sourcingType).toBe("in_house");
    expect(bracket.currentVehicleIds).toContain(EV_DEMO.entities.vehicle);
    const connector = await unwrap<{ entity: { origin: { sourcingType: string } | null } }>(await api.entityContext(new Request("http://t/x"), EV_DEMO.entities.connector));
    expect(connector.entity.origin?.sourcingType).toBe("supplier");
  });

  it("legacy robotics regression: 1/2/2 -> 1/3/3, R006 historical-only, R004 unlinked, old run preserved", async (ctx) => {
    if (!services) return ctx.skip("src/server/graph not present; integration UNVERIFIED");
    const api = createHandlers({ services: () => services!, context: () => ({ workspaceId: ASSEMBLY_REGRESSION.workspaceId, actorId: "qa" }), aiProvider: () => null, serviceTimeoutMs: 60_000, aiTimeoutMs: 1000, describeWiring: () => ({}) });
    const { readFile } = await import("node:fs/promises");
    const names = ["entities.csv", "batches.csv", "manufacturing_lots.csv", "installations.csv", "shipments.csv"];
    const files = await Promise.all(names.map(async (name) => ({ name, text: await readFile(`fixtures/regression/${name}`, "utf8").catch(() => "") })));
    const preview = await unwrap<ImportPreview>(await api.importPreview(post({ contractVersion: "assembly-quality-v4", files: files.filter((f) => f.text), scope: ASSEMBLY_REGRESSION.scope })));
    const rev1 = await unwrap<RevisionInfo>(await api.importAccept(post({}), preview.previewId));
    const req = (revisionId: string) => ({ contractVersion: "assembly-quality-v4", revisionId, root: ASSEMBLY_REGRESSION.root, scope: ASSEMBLY_REGRESSION.scope });
    const run1 = await unwrap<TraceResult>(await api.traceCreate(post(req(rev1.revisionId)), "INC-REG"));
    expect(run1.counts).toEqual(ASSEMBLY_REGRESSION.revision1.counts);
    const late = await unwrap<ImportPreview>(await api.lateEvidencePreview(post({ baseRevisionId: rev1.revisionId })));
    const rev2 = await unwrap<RevisionInfo>(await api.importAccept(post({ expectedBaseRevisionId: rev1.revisionId }), late.previewId));
    const run2 = await unwrap<TraceResult>(await api.traceCreate(post(req(rev2.revisionId)), "INC-REG"));
    expect(run2.counts).toEqual(ASSEMBLY_REGRESSION.revision2.counts);
    const cmp = await unwrap<TraceComparison>(await api.traceCompare(run1.runId, run2.runId));
    expect(cmp.delta).toEqual(ASSEMBLY_REGRESSION.delta);
    expect(await unwrap<TraceResult>(await api.traceGet(run1.runId))).toEqual(run1);
  });
});

describe("integration status report", () => {
  it("states whether database integration was exercised", () => {
    console.info(`[integration] ${hasCreds ? "NEO4J credentials present: integration suites executed" : "NEO4J credentials absent: database integration UNVERIFIED (suites skipped)"}`);
    expect(true).toBe(true);
  });
});
