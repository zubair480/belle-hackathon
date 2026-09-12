/**
 * SAMPLE DATA for UI development (mock mode only). Everything here is synthetic and labeled as
 * such in the UI. Identifiers follow EV_DEMO in src/contracts/issues.ts so the mock story matches
 * the seed Codey builds for Neo4j. Public-evidence records keep NHTSA provenance and are never
 * joined to a synthetic vehicle as an actual occurrence.
 */
import type { EntityRecord, Evidence, Installation } from "@/contracts/common";
import { EV_DEMO, type AuditEvent, type CauseAssessment, type FixRevision, type Issue, type IssueComment, type ReferenceCatalog, type Verification } from "@/contracts/issues";

export const MOCK_ACTOR = "qa-reviewer-demo";
export const MOCK_WORKSPACE = EV_DEMO.workspaceId;

/** Deterministic 64-hex "hash" for sample evidence; NOT a real SHA-256 (mock only). */
export function pseudoHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + text.charCodeAt(i), 2246822519) >>> 0;
  }
  const seed = (h1.toString(16) + h2.toString(16)).padStart(16, "0");
  return (seed + seed + seed + seed).slice(0, 64);
}

export const catalog: ReferenceCatalog = {
  contractVersion: "assembly-quality-v4",
  teams: [
    { id: EV_DEMO.teams.finalInspection, name: "Final Inspection", active: true },
    { id: EV_DEMO.teams.inHouseManufacturing, name: "In-house Manufacturing (bracket cell)", active: true },
    { id: EV_DEMO.teams.assembly, name: "Charge-port Assembly", active: true },
    { id: EV_DEMO.teams.supplierQuality, name: "Supplier Quality", active: true },
    { id: EV_DEMO.teams.incomingQuality, name: "Incoming Quality", active: true },
    { id: "TEAM-BODY", name: "Body Shop", active: true },
    { id: "TEAM-BATTERY", name: "Battery Pack Assembly", active: true },
    { id: "TEAM-QUALITY-ENG", name: "Quality Engineering", active: true },
  ],
  suppliers: [
    { id: EV_DEMO.suppliers.connector, name: "Demo Connector Supplier", active: true },
    { id: "SUP-CELLS", name: "Demo Cell Supplier", active: true },
    { id: "SUP-LAMP", name: "Demo Lighting Supplier", active: true },
    { id: "SUP-WHEEL", name: "Demo Wheel Supplier", active: true },
    { id: "SUP-HARNESS", name: "Demo Harness Supplier", active: true },
    { id: "SUP-GLASS", name: "Demo Glazing Supplier", active: true },
  ],
  stations: [
    { id: EV_DEMO.stations.finalInspection, name: "Final Inspection", active: true, siteId: EV_DEMO.siteId, areaLabel: "End of line" },
    { id: EV_DEMO.stations.chargePortAssembly, name: "Charge-port Assembly", active: true, siteId: EV_DEMO.siteId, areaLabel: "Trim line" },
    { id: EV_DEMO.stations.bracketCell, name: "Bracket Forming Cell", active: true, siteId: EV_DEMO.siteId, areaLabel: "In-house manufacturing" },
    { id: "ST-INCOMING", name: "Incoming Inspection", active: true, siteId: EV_DEMO.siteId, areaLabel: "Receiving" },
    { id: "ST-BATTERY-MARRIAGE", name: "Battery Marriage", active: true, siteId: EV_DEMO.siteId, areaLabel: "Chassis line" },
    { id: "ST-BODY-SHOP", name: "Body Shop", active: true, siteId: EV_DEMO.siteId, areaLabel: "Body" },
  ],
  processSteps: [
    { id: EV_DEMO.processSteps.chargePortInstall, name: "Charge-port module install", active: true, areaLabel: "Trim line" },
    { id: EV_DEMO.processSteps.bracketForming, name: "Bracket forming", active: true, areaLabel: "In-house manufacturing" },
    { id: EV_DEMO.processSteps.finalInspection, name: "Final inspection", active: true, areaLabel: "End of line" },
    { id: "incoming-inspection", name: "Incoming inspection", active: true, areaLabel: "Receiving" },
    { id: "battery-pack-assembly", name: "Battery pack assembly", active: true, areaLabel: "Battery shop" },
    { id: "battery-marriage", name: "Battery marriage", active: true, areaLabel: "Chassis line" },
    { id: "door-stamping", name: "Door stamping", active: true, areaLabel: "Body" },
    { id: "drive-unit-assembly", name: "Drive unit assembly", active: true, areaLabel: "Powertrain" },
  ],
  defectCodes: [
    { id: EV_DEMO.defectCodes.misalignment, name: "Connector misaligned", active: true, family: "Charge port" },
    { id: EV_DEMO.defectCodes.bracketDimension, name: "Bracket out of tolerance", active: true, family: "Charge port" },
    { id: "CONNECTOR_PIN_DAMAGE", name: "Connector pin damage", active: true, family: "Charge port" },
    { id: "LAMP_CONDENSATION", name: "Headlamp condensation", active: true, family: "Lighting" },
    { id: "DOOR_GAP", name: "Door gap out of spec", active: true, family: "Body fit" },
    { id: "BATTERY_FASTENER_TORQUE", name: "Battery fastener torque", active: true, family: "HV battery" },
  ],
  sites: [{ id: EV_DEMO.siteId, name: "Demo Plant 1", active: true }],
};

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

