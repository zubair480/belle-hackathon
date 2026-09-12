import { describe, expect, it } from "vitest";
import { ASSEMBLY_REGRESSION, TRACE_EXPORT_COLUMNS, type TraceResult, type TraceRow } from "@/contracts/recall";
import { categorize, escapeCell, issuesToCsv, neutralizeCell, safeFileName, traceToCsv } from "@/server/application/export";

const row = (over: Partial<TraceRow>): TraceRow => ({ entityId: "X", entityKind: "vehicle", partNumber: "ARM-100", serialNumber: "X", buildId: "X", vin: null, locationState: "onsite", customerId: null, shipmentLineIds: [], currentContainment: false, historicalContainment: false, hasUnresolvedEvidence: false, engineeringReview: "not_recorded", evidenceIds: [], issueIds: [], ...over });

const run: TraceResult = {
  contractVersion: "assembly-quality-v4", runId: "run-7", revisionId: "rev-1", root: ASSEMBLY_REGRESSION.root, createdAt: "2026-09-12T15:00:00Z", engineVersion: "test", dataHash: "abc", scope: ASSEMBLY_REGRESSION.scope,
  executionStatus: "completed", dataCompleteness: "gaps_found", counts: ASSEMBLY_REGRESSION.revision1.counts,
  rows: [
    row({ entityId: "R001", partNumber: '=HYPERLINK("http://evil")', currentContainment: true, historicalContainment: true, locationState: "shipped", customerId: "+CUST-A", shipmentLineIds: ["SHIP-R001"] }),
    row({ entityId: "R006", historicalContainment: true, engineeringReview: "pending", locationState: "shipped" }),
    row({ entityId: "R005", hasUnresolvedEvidence: true, locationState: "shipped" }),
    row({ entityId: "E005", entityKind: "component", partNumber: "ENC-42", buildId: null, historicalContainment: true, locationState: "onsite" }),
    row({ entityId: "E006", entityKind: "component", partNumber: "ENC-42", buildId: null, locationState: "quarantine" }),
    row({ entityId: "R004", locationState: "shipped" }),
  ],
  issues: [], evidence: [], paths: [], customers: [],
};

describe("CSV export", () => {
  it("neutralizes formula triggers and quotes cells", () => {
    expect(neutralizeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(neutralizeCell("@cmd")).toBe("'@cmd");
    expect(neutralizeCell("-1")).toBe("'-1");
    expect(escapeCell('a "b"')).toBe('"a ""b"""');
    expect(escapeCell(null)).toBe("");
  });

  it("categorizes rows without ever labeling anything safe or cleared", () => {
    expect(categorize(run.rows[0]!)).toBe("current_containment");
    expect(categorize(run.rows[1]!)).toBe("historical_only_review");
    expect(categorize(run.rows[2]!)).toBe("unresolved_scope");
    expect(categorize(run.rows[3]!)).toBe("loose_candidate_component");
    expect(categorize(run.rows[4]!)).toBe("quarantined_component");
    expect(categorize(run.rows[5]!)).toBe("no_recorded_link");
    const csv = traceToCsv(run).toLowerCase();
    expect(csv).not.toMatch(/\bsafe\b/);
    expect(csv).not.toMatch(/\bcleared\b/);
  });

  it("writes the frozen header, rows sorted by entity id and a summary block", () => {
    const csv = traceToCsv(run);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(TRACE_EXPORT_COLUMNS.map((c) => `"${c}"`).join(","));
    expect(lines[1]).toContain('"E005"');
    expect(lines[3]).toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(lines[3]).toContain("\"'+CUST-A\"");
    expect(csv).toContain('"summary","counts.unresolvedOnlyVehicleCount","1"');
    expect(csv).toContain("not a shipment release");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("exports issues with attribution columns and empty cells for unknowns", () => {
    const csv = issuesToCsv([{ issue: { id: "ISS-1", version: 1, status: "open", title: "T", description: "d", origin: "manual", detectedAt: "2026-09-12T10:00:00Z", reportingTeamId: "TEAM-A", assignedTeamId: null, detectionStationId: null, processStepId: null, entityIds: [], partNumber: null, partRevision: null, linkedSupplierIds: ["SUP-X"], defectCode: null, severity: "minor", evidenceIds: [], createdBy: "u", createdAt: "2026-09-12T10:00:00Z", updatedAt: "2026-09-12T10:00:00Z", confirmedCauseId: null, currentFixRevisionId: null }, cause: null, fix: null, lastVerification: null }]);
    const line1 = csv.split("\r\n")[1]!;
    expect(line1).toContain('"ISS-1","open","1","T","minor","manual"');
    expect(line1).toContain('"SUP-X",,,,,,,');
    expect(csv).toContain("linked suppliers are not confirmed faults");
  });

  it("derives filesystem-safe names", () => {
    expect(safeFileName("recallradius-trace", "run/../7 x")).toBe("recallradius-trace-run_.._7_x.csv");
  });
});
