/**
 * Mock-server rule tests (node). These exercise the labeled UI mock, not Codey's Neo4j services
 * or Zubair's routes: they prove the UI can be driven through every workflow state locally.
 */
import { describe, expect, it } from "vitest";
import { EV_DEMO, IssueDetailSchema, InsightsSchema, SimilarResolutionsSchema } from "@/contracts/issues";
import { EntityContextSchema } from "@/contracts/common";
import { createMockClient } from "../../features/recall/api/mockClient";

const baseIssue = {
  title: "Charge-port connector misaligned on DEMO-EV-005",
  description: "Connector sits proud on the left; charge-port door not flush.",
  origin: "manual" as const,
  detectedAt: "2026-09-12T10:00:00Z",
  reportingTeamId: EV_DEMO.teams.finalInspection,
  assignedTeamId: null,
  detectionStationId: EV_DEMO.stations.finalInspection,
  processStepId: EV_DEMO.processSteps.chargePortInstall,
  entityIds: [EV_DEMO.entities.module, EV_DEMO.entities.connector, EV_DEMO.entities.bracket, EV_DEMO.entities.vehicle],
  partNumber: EV_DEMO.parts.bracket,
  partRevision: "A",
  linkedSupplierIds: [EV_DEMO.suppliers.connector],
  defectCode: EV_DEMO.defectCodes.misalignment,
  severity: "major" as const,
  evidenceIds: [],
  newEvidence: [{ sourceName: "Operator note", locator: "manual-note", text: "Gauge reads 1.5 mm proud on the left." }],
};

function client() {
  return createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
}