const ev = (id: string, sourceName: string, locator: string, text: string, extra?: Partial<Evidence>): Evidence => ({
  id,
  sourceName,
  sourceHash: pseudoHash(text),
  locator,
  text,
  sourceKind: "synthetic",
  sourceRecordId: null,
  sourceUrl: null,
  retrievedAt: null,
  ...extra,
});

export const evidence: Evidence[] = [
  ev("EVID-SUP-RECEIPT-01", "Receiving record (sample)", "receipt/DEMO-SUP-LOT-01", "Connector lot DEMO-SUP-LOT-01 received 2026-09-02, 40 units, incoming inspection passed on sample of 5."),
  ev("EVID-SUP-RECEIPT-02", "Receiving record (sample)", "receipt/DEMO-SUP-LOT-02", "Connector lot DEMO-SUP-LOT-02 received 2026-09-09, 40 units, incoming inspection passed on sample of 5."),
  ev("EVID-MFG-INSP-01", "Bracket cell inspection log (sample)", "log/DEMO-MFG-LOT-01", "Lot DEMO-MFG-LOT-01 formed on work order WO-DEMO-0001; first-article flange dimension 12.4 mm (spec 12.0 +/- 0.3)."),
  ev("EVID-MFG-INSP-00", "Bracket cell inspection log (sample)", "log/DEMO-MFG-LOT-00", "Lot DEMO-MFG-LOT-00 formed on work order WO-DEMO-0000; flange dimension drifted to 12.5 mm at end of shift."),
  ev("EVID-PRIOR-OBS", "Final inspection note (sample)", "issue/ISS-BRKT-PRIOR", "Charge-port door does not close flush on DEMO-EV-002; connector sits 1.5 mm proud on the left side."),
  ev("EVID-PRIOR-GAUGE", "Alignment gauge photo (sample)", "photo/prior-gauge-01", "Alignment gauge reading after re-forming the bracket: within 0.2 mm on all four points."),
  ev("EVID-PRIOR-VERIFY", "Verification record (sample)", "verify/VER-BRKT-PRIOR-1", "Re-installed module on DEMO-EV-002; connector alignment gauge passed; charge-port door flush."),
  ev("EVID-CONN-PIN", "Assembly line photo (sample)", "photo/conn-0006-pin", "Bent pin on connector CONN-0006 visible before installation of the module; packaging intact."),
  ev("EVID-CONN-SUPPLIER-8D", "Supplier response (sample)", "notice/SUP-CONNECTOR-8D-01", "Supplier confirmed a pin-insertion tooling fault affecting part of lot DEMO-SUP-LOT-01; replacement lot DEMO-SUP-LOT-02 shipped.", { sourceKind: "supplier_notice" }),
  ev("EVID-CONN-VERIFY", "Verification record (sample)", "verify/VER-CONN-001-1", "Replacement connector CONN-0106 installed; pin check and alignment gauge passed on DEMO-EV-006."),
  ev("EVID-LAMP-OBS", "Final inspection note (sample)", "issue/ISS-LAMP-002", "Condensation inside left headlamp LAMP-0007 after rain test; no lens crack visible."),
  ev("EVID-DOOR-OBS", "Final inspection note (sample)", "issue/ISS-DOOR-003", "Front door gap 5.1 mm at B-pillar on DEMO-EV-006 (spec 4.0 +/- 0.5)."),
  ev("EVID-BATT-OBS", "Line note (sample)", "issue/ISS-BATT-004", "Torque tool log has no entry for battery fastener row 3 on DEMO-EV-005."),
  ev(
    "EVID-PUBLIC-NHTSA-CP",
    "NHTSA complaints endpoint (public)",
    "complaintsByVehicle?make=hyundai&model=ioniq 5&modelYear=2022",
    "Public complaint category reference for charge-port symptoms. Endpoint returned 404 complaint records across all components on retrieval. Public evidence only: not a record about any synthetic vehicle, supplier or factory here, and not proof of the same cause.",
    {
      sourceKind: "public_complaint",
      sourceRecordId: "NHTSA-complaintsByVehicle-2022-ioniq5",
      sourceUrl: "https://api.nhtsa.gov/complaints/complaintsByVehicle?make=hyundai&model=ioniq%205&modelYear=2022",
      retrievedAt: "2026-09-12T09:00:00Z",
    },
  ),
];

// ---------------------------------------------------------------------------
// Vehicles, components, origins and installations
// ---------------------------------------------------------------------------

export type MockVehicleSpec = {
  suffix: string;
  buildId: string;
  vin: string | null;
  locationState: EntityRecord["locationState"];
  connectorLot: "DEMO-SUP-LOT-01" | "DEMO-SUP-LOT-02";
  bracketLot: string;
  bracketWorkOrder: string;
  windshieldKnown: boolean;
};

