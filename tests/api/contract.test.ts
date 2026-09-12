/**
 * Contract smoke tests for assembly-quality-v4. These validate schema shapes and the shared
 * regression oracles; they are not application, persistence or UI tests.
 */
import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_REGRESSION,
  CONTRACT_VERSION,
  DomainError,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  EV_TRACE_DEMO,
  ImportInputSchema,
  ProductionOriginSchema,
  ScopeSchema,
  TraceCountsDeltaSchema,
  TraceRequestSchema,
  TraceResultSchema,
  VehicleIdentitySchema,
  apiFail,
  apiOk,
  apiResponseSchema,
  isDomainError,
} from "@/contracts/recall";
import {
  CauseAssessmentInputSchema,
  CreateIssueCommandSchema,
  EV_DEMO,
  ISSUE_ROUTES,
  IssueUpdateSchema,
  QUALITY_REGRESSION_EXPECTATIONS,
  SupplierInsightSchema,
  TRANSITIONS,
  TransitionCommandSchema,
  VerificationInputSchema,
} from "@/contracts/issues";
import assemblyRun1 from "../../docs/reference/assembly/assembly_reference_output/trace_revision_1.json";
import assemblyRun2 from "../../docs/reference/assembly/assembly_reference_output/trace_revision_2.json";
import quality from "../../docs/reference/quality/quality_issue_reference.json";

describe("v4 contract: version, envelope, errors", () => {
  it("is assembly-quality-v4", () => {
    expect(CONTRACT_VERSION).toBe("assembly-quality-v4");
  });

  it("maps every error code to an HTTP status and round-trips the envelope", () => {
    for (const code of Object.values(ERROR_CODES)) expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    const schema = apiResponseSchema(ScopeSchema);
    expect(schema.safeParse(apiOk(EV_TRACE_DEMO.scope)).success).toBe(true);
    expect(schema.safeParse(apiFail("STALE_VERSION", "stale")).success).toBe(true);
    expect(schema.safeParse({ ok: false, error: { code: "NOPE", message: "x" } }).success).toBe(false);
    expect(isDomainError(new DomainError("VERIFICATION_REQUIRED", "m"))).toBe(true);
  });
});

