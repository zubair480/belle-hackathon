/**
 * Synthetic EV charge-port seed shared by the issue and trace DOUBLES (docs/EV_ASSEMBLY_SCOPE.md).
 * All identifiers are fictional. Codey's real Neo4j fixture must use the same ids (EV_DEMO /
 * EV_TRACE_DEMO); this module is a development double seed, not the graph fixture.
 *
 * Story: connectors CONN-000x are bought in supplier lot LOT-SUP-01 (batch code DEMO-SUP-LOT-01);
 * brackets BRKT-000x are made in-house in LOT-MFG-01 (DEMO-MFG-LOT-01, WO-DEMO-0001). Modules
 * CPM-000x combine one connector and one bracket and are installed into builds DEMO-EV-00x.
 * DEMO-EV-003 carries TWO modules (front and rear ports), so both lots touch it twice: it must be
 * counted once. CONN-0006 is a loose onsite candidate; BRKT-0006 is already quarantined.
 */
import type { EntityRecord, Installation } from "@/contracts/common";
import { EV_DEMO } from "@/contracts/issues";

export const EV_LOTS = {
  supplier: { id: "LOT-SUP-01", code: EV_DEMO.supplierLotCode, partNumber: EV_DEMO.parts.connector, supplierId: EV_DEMO.suppliers.connector },
  manufacturing: { id: "LOT-MFG-01", code: EV_DEMO.manufacturingLotCode, partNumber: EV_DEMO.parts.bracket, workOrderId: EV_DEMO.workOrderId, teamId: EV_DEMO.teams.inHouseManufacturing, processStepId: EV_DEMO.processSteps.bracketForming },
} as const;

export type EvSeed = {
  entities: EntityRecord[];
  installations: Installation[];
  shipments: Array<{ id: string; unitId: string; customerId: string; shippedAt: string }>;
  evidenceTexts: Record<string, { sourceName: string; locator: string; text: string }>;
};

const supplierOrigin = (id: string, evid: string): EntityRecord["origin"] => ({
  id: `ORIGIN-${id}`, sourcingType: "supplier", producerOrganizationId: EV_DEMO.suppliers.connector, partNumber: EV_DEMO.parts.connector, partRevision: "A",
  productionLotId: EV_LOTS.supplier.id, supplierId: EV_DEMO.suppliers.connector, supplierBatchCode: EV_LOTS.supplier.code, siteId: null, manufacturingLotCode: null,
  workOrderId: null, manufacturingTeamId: null, processStepId: null, evidenceIds: [evid],
});
const inHouseOrigin = (id: string, evid: string): EntityRecord["origin"] => ({
  id: `ORIGIN-${id}`, sourcingType: "in_house", producerOrganizationId: null, partNumber: EV_DEMO.parts.bracket, partRevision: "A",
  productionLotId: EV_LOTS.manufacturing.id, supplierId: null, supplierBatchCode: null, siteId: EV_DEMO.siteId, manufacturingLotCode: EV_LOTS.manufacturing.code,
  workOrderId: EV_LOTS.manufacturing.workOrderId, manufacturingTeamId: EV_LOTS.manufacturing.teamId, processStepId: EV_LOTS.manufacturing.processStepId, evidenceIds: [evid],
});
const moduleOrigin = (id: string): EntityRecord["origin"] => ({
  id: `ORIGIN-${id}`, sourcingType: "in_house", producerOrganizationId: null, partNumber: EV_DEMO.parts.module, partRevision: "A",
  productionLotId: "LOT-MFG-02", supplierId: null, supplierBatchCode: null, siteId: EV_DEMO.siteId, manufacturingLotCode: "DEMO-MFG-LOT-02",
  workOrderId: "WO-DEMO-0002", manufacturingTeamId: EV_DEMO.teams.assembly, processStepId: EV_DEMO.processSteps.chargePortInstall, evidenceIds: [],
});

/** Module n -> vehicle mapping. 0007 is the rear port module of DEMO-EV-003. */
const MODULES: Array<{ n: string; vehicle: string; slot: string }> = [
  { n: "0002", vehicle: "DEMO-EV-002", slot: "chargeport" },
  { n: "0003", vehicle: "DEMO-EV-003", slot: "chargeport" },
  { n: "0004", vehicle: "DEMO-EV-004", slot: "chargeport" },
  { n: "0005", vehicle: "DEMO-EV-005", slot: "chargeport" },
  { n: "0007", vehicle: "DEMO-EV-003", slot: "chargeport-rear" },
];
const SHIPPED = new Set(["DEMO-EV-002", "DEMO-EV-003"]);