export const vehicleSpecs: MockVehicleSpec[] = [
  { suffix: "0002", buildId: "DEMO-EV-002", vin: "DEMOVIN0000000002", locationState: "shipped", connectorLot: "DEMO-SUP-LOT-01", bracketLot: "DEMO-MFG-LOT-00", bracketWorkOrder: "WO-DEMO-0000", windshieldKnown: true },
  { suffix: "0005", buildId: EV_DEMO.vehicleBuildId, vin: null, locationState: "onsite", connectorLot: "DEMO-SUP-LOT-01", bracketLot: EV_DEMO.manufacturingLotCode, bracketWorkOrder: EV_DEMO.workOrderId, windshieldKnown: false },
  { suffix: "0006", buildId: "DEMO-EV-006", vin: "DEMOVIN0000000006", locationState: "onsite", connectorLot: "DEMO-SUP-LOT-01", bracketLot: EV_DEMO.manufacturingLotCode, bracketWorkOrder: EV_DEMO.workOrderId, windshieldKnown: true },
  { suffix: "0007", buildId: "DEMO-EV-007", vin: "DEMOVIN0000000007", locationState: "shipped", connectorLot: "DEMO-SUP-LOT-02", bracketLot: EV_DEMO.manufacturingLotCode, bracketWorkOrder: EV_DEMO.workOrderId, windshieldKnown: false },
];

type OriginArgs = Partial<NonNullable<EntityRecord["origin"]>> & { partNumber: string };
const supplierOrigin = (id: string, supplierId: string, batch: string, a: OriginArgs, evidenceIds: string[] = []): EntityRecord["origin"] => ({
  id,
  sourcingType: "supplier",
  producerOrganizationId: supplierId,
  partNumber: a.partNumber,
  partRevision: a.partRevision ?? null,
  productionLotId: `LOT-${batch}`,
  supplierId,
  supplierBatchCode: batch,
  siteId: null,
  manufacturingLotCode: null,
  workOrderId: null,
  manufacturingTeamId: null,
  processStepId: null,
  evidenceIds,
});
const inHouseOrigin = (id: string, lot: string, workOrder: string, process: string, team: string, a: OriginArgs, evidenceIds: string[] = []): EntityRecord["origin"] => ({
  id,
  sourcingType: "in_house",
  producerOrganizationId: "ORG-DEMO-PLANT",
  partNumber: a.partNumber,
  partRevision: a.partRevision ?? null,
  productionLotId: `LOT-${lot}`,
  supplierId: null,
  supplierBatchCode: null,
  siteId: EV_DEMO.siteId,
  manufacturingLotCode: lot,
  workOrderId: workOrder,
  manufacturingTeamId: team,
  processStepId: process,
  evidenceIds,
});
const unknownOrigin = (id: string, a: OriginArgs): EntityRecord["origin"] => ({
  id,
  sourcingType: "unknown",
  producerOrganizationId: null,
  partNumber: a.partNumber,
  partRevision: a.partRevision ?? null,
  productionLotId: null,
  supplierId: null,
  supplierBatchCode: null,
  siteId: null,
  manufacturingLotCode: null,
  workOrderId: null,
  manufacturingTeamId: null,
  processStepId: null,
  evidenceIds: [],
});

const rec = (
  id: string,
  kind: EntityRecord["kind"],
  partNumber: string,
  partRevision: string | null,
  locationState: EntityRecord["locationState"],
  origin: EntityRecord["origin"],
  vehicle: EntityRecord["vehicle"] = null,
  issuerId: string | null = "ORG-DEMO-PLANT",
): EntityRecord => ({ id, kind, partNumber, partRevision, serialNumber: id, displayCode: id, issuerId, locationState, origin, vehicle });