describe("v4 contract: issue commands", () => {
  const command = {
    idempotencyKey: "create-issue-0001",
    title: "Charge-port connector misaligned on DEMO-EV-005",
    description: "Operator marks module and connector after final inspection.",
    origin: "manual",
    detectedAt: "2026-09-12T10:00:00Z",
    reportingTeamId: EV_DEMO.teams.finalInspection,
    assignedTeamId: null,
    detectionStationId: EV_DEMO.stations.finalInspection,
    processStepId: null,
    entityIds: [EV_DEMO.entities.module, EV_DEMO.entities.connector, EV_DEMO.entities.vehicle],
    partNumber: EV_DEMO.parts.module,
    partRevision: null,
    linkedSupplierIds: [EV_DEMO.suppliers.connector],
    defectCode: EV_DEMO.defectCodes.misalignment,
    severity: "major",
    evidenceIds: [],
  };

  it("accepts a manual issue with unknown context and no evidence, requires an idempotency key", () => {
    expect(CreateIssueCommandSchema.safeParse(command).success).toBe(true);
    const { idempotencyKey: _k, ...noKey } = command;
    expect(CreateIssueCommandSchema.safeParse(noKey).success).toBe(false);
    expect(CreateIssueCommandSchema.safeParse({ ...command, severity: "urgent" }).success).toBe(false);
  });

  it("PATCH requires expectedVersion and cannot change status", () => {
    expect(IssueUpdateSchema.safeParse({ expectedVersion: 1, assignedTeamId: EV_DEMO.teams.assembly }).success).toBe(true);
    expect(IssueUpdateSchema.safeParse({ assignedTeamId: "x" }).success).toBe(false);
    const parsed = IssueUpdateSchema.safeParse({ expectedVersion: 1, status: "closed" });
    expect(parsed.success && "status" in parsed.data).toBe(false);
  });

  it("transitions are frozen and close needs a fix revision reference", () => {
    expect(TRANSITIONS.close.to).toBe("closed");
    expect(TRANSITIONS.reopen.to).toBe("in_progress");
    expect(TransitionCommandSchema.safeParse({ idempotencyKey: "tr-000001", action: "close", expectedVersion: 3, fixRevisionId: "FIX-1" }).success).toBe(true);
    expect(TransitionCommandSchema.safeParse({ idempotencyKey: "tr-000001", action: "finish", expectedVersion: 3 }).success).toBe(false);
  });

  it("cause assessments distinguish state, cause type and responsible party; in_house_manufacturing exists", () => {
    const r = CauseAssessmentInputSchema.safeParse({
      idempotencyKey: "cause-000001",
      state: "confirmed",
      causeType: "in_house_manufacturing",
      responsibleTeamId: EV_DEMO.teams.inHouseManufacturing,
      responsibleSupplierId: null,
      causalStationId: EV_DEMO.stations.bracketCell,
      rationale: "Bracket dimension out of tolerance per inspection record.",
      evidenceIds: ["EVID-1"],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.supersedesId).toBeNull();
  });

  it("verification input carries outcome and fix revision", () => {
    expect(VerificationInputSchema.safeParse({ idempotencyKey: "ver-000001", fixRevisionId: "FIX-1", outcome: "fail", method: "Gauge check", resultNotes: "Still misaligned", evidenceIds: [] }).success).toBe(true);
    expect(VerificationInputSchema.safeParse({ idempotencyKey: "ver-000001", fixRevisionId: "FIX-1", outcome: "maybe", method: "m", resultNotes: "n", evidenceIds: [] }).success).toBe(false);
  });

  it("supplier insight rates are nullable, never fabricated", () => {
    const base = { supplierId: "SUP-X", supplierName: "X", linkedIssueCount: 3, confirmedIssueCount: 1, distinctAffectedUnitCount: 1, linkedIssueIds: ["I1", "I2", "I3"], confirmedIssueIds: ["I1"] };
    expect(SupplierInsightSchema.safeParse({ ...base, inspectedUnitCount: null, cohortComplete: false, affectedUnitRate: null }).success).toBe(true);
    expect(SupplierInsightSchema.safeParse({ ...base, inspectedUnitCount: 20, cohortComplete: true, affectedUnitRate: 1.5 }).success).toBe(false);
  });

  it("routes are frozen", () => {
    expect(ISSUE_ROUTES.issueGet.path("ISS 1")).toBe("/api/issues/ISS%201");
    expect(ISSUE_ROUTES.issueTransition.path("A")).toBe("/api/issues/A/transitions");
  });
});

describe("v4 contract: provenance and entities", () => {
  it("supports supplier, in-house and unknown origins without disguising a team as a supplier", () => {
    const base = { id: "ORG-1", producerOrganizationId: null, partNumber: "CP-BRKT-200", partRevision: "A", productionLotId: "LOT-MFG-01", supplierId: null, supplierBatchCode: null, siteId: "PLANT-1", manufacturingLotCode: "DEMO-MFG-LOT-01", workOrderId: "WO-DEMO-0001", manufacturingTeamId: "TEAM-INHOUSE-MFG", processStepId: "bracket-forming", evidenceIds: [] };
    expect(ProductionOriginSchema.safeParse({ ...base, sourcingType: "in_house" }).success).toBe(true);
    expect(ProductionOriginSchema.safeParse({ ...base, sourcingType: "supplier", supplierId: "SUP-CONNECTOR", supplierBatchCode: "DEMO-SUP-LOT-01" }).success).toBe(true);
    expect(ProductionOriginSchema.safeParse({ ...base, sourcingType: "vendor" }).success).toBe(false);
  });

  it("vehicle identity uses a build id and nullable VIN", () => {
    expect(VehicleIdentitySchema.safeParse({ entityId: "DEMO-EV-005", buildId: "DEMO-EV-005", vin: null }).success).toBe(true);
    expect(VehicleIdentitySchema.safeParse({ entityId: "DEMO-EV-005", buildId: "DEMO-EV-005", vin: "short" }).success).toBe(false);
  });
});

describe("v4 contract: trace requests, results and regression oracle", () => {
  it("requires the contract version, a root selector and a coherent scope", () => {
    const ok = TraceRequestSchema.safeParse({ contractVersion: "assembly-quality-v4", revisionId: "rev-1", root: ASSEMBLY_REGRESSION.root, scope: ASSEMBLY_REGRESSION.scope });
    expect(ok.success).toBe(true);
    expect(TraceRequestSchema.safeParse({ contractVersion: "assembly-quality-v3", revisionId: "rev-1", root: ASSEMBLY_REGRESSION.root, scope: ASSEMBLY_REGRESSION.scope }).success).toBe(false);
    expect(ScopeSchema.safeParse({ ...ASSEMBLY_REGRESSION.scope, historyFrom: "2026-12-01T00:00:00Z" }).success).toBe(false);
    expect(TraceRequestSchema.safeParse({ contractVersion: "assembly-quality-v4", revisionId: "rev-1", root: { kind: "crate", id: "X" }, scope: ASSEMBLY_REGRESSION.scope }).success).toBe(false);
  });

  it("accepts manufacturing_lot roots and the five controlled import files", () => {
    expect(TraceRequestSchema.safeParse({ contractVersion: "assembly-quality-v4", revisionId: "rev-1", root: EV_TRACE_DEMO.manufacturingLotRoot, scope: EV_TRACE_DEMO.scope }).success).toBe(true);
    expect(ImportInputSchema.safeParse({ contractVersion: "assembly-quality-v4", files: [{ name: "manufacturing_lots.csv", text: "a" }], scope: EV_TRACE_DEMO.scope }).success).toBe(true);
    expect(ImportInputSchema.safeParse({ contractVersion: "assembly-quality-v4", files: [{ name: "lots.csv", text: "a" }], scope: EV_TRACE_DEMO.scope }).success).toBe(false);
  });

  it("validates a minimal TraceResult with integer counts and a signed delta", () => {
    const run = {
      contractVersion: "assembly-quality-v4", runId: "run-1", revisionId: "rev-1", root: ASSEMBLY_REGRESSION.root, createdAt: "2026-09-12T12:00:00Z",
      engineVersion: "test", dataHash: "abc", scope: ASSEMBLY_REGRESSION.scope, executionStatus: "completed", dataCompleteness: "gaps_found",
      counts: ASSEMBLY_REGRESSION.revision1.counts, rows: [], issues: [], evidence: [], paths: [], customers: [],
    };
    expect(TraceResultSchema.safeParse(run).success).toBe(true);
    expect(TraceResultSchema.safeParse({ ...run, counts: { ...run.counts, currentCustomerCount: 1.5 } }).success).toBe(false);
    expect(TraceCountsDeltaSchema.safeParse(ASSEMBLY_REGRESSION.delta).success).toBe(true);
  });

  it("regression oracle matches the reference assembly output (robot ids mapped to vehicle counts)", () => {
    const map = (c: typeof assemblyRun1.counts) => ({
      currentOnsiteVehicleCount: c.currentOnsiteRobotCount,
      currentShippedVehicleCount: c.currentShippedRobotCount,
      currentCustomerCount: c.currentCustomerCount,
      looseCandidateComponentCount: c.looseCandidateComponentCount,
      quarantinedComponentCount: c.quarantinedComponentCount,
      historicalOnlyVehicleCount: c.historicalOnlyRobotCount,
      unresolvedOnlyVehicleCount: c.unresolvedOnlyRobotCount,
    });
    expect(map(assemblyRun1.counts)).toEqual(ASSEMBLY_REGRESSION.revision1.counts);
    expect(map(assemblyRun2.counts)).toEqual(ASSEMBLY_REGRESSION.revision2.counts);
    expect(assemblyRun1.currentRobotIds).toEqual([...ASSEMBLY_REGRESSION.revision1.currentVehicleIds]);
    expect(assemblyRun2.currentRobotIds).toEqual([...ASSEMBLY_REGRESSION.revision2.currentVehicleIds]);
    expect(assemblyRun1.noRecordedLinkRobotIds).toEqual(["R004"]);
  });

  it("quality regression oracle matches the reference fixture", () => {
    expect(quality.expected["SUP-A"].confirmedIssueCount).toBe(QUALITY_REGRESSION_EXPECTATIONS["SUP-A"].confirmedIssueCount);
    expect(quality.expected["SUP-A"].distinctAffectedInspectedUnits).toBe(QUALITY_REGRESSION_EXPECTATIONS["SUP-A"].distinctAffectedUnitCount);
    expect(quality.expected["SUP-A"].rate).toBe(QUALITY_REGRESSION_EXPECTATIONS["SUP-A"].affectedUnitRate);
    expect(quality.expected["SUP-B"].rate).toBe(QUALITY_REGRESSION_EXPECTATIONS["SUP-B"].affectedUnitRate);
    expect(quality.expected.similarFixForManualDemo).toBe(QUALITY_REGRESSION_EXPECTATIONS.similarFixForManualDemo);
  });
});
