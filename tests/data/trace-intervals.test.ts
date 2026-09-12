import { describe, expect, it } from "vitest";
import { buildTraceFromSnapshot, type TraceSnapshot } from "@/server/graph/traces";

const scope = {
  siteId: "PLANT-1",
  configurationAsOf: "2026-09-12T12:00:00Z",
  historyFrom: "2026-09-01T00:00:00Z",
  trackedPartNumber: "CP-CONN-100",
  limitations: [],
};

const snapshot: TraceSnapshot = {
  dataHash: "fixture-hash",
  entities: [
    { entityId: "C1", kind: "component", partNumber: "CP-CONN-100", serialNumber: "C1", buildId: null, vin: null, locationState: "installed", sourcingType: "supplier", engineeringReview: "reviewed", evidenceIds: [] },
    { entityId: "C2", kind: "component", partNumber: "CP-CONN-100", serialNumber: "C2", buildId: null, vin: null, locationState: "installed", sourcingType: "supplier", engineeringReview: "reviewed", evidenceIds: [] },
    { entityId: "C3", kind: "component", partNumber: "CP-CONN-100", serialNumber: "C3", buildId: null, vin: null, locationState: "onsite", sourcingType: "supplier", engineeringReview: "not_recorded", evidenceIds: [] },
    { entityId: "C4", kind: "component", partNumber: "CP-CONN-100", serialNumber: "C4", buildId: null, vin: null, locationState: "quarantine", sourcingType: "supplier", engineeringReview: "reviewed", evidenceIds: [] },
    { entityId: "C5", kind: "component", partNumber: "CP-CONN-100", serialNumber: "C5", buildId: null, vin: null, locationState: "quarantine", sourcingType: "supplier", engineeringReview: "pending", evidenceIds: [] },
    { entityId: "C9", kind: "component", partNumber: "CP-CONN-100", serialNumber: "C9", buildId: null, vin: null, locationState: "installed", sourcingType: "unknown", engineeringReview: "pending", evidenceIds: [] },
    { entityId: "M1", kind: "subassembly", partNumber: "CP-MOD-300", serialNumber: "M1", buildId: null, vin: null, locationState: "installed", sourcingType: "unknown", engineeringReview: "reviewed", evidenceIds: [] },
    { entityId: "M2", kind: "subassembly", partNumber: "CP-MOD-300", serialNumber: "M2", buildId: null, vin: null, locationState: "installed", sourcingType: "unknown", engineeringReview: "pending", evidenceIds: [] },
    { entityId: "M3", kind: "subassembly", partNumber: "CP-MOD-300", serialNumber: "M3", buildId: null, vin: null, locationState: "installed", sourcingType: "unknown", engineeringReview: "pending", evidenceIds: [] },
    { entityId: "V1", kind: "vehicle", partNumber: "EV-PLATFORM-1", serialNumber: "V1", buildId: "V1", vin: null, locationState: "shipped", sourcingType: "unknown", engineeringReview: "reviewed", evidenceIds: [] },
    { entityId: "V2", kind: "vehicle", partNumber: "EV-PLATFORM-1", serialNumber: "V2", buildId: "V2", vin: null, locationState: "shipped", sourcingType: "unknown", engineeringReview: "pending", evidenceIds: [] },
    { entityId: "V3", kind: "vehicle", partNumber: "EV-PLATFORM-1", serialNumber: "V3", buildId: "V3", vin: null, locationState: "shipped", sourcingType: "unknown", engineeringReview: "pending", evidenceIds: [] },
  ],
  rootLinks: ["C1", "C2", "C3", "C4", "C5"].map((entityId) => ({ entityId, relationshipId: `B17:${entityId}`, evidenceIds: [] })),
  installations: [
    { installationId: "I1", childId: "C1", parentId: "M1", installedAt: "2026-09-02T00:00:00Z", removedAt: null, evidenceIds: [] },
    { installationId: "I2", childId: "C2", parentId: "M1", installedAt: "2026-09-02T00:00:00Z", removedAt: null, evidenceIds: [] },
    { installationId: "I3", childId: "M1", parentId: "V1", installedAt: "2026-09-02T00:00:00Z", removedAt: null, evidenceIds: [] },
    { installationId: "I4", childId: "C5", parentId: "M2", installedAt: "2026-09-02T00:00:00Z", removedAt: "2026-09-08T00:00:00Z", evidenceIds: [] },
    { installationId: "I5", childId: "M2", parentId: "V2", installedAt: "2026-09-02T00:00:00Z", removedAt: null, evidenceIds: [] },
    { installationId: "I6", childId: "C9", parentId: "M3", installedAt: "2026-09-02T00:00:00Z", removedAt: null, evidenceIds: [] },
    { installationId: "I7", childId: "M3", parentId: "V3", installedAt: "2026-09-02T00:00:00Z", removedAt: null, evidenceIds: [] },
  ],
  shipments: [
    { vehicleId: "V1", customerId: "CUST-A", customerName: "Customer A", shipmentId: "S1" },
    { vehicleId: "V2", customerId: "CUST-B", customerName: "Customer B", shipmentId: "S2" },
    { vehicleId: "V3", customerId: "CUST-C", customerName: "Customer C", shipmentId: "S3" },
  ],
  evidence: [],
};

describe("interval-aware trace builder", () => {
  it("deduplicates vehicles, preserves historical exposure, and isolates unknown origins", () => {
    const trace = buildTraceFromSnapshot("rev-1", { kind: "supplier_batch", id: "B17" }, scope, undefined, snapshot);
    expect(trace.executionStatus).toBe("completed");
    expect(trace.counts).toEqual({
      currentOnsiteVehicleCount: 0,
      currentShippedVehicleCount: 1,
      currentCustomerCount: 1,
      looseCandidateComponentCount: 1,
      quarantinedComponentCount: 2,
      historicalOnlyVehicleCount: 1,
      unresolvedOnlyVehicleCount: 1,
    });
    expect(trace.rows.find((row) => row.entityId === "V1")?.currentContainment).toBe(true);
    expect(trace.rows.find((row) => row.entityId === "V2")?.historicalContainment).toBe(true);
    expect(trace.rows.find((row) => row.entityId === "V2")?.currentContainment).toBe(false);
    expect(trace.rows.find((row) => row.entityId === "V3")?.hasUnresolvedEvidence).toBe(true);
  });
});