export function buildEntities(): { entities: EntityRecord[]; installations: Installation[] } {
  const entities: EntityRecord[] = [];
  const installations: Installation[] = [];
  let instSeq = 1;
  const inst = (childId: string, parentId: string, slotId: string, installedAt: string, removedAt: string | null = null, evidenceIds: string[] = []) => {
    installations.push({ id: `INST-${String(instSeq++).padStart(4, "0")}`, childId, parentId, slotId, installedAt, removedAt, recordedAt: installedAt, evidenceIds });
  };

  for (const v of vehicleSpecs) {
    const s = v.suffix;
    const day = { "0002": "2026-08-20", "0005": "2026-09-10", "0006": "2026-09-07", "0007": "2026-09-09" }[s] ?? "2026-09-10";
    const t = (hh: string) => `${day}T${hh}:00Z`;
    const vehicleId = v.buildId;
    const connReceipt = v.connectorLot === "DEMO-SUP-LOT-01" ? "EVID-SUP-RECEIPT-01" : "EVID-SUP-RECEIPT-02";
    const bracketEvidence = v.bracketLot === "DEMO-MFG-LOT-00" ? "EVID-MFG-INSP-00" : "EVID-MFG-INSP-01";
    const inVehicle: EntityRecord["locationState"] = "installed";

    entities.push(rec(vehicleId, "vehicle", EV_DEMO.parts.vehicle, "1", v.locationState, inHouseOrigin(`ORG-VEH-${s}`, `DEMO-VEH-LOT-${s}`, `WO-VEH-${s}`, "final-assembly", EV_DEMO.teams.assembly, { partNumber: EV_DEMO.parts.vehicle, partRevision: "1" }), { entityId: vehicleId, buildId: v.buildId, vin: v.vin }));

    // Charge-port path: purchased connector + in-house bracket -> in-house module -> vehicle
    const conn = `CONN-${s}`;
    const brkt = `BRKT-${s}`;
    const mod = `CPM-${s}`;
    entities.push(rec(conn, "component", EV_DEMO.parts.connector, "B", s === "0006" ? "quarantine" : inVehicle, supplierOrigin(`ORG-CONN-${s}`, EV_DEMO.suppliers.connector, v.connectorLot, { partNumber: EV_DEMO.parts.connector, partRevision: "B" }, [connReceipt]), null, EV_DEMO.suppliers.connector));
    entities.push(rec(brkt, "component", EV_DEMO.parts.bracket, "A", inVehicle, inHouseOrigin(`ORG-BRKT-${s}`, v.bracketLot, v.bracketWorkOrder, EV_DEMO.processSteps.bracketForming, EV_DEMO.teams.inHouseManufacturing, { partNumber: EV_DEMO.parts.bracket, partRevision: "A" }, [bracketEvidence])));
    entities.push(rec(mod, "subassembly", EV_DEMO.parts.module, "A", inVehicle, inHouseOrigin(`ORG-CPM-${s}`, `DEMO-ASM-LOT-01`, `WO-DEMO-0100`, EV_DEMO.processSteps.chargePortInstall, EV_DEMO.teams.assembly, { partNumber: EV_DEMO.parts.module, partRevision: "A" })));
    inst(brkt, mod, "bracket", t("08:10"));
    if (s === "0006") {
      // Connector replaced after pin damage: historical containment for CONN-0006, current for CONN-0106.
      inst(conn, mod, "connector", t("08:20"), "2026-09-08T14:00:00Z", ["EVID-CONN-PIN"]);
      const conn2 = `CONN-0106`;
      entities.push(rec(conn2, "component", EV_DEMO.parts.connector, "B", inVehicle, supplierOrigin(`ORG-CONN-0106`, EV_DEMO.suppliers.connector, "DEMO-SUP-LOT-02", { partNumber: EV_DEMO.parts.connector, partRevision: "B" }, ["EVID-SUP-RECEIPT-02"]), null, EV_DEMO.suppliers.connector));
      inst(conn2, mod, "connector", "2026-09-08T14:10:00Z", null, ["EVID-CONN-VERIFY"]);
    } else {
      inst(conn, mod, "connector", t("08:20"));
    }
    inst(mod, vehicleId, "charge-port", t("09:30"));

    // HV battery pack (in-house assembled) containing purchased cell modules
    const batt = `BATT-${s}`;
    const cells = `CELL-${s}`;
    entities.push(rec(batt, "subassembly", "BP-400", "C", inVehicle, inHouseOrigin(`ORG-BATT-${s}`, `DEMO-BATT-LOT-02`, `WO-BATT-0002`, "battery-pack-assembly", "TEAM-BATTERY", { partNumber: "BP-400", partRevision: "C" })));
    entities.push(rec(cells, "component", "CELL-MOD-410", "2", inVehicle, supplierOrigin(`ORG-CELL-${s}`, "SUP-CELLS", "DEMO-CELL-LOT-07", { partNumber: "CELL-MOD-410", partRevision: "2" }), null, "SUP-CELLS"));
    inst(cells, batt, "module-bay", t("06:00"));
    inst(batt, vehicleId, "underbody", t("07:00"));

    // Drive units (in-house), lamps/wheels/harness (supplier), door (in-house), windshield (unknown or supplier)
    const fdu = `FDU-${s}`;
    const rdu = `RDU-${s}`;
    entities.push(rec(fdu, "subassembly", "DU-500", "B", inVehicle, inHouseOrigin(`ORG-FDU-${s}`, `DEMO-DU-LOT-03`, `WO-DU-0003`, "drive-unit-assembly", "TEAM-BATTERY", { partNumber: "DU-500", partRevision: "B" })));
    entities.push(rec(rdu, "subassembly", "DU-500", "B", inVehicle, inHouseOrigin(`ORG-RDU-${s}`, `DEMO-DU-LOT-03`, `WO-DU-0003`, "drive-unit-assembly", "TEAM-BATTERY", { partNumber: "DU-500", partRevision: "B" })));
    inst(fdu, vehicleId, "front-axle", t("07:20"));
    inst(rdu, vehicleId, "rear-axle", t("07:25"));

    const lamp = `LAMP-${s}`;
    entities.push(rec(lamp, "component", "LMP-600", "A", inVehicle, supplierOrigin(`ORG-LAMP-${s}`, "SUP-LAMP", "DEMO-LAMP-LOT-03", { partNumber: "LMP-600", partRevision: "A" }), null, "SUP-LAMP"));
    inst(lamp, vehicleId, "headlamp-left", t("09:00"));

    const whlF = `WHL-${s}-F`;
    const whlR = `WHL-${s}-R`;
    entities.push(rec(whlF, "component", "WHL-700", null, inVehicle, supplierOrigin(`ORG-WHLF-${s}`, "SUP-WHEEL", "DEMO-WHL-LOT-11", { partNumber: "WHL-700" }), null, "SUP-WHEEL"));
    entities.push(rec(whlR, "component", "WHL-700", null, inVehicle, supplierOrigin(`ORG-WHLR-${s}`, "SUP-WHEEL", "DEMO-WHL-LOT-11", { partNumber: "WHL-700" }), null, "SUP-WHEEL"));
    inst(whlF, vehicleId, "wheel-front-left", t("10:00"));
    inst(whlR, vehicleId, "wheel-rear-left", t("10:05"));

    const hvc = `HVC-${s}`;
    entities.push(rec(hvc, "component", "HV-950", "A", inVehicle, supplierOrigin(`ORG-HVC-${s}`, "SUP-HARNESS", "DEMO-HVC-LOT-05", { partNumber: "HV-950", partRevision: "A" }), null, "SUP-HARNESS"));
    inst(hvc, vehicleId, "hv-harness", t("07:40"));

    const door = `DOOR-${s}-F`;
    entities.push(rec(door, "component", "DR-800", "A", inVehicle, inHouseOrigin(`ORG-DOOR-${s}`, `DEMO-DOOR-LOT-09`, `WO-DOOR-0009`, "door-stamping", "TEAM-BODY", { partNumber: "DR-800", partRevision: "A" })));
    inst(door, vehicleId, "door-front-left", t("05:30"));

    const gls = `GLS-${s}`;
    entities.push(rec(gls, "component", "GLS-900", null, inVehicle, v.windshieldKnown ? supplierOrigin(`ORG-GLS-${s}`, "SUP-GLASS", "DEMO-GLS-LOT-02", { partNumber: "GLS-900" }) : unknownOrigin(`ORG-GLS-${s}`, { partNumber: "GLS-900" }), null, v.windshieldKnown ? "SUP-GLASS" : null));
    inst(gls, vehicleId, "windshield", t("08:40"));
  }
  return { entities, installations };
}