export function buildEvSeed(): EvSeed {
  const entities: EntityRecord[] = [];
  const installations: Installation[] = [];
  const evidenceTexts: EvSeed["evidenceTexts"] = {};
  const ev = (id: string, sourceName: string, locator: string, text: string) => {
    evidenceTexts[id] = { sourceName, locator, text };
    return id;
  };
  const put = (e: EntityRecord) => entities.push(e);
  const componentSerials = ["0002", "0003", "0004", "0005", "0006", "0007"];
  for (const n of componentSerials) {
    const recv = ev(`EVID-RECEIPT-CONN-${n}`, "Synthetic receiving record", `receipt:CONN-${n}`, `Connector CONN-${n} received in supplier batch ${EV_LOTS.supplier.code}; incoming inspection recorded.`);
    const mfg = ev(`EVID-MFG-BRKT-${n}`, "Synthetic work order record", `workorder:${EV_LOTS.manufacturing.workOrderId}:BRKT-${n}`, `Bracket BRKT-${n} produced in ${EV_LOTS.manufacturing.code} under ${EV_LOTS.manufacturing.workOrderId} at bracket forming.`);
    put({ id: `CONN-${n}`, kind: "component", partNumber: EV_DEMO.parts.connector, partRevision: "A", serialNumber: `CONN-${n}`, displayCode: `CP-CONN-100 / CONN-${n}`, issuerId: EV_DEMO.suppliers.connector, locationState: n === "0006" ? "onsite" : "installed", origin: supplierOrigin(`CONN-${n}`, recv), vehicle: null });
    put({ id: `BRKT-${n}`, kind: "component", partNumber: EV_DEMO.parts.bracket, partRevision: "A", serialNumber: `BRKT-${n}`, displayCode: `CP-BRKT-200 / BRKT-${n}`, issuerId: null, locationState: n === "0006" ? "quarantine" : "installed", origin: inHouseOrigin(`BRKT-${n}`, mfg), vehicle: null });
  }
  const vehicles = new Set(MODULES.map((m) => m.vehicle));
  for (const v of vehicles) {
    put({ id: v, kind: "vehicle", partNumber: EV_DEMO.parts.vehicle, partRevision: null, serialNumber: v, displayCode: `Build ${v}`, issuerId: null, locationState: SHIPPED.has(v) ? "shipped" : "onsite", origin: null, vehicle: { entityId: v, buildId: v, vin: null } });
  }
  for (const m of MODULES) {
    put({ id: `CPM-${m.n}`, kind: "subassembly", partNumber: EV_DEMO.parts.module, partRevision: "A", serialNumber: `CPM-${m.n}`, displayCode: `CP-MOD-300 / CPM-${m.n}`, issuerId: null, locationState: "installed", origin: moduleOrigin(`CPM-${m.n}`), vehicle: null });
    const build = ev(`EVID-BUILD-${m.n}`, "Synthetic build record", `build:${m.vehicle}:${m.slot}`, `Module CPM-${m.n} (connector CONN-${m.n}, bracket BRKT-${m.n}) installed into build ${m.vehicle} slot ${m.slot}.`);
    installations.push(
      { id: `INST-CONN-${m.n}`, childId: `CONN-${m.n}`, parentId: `CPM-${m.n}`, slotId: "connector", installedAt: "2026-09-03T09:00:00Z", removedAt: null, recordedAt: "2026-09-03T09:05:00Z", evidenceIds: [build] },
      { id: `INST-BRKT-${m.n}`, childId: `BRKT-${m.n}`, parentId: `CPM-${m.n}`, slotId: "bracket", installedAt: "2026-09-03T09:00:00Z", removedAt: null, recordedAt: "2026-09-03T09:05:00Z", evidenceIds: [build] },
      { id: `INST-CPM-${m.n}`, childId: `CPM-${m.n}`, parentId: m.vehicle, slotId: m.slot, installedAt: "2026-09-05T09:00:00Z", removedAt: null, recordedAt: "2026-09-05T09:05:00Z", evidenceIds: [build] },
    );
  }
  const shipments = [...SHIPPED].map((v) => ({ id: `SHIP-${v}`, unitId: v, customerId: "CUST-DEALER-1", shippedAt: "2026-09-10T09:00:00Z" }));
  for (const s of shipments) ev(`EVID-${s.id}`, "Synthetic dispatch note", `shipment:${s.id}`, `Build ${s.unitId} dispatched to ${s.customerId}.`);
  return { entities, installations, shipments, evidenceTexts };
}

/** Expected trace outcomes for the double's EV seed (fixture-defined; mirrors tests/integration/acceptance-expectations.json). */
export const EV_SEED_EXPECTATIONS = {
  supplierRoot: { currentVehicleIds: ["DEMO-EV-002", "DEMO-EV-003", "DEMO-EV-004", "DEMO-EV-005"], counts: { currentOnsiteVehicleCount: 2, currentShippedVehicleCount: 2, currentCustomerCount: 1, looseCandidateComponentCount: 1, quarantinedComponentCount: 0, historicalOnlyVehicleCount: 0, unresolvedOnlyVehicleCount: 0 } },
  manufacturingRoot: { currentVehicleIds: ["DEMO-EV-002", "DEMO-EV-003", "DEMO-EV-004", "DEMO-EV-005"], counts: { currentOnsiteVehicleCount: 2, currentShippedVehicleCount: 2, currentCustomerCount: 1, looseCandidateComponentCount: 0, quarantinedComponentCount: 1, historicalOnlyVehicleCount: 0, unresolvedOnlyVehicleCount: 0 } },
  doubleContainmentVehicleId: "DEMO-EV-003",
} as const;