describe("mock server: manual issue lifecycle", () => {
  it("creates, reloads, replays the same idempotency key and rejects a changed payload", async () => {
    const { client: c } = client();
    const created = await c.createIssue({ ...baseIssue, idempotencyKey: "ui-create-0001" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.status).toBe("open");
    expect(created.data.evidenceIds).toHaveLength(1);
    const again = await c.createIssue({ ...baseIssue, idempotencyKey: "ui-create-0001" });
    expect(again.ok && again.data.id).toBe(created.data.id);
    const changed = await c.createIssue({ ...baseIssue, title: "different", idempotencyKey: "ui-create-0001" });
    expect(!changed.ok && changed.error.code).toBe("DUPLICATE_ACTION");
    const detail = await c.getIssue(created.data.id);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(IssueDetailSchema.safeParse(detail.data).success).toBe(true);
    expect(detail.data.entities.map((e) => e.origin?.sourcingType)).toEqual(["in_house", "supplier", "in_house", "in_house"]);
    expect(detail.data.audit[0]?.kind).toBe("created");
  });

  it("rejects stale updates and unknown references", async () => {
    const { client: c } = client();
    const created = await c.createIssue({ ...baseIssue, idempotencyKey: "ui-create-0002" });
    if (!created.ok) throw new Error("create failed");
    const ok = await c.updateIssue(created.data.id, { expectedVersion: 1, assignedTeamId: EV_DEMO.teams.inHouseManufacturing });
    expect(ok.ok && ok.data.version).toBe(2);
    const stale = await c.updateIssue(created.data.id, { expectedVersion: 1, assignedTeamId: EV_DEMO.teams.assembly });
    expect(!stale.ok && stale.error.code).toBe("STALE_VERSION");
    const bad = await c.updateIssue(created.data.id, { expectedVersion: 2, assignedTeamId: "TEAM-NOPE" });
    expect(!bad.ok && bad.error.code).toBe("INVALID_REFERENCE");
  });

  it("blocks closure before a passed verification, closes after, keeps history on reopen", async () => {
    const { client: c } = client();
    const created = await c.createIssue({ ...baseIssue, idempotencyKey: "ui-create-0003" });
    if (!created.ok) throw new Error("create failed");
    const id = created.data.id;
    let version = created.data.version;
    const start = await c.transition(id, { idempotencyKey: "tr-0001", action: "start_work", expectedVersion: version, reason: "", fixRevisionId: null });
    expect(start.ok && start.data.status).toBe("in_progress");
    version = start.ok ? start.data.version : version;

    const fix = await c.createFix(id, { idempotencyKey: "fix-0001", summary: "Re-form bracket", steps: [{ order: 1, instruction: "Re-form per WI-BRKT-014 (placeholder)" }], applicability: { partNumber: "CP-BRKT-200", partRevision: "A", processStepId: "bracket-forming", limitations: [] }, sourceFixRevisionId: EV_DEMO.priorVerifiedFixId, workInstructionRef: "WI-BRKT-014 (placeholder)", evidenceIds: [] });
    expect(fix.ok && fix.data.state).toBe("proposed");
    if (!fix.ok) return;
    version += 1;

    const early = await c.transition(id, { idempotencyKey: "tr-0002", action: "close", expectedVersion: version, reason: "", fixRevisionId: fix.data.id });
    expect(!early.ok && early.error.code).toBe("VERIFICATION_REQUIRED");

    const apply = await c.transition(id, { idempotencyKey: "tr-0003", action: "request_verification", expectedVersion: version, reason: "applied", fixRevisionId: fix.data.id });
    expect(apply.ok && apply.data.status).toBe("pending_verification");
    version = apply.ok ? apply.data.version : version;

    const fail = await c.recordVerification(id, { idempotencyKey: "ver-0001", fixRevisionId: fix.data.id, outcome: "fail", method: "gauge", resultNotes: "still 0.8 mm proud", evidenceIds: [], newEvidence: [] });
    expect(fail.ok).toBe(true);
    version += 1;
    const stillBlocked = await c.transition(id, { idempotencyKey: "tr-0004", action: "close", expectedVersion: version, reason: "", fixRevisionId: fix.data.id });
    expect(!stillBlocked.ok && stillBlocked.error.code).toBe("VERIFICATION_REQUIRED");

    const pass = await c.recordVerification(id, { idempotencyKey: "ver-0002", fixRevisionId: fix.data.id, outcome: "pass", method: "gauge", resultNotes: "within 0.2 mm", evidenceIds: [], newEvidence: [] });
    expect(pass.ok).toBe(true);
    version += 1;
    const closed = await c.transition(id, { idempotencyKey: "tr-0005", action: "close", expectedVersion: version, reason: "verified", fixRevisionId: fix.data.id });
    expect(closed.ok && closed.data.status).toBe("closed");
    version = closed.ok ? closed.data.version : version;

    const reopened = await c.transition(id, { idempotencyKey: "tr-0006", action: "reopen", expectedVersion: version, reason: "recurred", fixRevisionId: null });
    expect(reopened.ok && reopened.data.status).toBe("in_progress");
    const detail = await c.getIssue(id);
    if (!detail.ok) throw new Error("detail failed");
    expect(detail.data.verifications.map((v) => v.outcome)).toEqual(["fail", "pass"]);
    expect(detail.data.audit.filter((a) => a.kind === "transition").map((a) => a.toStatus)).toEqual(["in_progress", "pending_verification", "closed", "in_progress"]);
    expect(detail.data.fixes[0]?.state).toBe("verified");
  });
});

describe("mock server: similar resolutions and insights", () => {
  it("ranks the prior verified bracket fix first with match reasons and applicability warnings", async () => {
    const { client: c } = client();
    const created = await c.createIssue({ ...baseIssue, idempotencyKey: "ui-create-0004" });
    if (!created.ok) throw new Error("create failed");
    const similar = await c.findSimilarResolutions(created.data.id);
    expect(similar.ok).toBe(true);
    if (!similar.ok) return;
    expect(SimilarResolutionsSchema.safeParse(similar.data).success).toBe(true);
    const top = similar.data.results[0];
    expect(top?.sourceFixRevisionId).toBe(EV_DEMO.priorVerifiedFixId);
    expect(top?.sourceIssueId).toBe(EV_DEMO.priorIssueId);
    expect(top?.verificationId).toBe("VER-BRKT-PRIOR-1");
    expect(top?.matchReasons.join(" ")).toContain("same defect code CONNECTOR_MISALIGNED");
    expect(top?.matchReasons.join(" ")).toContain("same part number CP-BRKT-200");
    expect(top?.applicabilityWarnings.some((w) => w.includes("no confirmed cause yet"))).toBe(true);
    // The supplier-caused connector fix shares only the defect family; it must not outrank the bracket fix.
    const conn = similar.data.results.find((r) => r.sourceFixRevisionId === "FIX-CONN-001-V1");
    expect(conn === undefined || conn.rank > top!.rank).toBe(true);
  });

  it("separates reported, assigned and confirmed-cause counts and never fabricates a rate", async () => {
    const { client: c } = client();
    const ins = await c.getInsights({});
    expect(ins.ok).toBe(true);
    if (!ins.ok) return;
    expect(InsightsSchema.safeParse(ins.data).success).toBe(true);
    const fi = ins.data.teams.find((t) => t.teamId === EV_DEMO.teams.finalInspection)!;
    const mfg = ins.data.teams.find((t) => t.teamId === EV_DEMO.teams.inHouseManufacturing)!;
    expect(fi.reportedIssueCount).toBe(6);
    expect(fi.confirmedCauseIssueCount).toBe(0);
    expect(mfg.reportedIssueCount).toBe(0);
    expect(mfg.confirmedCauseIssueCount).toBe(1);
    expect(mfg.confirmedCauseIssueIds).toEqual([EV_DEMO.priorIssueId]);
    const conn = ins.data.suppliers.find((s) => s.supplierId === EV_DEMO.suppliers.connector)!;
    expect(conn.linkedIssueCount).toBe(2);
    expect(conn.confirmedIssueCount).toBe(1);
    expect(conn.cohortComplete).toBe(true);
    expect(conn.affectedUnitRate).toBeCloseTo(1 / 80, 4);
    const lamp = ins.data.suppliers.find((s) => s.supplierId === "SUP-LAMP")!;
    expect(lamp.linkedIssueCount).toBe(1);
    expect(lamp.confirmedIssueCount).toBe(0);
    expect(lamp.affectedUnitRate).toBeNull();
    expect(ins.data.causeTypes.find((b) => b.id === "supplier_component")?.issueCount).toBe(1);
  });

  it("entity context exposes supplier vs in-house origins, replacement history and the vehicle build id without VIN", async () => {
    const { client: c } = client();
    const bracket = await c.getEntityContext(EV_DEMO.entities.bracket);
    expect(bracket.ok).toBe(true);
    if (!bracket.ok) return;
    expect(EntityContextSchema.safeParse(bracket.data).success).toBe(true);
    expect(bracket.data.entity.origin?.sourcingType).toBe("in_house");
    expect(bracket.data.entity.origin?.manufacturingLotCode).toBe(EV_DEMO.manufacturingLotCode);
    expect(bracket.data.currentParents.map((p) => p.id)).toEqual([EV_DEMO.entities.module, EV_DEMO.entities.vehicle]);
    expect(bracket.data.currentParents[1]?.vehicle?.vin).toBeNull();
    const replaced = await c.getEntityContext("CONN-0006");
    if (!replaced.ok) throw new Error("ctx failed");
    expect(replaced.data.currentVehicleIds).toEqual([]);
    expect(replaced.data.historicalVehicleIds).toEqual(["DEMO-EV-006"]);
    const unknown = await c.getEntityContext("GLS-0005-F");
    expect(unknown.ok && unknown.data.entity.origin?.sourcingType).toBe("unknown");
    const missing = await c.getEntityContext("NOPE-1");
    expect(!missing.ok && missing.error.code).toBe("NOT_FOUND");
  });
});