// ---------------------------------------------------------------------------
// Seeded issues (prior verified bracket fix, supplier-caused case, open cases)
// ---------------------------------------------------------------------------

const T = EV_DEMO.teams;
const S = EV_DEMO.stations;
const P = EV_DEMO.processSteps;

export const issues: Issue[] = [
  {
    id: EV_DEMO.priorIssueId,
    version: 7,
    status: "closed",
    title: "Charge-port connector misaligned on DEMO-EV-002 (bracket out of tolerance)",
    description: "Charge-port door not flush; connector sits proud on the left side after module install.",
    origin: "manual",
    detectedAt: "2026-08-21T09:15:00Z",
    reportingTeamId: T.finalInspection,
    assignedTeamId: T.inHouseManufacturing,
    detectionStationId: S.finalInspection,
    processStepId: P.chargePortInstall,
    entityIds: ["CPM-0002", "BRKT-0002", "DEMO-EV-002"],
    partNumber: EV_DEMO.parts.bracket,
    partRevision: "A",
    linkedSupplierIds: [EV_DEMO.suppliers.connector],
    defectCode: EV_DEMO.defectCodes.misalignment,
    severity: "major",
    evidenceIds: ["EVID-PRIOR-OBS"],
    createdBy: "final-inspection-op-1",
    createdAt: "2026-08-21T09:20:00Z",
    updatedAt: "2026-08-23T16:00:00Z",
    confirmedCauseId: "CAUSE-PRIOR-2",
    currentFixRevisionId: EV_DEMO.priorVerifiedFixId,
  },
  {
    id: "ISS-SUP-CONN-001",
    version: 6,
    status: "closed",
    title: "Connector pin damage on DEMO-EV-006 charge-port module",
    description: "Bent pin found on connector CONN-0006 before module installation.",
    origin: "manual",
    detectedAt: "2026-09-07T08:25:00Z",
    reportingTeamId: T.assembly,
    assignedTeamId: T.supplierQuality,
    detectionStationId: S.chargePortAssembly,
    processStepId: P.chargePortInstall,
    entityIds: ["CONN-0006", "CPM-0006", "DEMO-EV-006"],
    partNumber: EV_DEMO.parts.connector,
    partRevision: "B",
    linkedSupplierIds: [EV_DEMO.suppliers.connector],
    defectCode: "CONNECTOR_PIN_DAMAGE",
    severity: "major",
    evidenceIds: ["EVID-CONN-PIN"],
    createdBy: "assembly-op-3",
    createdAt: "2026-09-07T08:30:00Z",
    updatedAt: "2026-09-08T15:00:00Z",
    confirmedCauseId: "CAUSE-CONN-1",
    currentFixRevisionId: "FIX-CONN-001-V1",
  },
  {
    id: "ISS-LAMP-002",
    version: 3,
    status: "in_progress",
    title: "Headlamp condensation on DEMO-EV-007 after rain test",
    description: "Condensation inside the left headlamp after the rain test; lens intact.",
    origin: "manual",
    detectedAt: "2026-09-09T15:40:00Z",
    reportingTeamId: T.finalInspection,
    assignedTeamId: T.supplierQuality,
    detectionStationId: S.finalInspection,
    processStepId: P.finalInspection,
    entityIds: ["LAMP-0007", "DEMO-EV-007"],
    partNumber: "LMP-600",
    partRevision: "A",
    linkedSupplierIds: ["SUP-LAMP"],
    defectCode: "LAMP_CONDENSATION",
    severity: "minor",
    evidenceIds: ["EVID-LAMP-OBS"],
    createdBy: "final-inspection-op-2",
    createdAt: "2026-09-09T15:45:00Z",
    updatedAt: "2026-09-10T09:00:00Z",
    confirmedCauseId: null,
    currentFixRevisionId: null,
  },
  {
    id: "ISS-DOOR-003",
    version: 2,
    status: "triaged",
    title: "Front door gap out of spec on DEMO-EV-006",
    description: "Front door gap 5.1 mm at B-pillar.",
    origin: "manual",
    detectedAt: "2026-09-10T11:05:00Z",
    reportingTeamId: T.finalInspection,
    assignedTeamId: "TEAM-BODY",
    detectionStationId: S.finalInspection,
    processStepId: P.finalInspection,
    entityIds: ["DOOR-0006-F", "DEMO-EV-006"],
    partNumber: "DR-800",
    partRevision: "A",
    linkedSupplierIds: [],
    defectCode: "DOOR_GAP",
    severity: "minor",
    evidenceIds: ["EVID-DOOR-OBS"],
    createdBy: "final-inspection-op-1",
    createdAt: "2026-09-10T11:10:00Z",
    updatedAt: "2026-09-10T12:00:00Z",
    confirmedCauseId: null,
    currentFixRevisionId: null,
  },
  {
    id: "ISS-BATT-004",
    version: 1,
    status: "open",
    title: "Battery fastener torque not recorded on DEMO-EV-005",
    description: "Torque tool log missing an entry for fastener row 3 during battery marriage.",
    origin: "manual",
    detectedAt: "2026-09-10T07:10:00Z",
    reportingTeamId: T.assembly,
    assignedTeamId: null,
    detectionStationId: "ST-BATTERY-MARRIAGE",
    processStepId: "battery-marriage",
    entityIds: ["BATT-0005", EV_DEMO.vehicleBuildId],
    partNumber: "BP-400",
    partRevision: "C",
    linkedSupplierIds: [],
    defectCode: "BATTERY_FASTENER_TORQUE",
    severity: "major",
    evidenceIds: ["EVID-BATT-OBS"],
    createdBy: "assembly-op-5",
    createdAt: "2026-09-10T07:15:00Z",
    updatedAt: "2026-09-10T07:15:00Z",
    confirmedCauseId: null,
    currentFixRevisionId: null,
  },
];

export const causes: CauseAssessment[] = [
  {
    id: "CAUSE-PRIOR-1",
    issueId: EV_DEMO.priorIssueId,
    state: "rejected",
    causeType: "supplier_component",
    responsibleTeamId: null,
    responsibleSupplierId: EV_DEMO.suppliers.connector,
    causalStationId: null,
    causalProcessStepId: null,
    rationale: "Hypothesis: connector body out of spec. Rejected: connector measured within spec on the gauge; bracket flange was the deviation.",
    evidenceIds: ["EVID-PRIOR-GAUGE"],
    supersedesId: null,
    assessedBy: "quality-eng-1",
    assessedAt: "2026-08-22T10:00:00Z",
    isCurrent: false,
  },
  {
    id: "CAUSE-PRIOR-2",
    issueId: EV_DEMO.priorIssueId,
    state: "confirmed",
    causeType: "in_house_manufacturing",
    responsibleTeamId: T.inHouseManufacturing,
    responsibleSupplierId: null,
    causalStationId: S.bracketCell,
    causalProcessStepId: P.bracketForming,
    rationale: "Bracket flange 12.5 mm at end of shift on lot DEMO-MFG-LOT-00 (spec 12.0 +/- 0.3) shifts the connector left.",
    evidenceIds: ["EVID-MFG-INSP-00", "EVID-PRIOR-GAUGE"],
    supersedesId: "CAUSE-PRIOR-1",
    assessedBy: "quality-eng-1",
    assessedAt: "2026-08-22T14:30:00Z",
    isCurrent: true,
  },
  {
    id: "CAUSE-CONN-1",
    issueId: "ISS-SUP-CONN-001",
    state: "confirmed",
    causeType: "supplier_component",
    responsibleTeamId: null,
    responsibleSupplierId: EV_DEMO.suppliers.connector,
    causalStationId: null,
    causalProcessStepId: null,
    rationale: "Supplier confirmed a pin-insertion tooling fault on part of lot DEMO-SUP-LOT-01.",
    evidenceIds: ["EVID-CONN-PIN", "EVID-CONN-SUPPLIER-8D"],
    supersedesId: null,
    assessedBy: "supplier-quality-1",
    assessedAt: "2026-09-08T09:00:00Z",
    isCurrent: true,
  },
  {
    id: "CAUSE-LAMP-1",
    issueId: "ISS-LAMP-002",
    state: "hypothesis",
    causeType: "supplier_component",
    responsibleTeamId: null,
    responsibleSupplierId: "SUP-LAMP",
    causalStationId: null,
    causalProcessStepId: null,
    rationale: "Suspected lamp vent membrane defect. Not confirmed: lamp not yet returned for analysis.",
    evidenceIds: ["EVID-LAMP-OBS"],
    supersedesId: null,
    assessedBy: "supplier-quality-1",
    assessedAt: "2026-09-10T09:00:00Z",
    isCurrent: false,
  },
];

export const fixes: FixRevision[] = [
  {
    id: EV_DEMO.priorVerifiedFixId,
    issueId: EV_DEMO.priorIssueId,
    version: 1,
    summary: "Re-form bracket flange to spec and re-check connector alignment",
    steps: [
      { order: 1, instruction: "Remove charge-port module and bracket; tag bracket with issue id." },
      { order: 2, instruction: "Re-form bracket flange per WI-BRKT-014 (placeholder work instruction); measure flange 12.0 +/- 0.3 mm." },
      { order: 3, instruction: "Re-install module; check connector alignment gauge on all four points." },
    ],
    applicability: {
      partNumber: EV_DEMO.parts.bracket,
      partRevision: "A",
      processStepId: P.bracketForming,
      limitations: ["Verified on one synthetic vehicle (DEMO-EV-002)", "Applies to revision A brackets from the forming cell; other revisions need engineering review"],
    },
    sourceFixRevisionId: null,
    workInstructionRef: "WI-BRKT-014 (placeholder)",
    evidenceIds: ["EVID-PRIOR-GAUGE"],
    state: "verified",
    createdBy: "mfg-eng-2",
    createdAt: "2026-08-22T15:00:00Z",
    appliedAt: "2026-08-23T08:00:00Z",
  },
  {
    id: "FIX-CONN-001-V1",
    issueId: "ISS-SUP-CONN-001",
    version: 1,
    summary: "Replace connector from lot DEMO-SUP-LOT-02 and quarantine the damaged unit",
    steps: [
      { order: 1, instruction: "Remove CONN-0006, quarantine with supplier claim reference." },
      { order: 2, instruction: "Install replacement connector from lot DEMO-SUP-LOT-02; run pin check." },
    ],
    applicability: { partNumber: EV_DEMO.parts.connector, partRevision: "B", processStepId: P.chargePortInstall, limitations: ["Only for confirmed supplier pin damage; not a fix for misalignment"] },
    sourceFixRevisionId: null,
    workInstructionRef: "WI-CONN-002 (placeholder)",
    evidenceIds: ["EVID-CONN-SUPPLIER-8D"],
    state: "verified",
    createdBy: "supplier-quality-1",
    createdAt: "2026-09-08T10:00:00Z",
    appliedAt: "2026-09-08T14:10:00Z",
  },
];

export const verifications: Verification[] = [
  { id: "VER-BRKT-PRIOR-1", issueId: EV_DEMO.priorIssueId, fixRevisionId: EV_DEMO.priorVerifiedFixId, outcome: "pass", method: "Connector alignment gauge + charge-port door flush check", resultNotes: "All four gauge points within 0.2 mm; door flush.", evidenceIds: ["EVID-PRIOR-VERIFY"], verifiedBy: "final-inspection-op-1", verifiedAt: "2026-08-23T15:30:00Z" },
  { id: "VER-CONN-001-1", issueId: "ISS-SUP-CONN-001", fixRevisionId: "FIX-CONN-001-V1", outcome: "pass", method: "Pin check + alignment gauge", resultNotes: "Replacement connector passed; module re-installed.", evidenceIds: ["EVID-CONN-VERIFY"], verifiedBy: "final-inspection-op-2", verifiedAt: "2026-09-08T15:00:00Z" },
];

export const comments: IssueComment[] = [
  { id: "CMT-PRIOR-1", issueId: EV_DEMO.priorIssueId, body: "Connector itself measured in spec. Checking bracket lot DEMO-MFG-LOT-00 first-article log.", evidenceIds: ["EVID-PRIOR-GAUGE"], authorId: "quality-eng-1", createdAt: "2026-08-22T09:30:00Z" },
  { id: "CMT-LAMP-1", issueId: "ISS-LAMP-002", body: "Lamp sent to supplier for analysis; keep as hypothesis until the report arrives.", evidenceIds: [], authorId: "supplier-quality-1", createdAt: "2026-09-10T09:05:00Z" },
];

const audit = (id: string, issueId: string, kind: AuditEvent["kind"], actorId: string, at: string, summary: string, fromStatus: AuditEvent["fromStatus"] = null, toStatus: AuditEvent["toStatus"] = null, subjectId: string | null = null): AuditEvent => ({ id, issueId, kind, actorId, at, fromStatus, toStatus, summary, subjectId });

export const auditEvents: AuditEvent[] = [
  audit("AUD-P-1", EV_DEMO.priorIssueId, "created", "final-inspection-op-1", "2026-08-21T09:20:00Z", "Issue created by Final Inspection", null, "open"),
  audit("AUD-P-2", EV_DEMO.priorIssueId, "transition", "quality-eng-1", "2026-08-21T13:00:00Z", "Triaged", "open", "triaged"),
  audit("AUD-P-3", EV_DEMO.priorIssueId, "updated", "quality-eng-1", "2026-08-21T13:05:00Z", "Assigned to In-house Manufacturing (bracket cell)"),
  audit("AUD-P-4", EV_DEMO.priorIssueId, "transition", "mfg-eng-2", "2026-08-22T08:00:00Z", "Work started", "triaged", "in_progress"),
  audit("AUD-P-5", EV_DEMO.priorIssueId, "cause_recorded", "quality-eng-1", "2026-08-22T10:00:00Z", "Supplier hypothesis rejected", null, null, "CAUSE-PRIOR-1"),
  audit("AUD-P-6", EV_DEMO.priorIssueId, "cause_recorded", "quality-eng-1", "2026-08-22T14:30:00Z", "Confirmed cause: in-house manufacturing (bracket forming)", null, null, "CAUSE-PRIOR-2"),
  audit("AUD-P-7", EV_DEMO.priorIssueId, "fix_created", "mfg-eng-2", "2026-08-22T15:00:00Z", "Fix v1 proposed", null, null, EV_DEMO.priorVerifiedFixId),
  audit("AUD-P-8", EV_DEMO.priorIssueId, "fix_applied", "mfg-eng-2", "2026-08-23T08:00:00Z", "Fix v1 applied; verification requested", "in_progress", "pending_verification", EV_DEMO.priorVerifiedFixId),
  audit("AUD-P-9", EV_DEMO.priorIssueId, "verification_recorded", "final-inspection-op-1", "2026-08-23T15:30:00Z", "Verification passed", null, null, "VER-BRKT-PRIOR-1"),
  audit("AUD-P-10", EV_DEMO.priorIssueId, "transition", "quality-eng-1", "2026-08-23T16:00:00Z", "Closed with verified fix v1", "pending_verification", "closed", EV_DEMO.priorVerifiedFixId),
  audit("AUD-C-1", "ISS-SUP-CONN-001", "created", "assembly-op-3", "2026-09-07T08:30:00Z", "Issue created by Charge-port Assembly", null, "open"),
  audit("AUD-C-2", "ISS-SUP-CONN-001", "transition", "supplier-quality-1", "2026-09-07T10:00:00Z", "Work started", "open", "in_progress"),
  audit("AUD-C-3", "ISS-SUP-CONN-001", "cause_recorded", "supplier-quality-1", "2026-09-08T09:00:00Z", "Confirmed cause: supplier component", null, null, "CAUSE-CONN-1"),
  audit("AUD-C-4", "ISS-SUP-CONN-001", "fix_created", "supplier-quality-1", "2026-09-08T10:00:00Z", "Fix v1 proposed", null, null, "FIX-CONN-001-V1"),
  audit("AUD-C-5", "ISS-SUP-CONN-001", "fix_applied", "supplier-quality-1", "2026-09-08T14:10:00Z", "Fix v1 applied; verification requested", "in_progress", "pending_verification", "FIX-CONN-001-V1"),
  audit("AUD-C-6", "ISS-SUP-CONN-001", "verification_recorded", "final-inspection-op-2", "2026-09-08T15:00:00Z", "Verification passed", null, null, "VER-CONN-001-1"),
  audit("AUD-C-7", "ISS-SUP-CONN-001", "transition", "supplier-quality-1", "2026-09-08T15:00:00Z", "Closed with verified fix v1", "pending_verification", "closed", "FIX-CONN-001-V1"),
  audit("AUD-L-1", "ISS-LAMP-002", "created", "final-inspection-op-2", "2026-09-09T15:45:00Z", "Issue created by Final Inspection", null, "open"),
  audit("AUD-L-2", "ISS-LAMP-002", "transition", "supplier-quality-1", "2026-09-10T08:00:00Z", "Work started", "open", "in_progress"),
  audit("AUD-L-3", "ISS-LAMP-002", "cause_recorded", "supplier-quality-1", "2026-09-10T09:00:00Z", "Supplier hypothesis recorded (not confirmed)", null, null, "CAUSE-LAMP-1"),
  audit("AUD-D-1", "ISS-DOOR-003", "created", "final-inspection-op-1", "2026-09-10T11:10:00Z", "Issue created by Final Inspection", null, "open"),
  audit("AUD-D-2", "ISS-DOOR-003", "transition", "quality-eng-1", "2026-09-10T12:00:00Z", "Triaged", "open", "triaged"),
  audit("AUD-B-1", "ISS-BATT-004", "created", "assembly-op-5", "2026-09-10T07:15:00Z", "Issue created by Charge-port Assembly", null, "open"),
];

/** Inspection cohorts for supplier rates. Only a complete cohort supports a rate; others are N/A. */
export const supplierCohorts: Record<string, { inspectedUnitCount: number; complete: boolean; note: string }> = {
  [EV_DEMO.suppliers.connector]: { inspectedUnitCount: 80, complete: true, note: "Incoming inspection cohort: lots DEMO-SUP-LOT-01 and -02, 80 units, observation cutoff 2026-09-12 (synthetic)." },
  "SUP-LAMP": { inspectedUnitCount: 0, complete: false, note: "No inspection cohort recorded for SUP-LAMP; rate N/A." },
};
