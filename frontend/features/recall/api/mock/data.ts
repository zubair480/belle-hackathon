/**
 * SAMPLE DATA for UI development (mock mode only). Everything here is synthetic and labeled as
 * such in the UI. Vehicles are instantiated from the platform part catalog
 * (frontend/data/ev-platform/parts.json) so the sketch, the wiring overlay and the mock share
 * one vocabulary. Identifiers follow EV_DEMO in src/contracts/issues.ts. Public-evidence records
 * keep NHTSA provenance and are never joined to a synthetic vehicle as an actual occurrence.
 */
import type { EntityRecord, Evidence, Installation } from "@/contracts/common";
import { EV_DEMO, type AuditEvent, type CauseAssessment, type FixRevision, type Issue, type IssueComment, type ReferenceCatalog, type Verification } from "@/contracts/issues";
import { PARTS, entityIdFor, type PartSlot } from "../../sketches/car3d";

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

const T = EV_DEMO.teams;
const S = EV_DEMO.stations;
const P = EV_DEMO.processSteps;

export const catalog: ReferenceCatalog = {
  contractVersion: "assembly-quality-v4",
  teams: [
    { id: T.finalInspection, name: "Final Inspection", active: true },
    { id: T.inHouseManufacturing, name: "In-house Manufacturing (bracket cell)", active: true },
    { id: T.assembly, name: "Charge-port Assembly", active: true },
    { id: T.supplierQuality, name: "Supplier Quality", active: true },
    { id: T.incomingQuality, name: "Incoming Quality", active: true },
    { id: "TEAM-BODY", name: "Body Shop", active: true },
    { id: "TEAM-BATTERY", name: "Battery and Drive Unit Assembly", active: true },
    { id: "TEAM-ELECTRONICS", name: "Electronics and Software", active: true },
    { id: "TEAM-QUALITY-ENG", name: "Quality Engineering", active: true },
  ],
  suppliers: [
    { id: EV_DEMO.suppliers.connector, name: "Demo Connector Supplier", active: true },
    { id: "SUP-CELLS", name: "Demo Cell Supplier", active: true },
    { id: "SUP-LAMP", name: "Demo Lighting Supplier", active: true },
    { id: "SUP-WHEEL", name: "Demo Wheel and Tire Supplier", active: true },
    { id: "SUP-HARNESS", name: "Demo Harness Supplier", active: true },
    { id: "SUP-GLASS", name: "Demo Glazing Supplier", active: true },
    { id: "SUP-POWER", name: "Demo Power Electronics Supplier", active: true },
    { id: "SUP-ELEC", name: "Demo Electronics Supplier", active: true },
    { id: "SUP-BATT12", name: "Demo 12 V Battery Supplier", active: true },
    { id: "SUP-INTERIOR", name: "Demo Interior Supplier", active: true },
    { id: "SUP-STEER", name: "Demo Steering Supplier", active: true },
    { id: "SUP-SEATS", name: "Demo Seat Supplier", active: true },
    { id: "SUP-MIRROR", name: "Demo Mirror Supplier", active: true },
    { id: "SUP-PLASTICS", name: "Demo Plastics Supplier", active: true },
    { id: "SUP-THERMAL", name: "Demo Thermal Supplier", active: true },
  ],
  stations: [
    { id: S.finalInspection, name: "Final Inspection", active: true, siteId: EV_DEMO.siteId, areaLabel: "End of line" },
    { id: S.chargePortAssembly, name: "Charge-port Assembly", active: true, siteId: EV_DEMO.siteId, areaLabel: "Trim line" },
    { id: S.bracketCell, name: "Bracket Forming Cell", active: true, siteId: EV_DEMO.siteId, areaLabel: "In-house manufacturing" },
    { id: "ST-INCOMING", name: "Incoming Inspection", active: true, siteId: EV_DEMO.siteId, areaLabel: "Receiving" },
    { id: "ST-BATTERY-MARRIAGE", name: "Battery Marriage", active: true, siteId: EV_DEMO.siteId, areaLabel: "Chassis line" },
    { id: "ST-BODY-SHOP", name: "Body Shop", active: true, siteId: EV_DEMO.siteId, areaLabel: "Body" },
    { id: "ST-ELECTRICAL-EOL", name: "Electrical End-of-line Test", active: true, siteId: EV_DEMO.siteId, areaLabel: "End of line" },
    { id: "ST-WHEEL-FIT", name: "Wheel Fitment", active: true, siteId: EV_DEMO.siteId, areaLabel: "Chassis line" },
  ],
  processSteps: [
    { id: P.chargePortInstall, name: "Charge-port module install", active: true, areaLabel: "Trim line" },
    { id: P.bracketForming, name: "Bracket forming", active: true, areaLabel: "In-house manufacturing" },
    { id: P.finalInspection, name: "Final inspection", active: true, areaLabel: "End of line" },
    { id: "incoming-inspection", name: "Incoming inspection", active: true, areaLabel: "Receiving" },
    { id: "battery-pack-assembly", name: "Battery pack assembly", active: true, areaLabel: "Battery shop" },
    { id: "battery-marriage", name: "Battery marriage", active: true, areaLabel: "Chassis line" },
    { id: "door-stamping", name: "Door and closure stamping", active: true, areaLabel: "Body" },
    { id: "drive-unit-assembly", name: "Drive unit assembly", active: true, areaLabel: "Powertrain" },
    { id: "hv-box-assembly", name: "HV junction box assembly", active: true, areaLabel: "Battery shop" },
    { id: "controller-flash", name: "Controller assembly and flash", active: true, areaLabel: "Electronics" },
    { id: "ip-subassembly", name: "Instrument panel subassembly", active: true, areaLabel: "Trim line" },
    { id: "final-assembly", name: "Final assembly", active: true, areaLabel: "Trim line" },
    { id: "electrical-eol", name: "Electrical end-of-line test", active: true, areaLabel: "End of line" },
    { id: "wheel-fitment", name: "Wheel fitment", active: true, areaLabel: "Chassis line" },
  ],
  defectCodes: [
    { id: EV_DEMO.defectCodes.misalignment, name: "Connector misaligned", active: true, family: "Charge port" },
    { id: EV_DEMO.defectCodes.bracketDimension, name: "Bracket out of tolerance", active: true, family: "Charge port" },
    { id: "CONNECTOR_PIN_DAMAGE", name: "Connector pin damage", active: true, family: "Charge port" },
    { id: "LAMP_CONDENSATION", name: "Headlamp condensation", active: true, family: "Lighting" },
    { id: "DOOR_GAP", name: "Door gap out of spec", active: true, family: "Body fit" },
    { id: "DOOR_SEAL_NOISE", name: "Door seal wind noise", active: true, family: "Body fit" },
    { id: "BATTERY_FASTENER_TORQUE", name: "Battery fastener torque", active: true, family: "HV battery" },
    { id: "NO_WAKE_ON_START", name: "No wake on start button", active: true, family: "Electrical" },
    { id: "TPMS_FAULT", name: "Tire pressure sensor fault", active: true, family: "Chassis" },
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
  ev("EVID-LAMP-OBS", "Final inspection note (sample)", "issue/ISS-LAMP-002", "Condensation inside left headlamp LAMP-0007-L after rain test; no lens crack visible."),
  ev("EVID-DOOR-OBS", "Final inspection note (sample)", "issue/ISS-DOOR-003", "Front left door gap 5.1 mm at B-pillar on DEMO-EV-006 (spec 4.0 +/- 0.5)."),
  ev("EVID-DOOR-NOISE", "Road test note (sample)", "issue/ISS-DOOR-005", "Wind noise at 80 km/h from the front left door upper seal on DEMO-EV-006."),
  ev("EVID-BATT-OBS", "Line note (sample)", "issue/ISS-BATT-004", "Torque tool log has no entry for battery fastener row 3 on DEMO-EV-005."),
  ev("EVID-IGN-OBS", "Electrical EOL log (sample)", "issue/ISS-IGN-006", "Start button press on DEMO-EV-007 gives no wake: cluster stays dark, no contactor click. 12 V battery 12.7 V. Fuse F12 OK."),
  ev("EVID-IGN-SCOPE", "Diagnostic capture (sample)", "capture/ign-0007-scope", "Start request line W-011 stays high at BCM connector X-BCM-A pin 14 while the switch is pressed; switch contact measured OK at X-STSW-01."),
  ev("EVID-TIRE-OBS", "Final inspection note (sample)", "issue/ISS-TIRE-007", "TPMS warning for front right wheel on DEMO-EV-005 at rolling test; pressure measured 2.5 bar (in spec)."),
  ev(
    "EVID-PUBLIC-NHTSA-CP",
    "NHTSA complaints endpoint (public)",
    "complaintsByVehicle?make=hyundai&model=ioniq 5&modelYear=2022",
    "Public complaint category reference for charge-port symptoms. Endpoint returned 404 complaint records across all components on retrieval. Public evidence only: not a record about any synthetic vehicle, supplier or factory here, and not proof of the same cause.",
    { sourceKind: "public_complaint", sourceRecordId: "NHTSA-complaintsByVehicle-2022-ioniq5", sourceUrl: "https://api.nhtsa.gov/complaints/complaintsByVehicle?make=hyundai&model=ioniq%205&modelYear=2022", retrievedAt: "2026-09-12T09:00:00Z" },
  ),
];

// ---------------------------------------------------------------------------
// Customers and shipments
// ---------------------------------------------------------------------------

export const customers: Array<{ id: string; name: string; kind: string }> = [
  { id: "CUST-FLEET-A", name: "Demo Fleet Operator A", kind: "fleet operator" },
  { id: "CUST-DEALER-N", name: "Demo Dealer North", kind: "dealer" },
  { id: "CUST-DEALER-S", name: "Demo Dealer South", kind: "dealer" },
];

export const shipments: Array<{ id: string; vehicleId: string; customerId: string; shippedAt: string }> = [
  { id: "SHP-0002", vehicleId: "DEMO-EV-002", customerId: "CUST-FLEET-A", shippedAt: "2026-08-25T09:00:00Z" },
  { id: "SHP-0003", vehicleId: "DEMO-EV-003", customerId: "CUST-FLEET-A", shippedAt: "2026-09-03T09:00:00Z" },
  { id: "SHP-0004", vehicleId: "DEMO-EV-004", customerId: "CUST-DEALER-S", shippedAt: "2026-09-05T09:00:00Z" },
  { id: "SHP-0007", vehicleId: "DEMO-EV-007", customerId: "CUST-DEALER-N", shippedAt: "2026-09-11T09:00:00Z" },
];

// ---------------------------------------------------------------------------
// Vehicles: instantiate every slot from the platform catalog with per-vehicle overrides
// ---------------------------------------------------------------------------

export type MockVehicleSpec = {
  suffix: string;
  buildId: string;
  vin: string | null;
  locationState: EntityRecord["locationState"];
  builtDay: string;
  /** slot -> origin overrides (e.g. a different lot) */
  overrides: Record<string, Partial<PartSlot>>;
  /** slots whose origin is not recorded on this vehicle */
  unknownOrigin: string[];
};

export const vehicleSpecs: MockVehicleSpec[] = [
  { suffix: "0002", buildId: "DEMO-EV-002", vin: "DEMOVIN0000000002", locationState: "shipped", builtDay: "2026-08-20", overrides: { "charge-bracket": { manufacturingLotCode: "DEMO-MFG-LOT-00", workOrderId: "WO-DEMO-0000" } }, unknownOrigin: [] },
  { suffix: "0003", buildId: "DEMO-EV-003", vin: "DEMOVIN0000000003", locationState: "shipped", builtDay: "2026-09-01", overrides: {}, unknownOrigin: [] },
  { suffix: "0004", buildId: "DEMO-EV-004", vin: "DEMOVIN0000000004", locationState: "shipped", builtDay: "2026-09-03", overrides: { "charge-connector": { supplierBatchCode: "DEMO-SUP-LOT-02" } }, unknownOrigin: ["windshield"] },
  { suffix: "0005", buildId: EV_DEMO.vehicleBuildId, vin: null, locationState: "onsite", builtDay: "2026-09-10", overrides: {}, unknownOrigin: ["windshield"] },
  { suffix: "0006", buildId: "DEMO-EV-006", vin: "DEMOVIN0000000006", locationState: "onsite", builtDay: "2026-09-07", overrides: {}, unknownOrigin: [] },
  { suffix: "0007", buildId: "DEMO-EV-007", vin: "DEMOVIN0000000007", locationState: "shipped", builtDay: "2026-09-09", overrides: { "charge-connector": { supplierBatchCode: "DEMO-SUP-LOT-02" } }, unknownOrigin: ["windshield"] },
];

const RECEIPT_EVIDENCE: Record<string, string> = { "DEMO-SUP-LOT-01": "EVID-SUP-RECEIPT-01", "DEMO-SUP-LOT-02": "EVID-SUP-RECEIPT-02" };
const LOT_EVIDENCE: Record<string, string> = { "DEMO-MFG-LOT-01": "EVID-MFG-INSP-01", "DEMO-MFG-LOT-00": "EVID-MFG-INSP-00" };

function originFor(slot: PartSlot, entityId: string, unknown: boolean): EntityRecord["origin"] {
  const base = { id: `ORG-${entityId}`, partNumber: slot.partNumber, partRevision: slot.partRevision ?? null, evidenceIds: [] as string[] };
  if (unknown || slot.sourcing === "unknown") {
    return { ...base, sourcingType: "unknown", producerOrganizationId: null, productionLotId: null, supplierId: null, supplierBatchCode: null, siteId: null, manufacturingLotCode: null, workOrderId: null, manufacturingTeamId: null, processStepId: null };
  }
  if (slot.sourcing === "supplier") {
    const batch = slot.supplierBatchCode ?? null;
    return { ...base, sourcingType: "supplier", producerOrganizationId: slot.supplierId ?? null, productionLotId: batch ? `LOT-${batch}` : null, supplierId: slot.supplierId ?? null, supplierBatchCode: batch, siteId: null, manufacturingLotCode: null, workOrderId: null, manufacturingTeamId: null, processStepId: null, evidenceIds: batch && RECEIPT_EVIDENCE[batch] ? [RECEIPT_EVIDENCE[batch]!] : [] };
  }
  const lot = slot.manufacturingLotCode ?? null;
  return { ...base, sourcingType: "in_house", producerOrganizationId: "ORG-DEMO-PLANT", productionLotId: lot ? `LOT-${lot}` : null, supplierId: null, supplierBatchCode: null, siteId: EV_DEMO.siteId, manufacturingLotCode: lot, workOrderId: slot.workOrderId ?? null, manufacturingTeamId: slot.manufacturingTeamId ?? null, processStepId: slot.processStepId ?? null, evidenceIds: lot && LOT_EVIDENCE[lot] ? [LOT_EVIDENCE[lot]!] : [] };
}

export function buildEntities(): { entities: EntityRecord[]; installations: Installation[] } {
  const entities: EntityRecord[] = [];
  const installations: Installation[] = [];
  let instSeq = 1;
  const inst = (childId: string, parentId: string, slotId: string, installedAt: string, removedAt: string | null = null, evidenceIds: string[] = []) => {
    installations.push({ id: `INST-${String(instSeq++).padStart(4, "0")}`, childId, parentId, slotId, installedAt, removedAt, recordedAt: installedAt, evidenceIds });
  };
  for (const v of vehicleSpecs) {
    const t = (hh: string) => `${v.builtDay}T${hh}:00Z`;
    const vehicleId = v.buildId;
    entities.push({
      id: vehicleId,
      kind: "vehicle",
      partNumber: EV_DEMO.parts.vehicle,
      partRevision: "1",
      serialNumber: vehicleId,
      displayCode: vehicleId,
      issuerId: "ORG-DEMO-PLANT",
      locationState: v.locationState,
      origin: { id: `ORG-${vehicleId}`, sourcingType: "in_house", producerOrganizationId: "ORG-DEMO-PLANT", partNumber: EV_DEMO.parts.vehicle, partRevision: "1", productionLotId: `LOT-DEMO-VEH-${v.suffix}`, supplierId: null, supplierBatchCode: null, siteId: EV_DEMO.siteId, manufacturingLotCode: `DEMO-VEH-LOT-${v.suffix}`, workOrderId: `WO-VEH-${v.suffix}`, manufacturingTeamId: T.assembly, processStepId: "final-assembly", evidenceIds: [] },
      vehicle: { entityId: vehicleId, buildId: v.buildId, vin: v.vin },
    });
    // Parents first so installations reference existing ids.
    const ordered = [...PARTS.filter((p) => !p.parent), ...PARTS.filter((p) => p.parent)];
    for (const base of ordered) {
      const slot: PartSlot = { ...base, ...(v.overrides[base.slot] ?? {}) } as PartSlot;
      const id = entityIdFor(slot, v.suffix);
      const unknown = v.unknownOrigin.includes(slot.slot);
      const replaced = v.suffix === "0006" && slot.slot === "charge-connector";
      entities.push({
        id,
        kind: slot.kind === "subassembly" ? "subassembly" : "component",
        partNumber: slot.partNumber,
        partRevision: slot.partRevision ?? null,
        serialNumber: id,
        displayCode: id,
        issuerId: slot.sourcing === "supplier" ? (slot.supplierId ?? null) : unknown ? null : "ORG-DEMO-PLANT",
        locationState: replaced ? "quarantine" : "installed",
        origin: originFor(slot, id, unknown),
        vehicle: null,
      });
      const parentId = slot.parent ? entityIdFor(PARTS.find((p) => p.slot === slot.parent)!, v.suffix) : vehicleId;
      const hour = slot.parent ? "06:30" : slot.kind === "subassembly" ? "07:30" : "09:00";
      if (replaced) {
        inst(id, parentId, slot.slot, t("08:20"), "2026-09-08T14:00:00Z", ["EVID-CONN-PIN"]);
        const conn2 = "CONN-0106";
        const slot2 = { ...slot, supplierBatchCode: "DEMO-SUP-LOT-02" } as PartSlot;
        entities.push({ id: conn2, kind: "component", partNumber: slot.partNumber, partRevision: slot.partRevision ?? null, serialNumber: conn2, displayCode: conn2, issuerId: slot.supplierId ?? null, locationState: "installed", origin: originFor(slot2, conn2, false), vehicle: null });
        inst(conn2, parentId, slot.slot, "2026-09-08T14:10:00Z", null, ["EVID-CONN-VERIFY"]);
      } else {
        inst(id, parentId, slot.slot, t(hour));
      }
    }
  }
  return { entities, installations };
}

// ---------------------------------------------------------------------------
// Seeded issues
// ---------------------------------------------------------------------------

const issueBase = { origin: "manual" as const, evidenceIds: [] as string[], confirmedCauseId: null as string | null, currentFixRevisionId: null as string | null };

export const issues: Issue[] = [
  {
    ...issueBase,
    id: EV_DEMO.priorIssueId,
    version: 7,
    status: "closed",
    title: "Charge-port connector misaligned on DEMO-EV-002 (bracket out of tolerance)",
    description: "Charge-port door not flush; connector sits proud on the left side after module install.",
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
    ...issueBase,
    id: "ISS-SUP-CONN-001",
    version: 6,
    status: "closed",
    title: "Connector pin damage on DEMO-EV-006 charge-port module",
    description: "Bent pin found on connector CONN-0006 before module installation.",
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
    ...issueBase,
    id: "ISS-LAMP-002",
    version: 3,
    status: "in_progress",
    title: "Headlamp condensation on DEMO-EV-007 after rain test",
    description: "Condensation inside the left headlamp after the rain test; lens intact.",
    detectedAt: "2026-09-09T15:40:00Z",
    reportingTeamId: T.finalInspection,
    assignedTeamId: T.supplierQuality,
    detectionStationId: S.finalInspection,
    processStepId: P.finalInspection,
    entityIds: ["LAMP-0007-L", "DEMO-EV-007"],
    partNumber: "LMP-600",
    partRevision: "A",
    linkedSupplierIds: ["SUP-LAMP"],
    defectCode: "LAMP_CONDENSATION",
    severity: "minor",
    evidenceIds: ["EVID-LAMP-OBS"],
    createdBy: "final-inspection-op-2",
    createdAt: "2026-09-09T15:45:00Z",
    updatedAt: "2026-09-10T09:00:00Z",
  },
  {
    ...issueBase,
    id: "ISS-DOOR-003",
    version: 2,
    status: "triaged",
    title: "Front left door gap out of spec on DEMO-EV-006",
    description: "Front door gap 5.1 mm at B-pillar.",
    detectedAt: "2026-09-10T11:05:00Z",
    reportingTeamId: T.finalInspection,
    assignedTeamId: "TEAM-BODY",
    detectionStationId: S.finalInspection,
    processStepId: P.finalInspection,
    entityIds: ["DOOR-0006-FL", "DEMO-EV-006"],
    partNumber: "DR-800",
    partRevision: "A",
    linkedSupplierIds: [],
    defectCode: "DOOR_GAP",
    severity: "minor",
    evidenceIds: ["EVID-DOOR-OBS"],
    createdBy: "final-inspection-op-1",
    createdAt: "2026-09-10T11:10:00Z",
    updatedAt: "2026-09-10T12:00:00Z",
  },
  {
    ...issueBase,
    id: "ISS-BATT-004",
    version: 1,
    status: "open",
    title: "Battery fastener torque not recorded on DEMO-EV-005",
    description: "Torque tool log missing an entry for fastener row 3 during battery marriage.",
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
  },
  {
    ...issueBase,
    id: "ISS-DOOR-005",
    version: 1,
    status: "open",
    title: "Front left door seal wind noise on DEMO-EV-006",
    description: "Wind noise at 80 km/h from the upper seal of the front left door during road test.",
    detectedAt: "2026-09-11T10:20:00Z",
    reportingTeamId: T.finalInspection,
    assignedTeamId: null,
    detectionStationId: S.finalInspection,
    processStepId: P.finalInspection,
    entityIds: ["DOOR-0006-FL", "DEMO-EV-006"],
    partNumber: "DR-800",
    partRevision: "A",
    linkedSupplierIds: [],
    defectCode: "DOOR_SEAL_NOISE",
    severity: "minor",
    evidenceIds: ["EVID-DOOR-NOISE"],
    createdBy: "final-inspection-op-2",
    createdAt: "2026-09-11T10:25:00Z",
    updatedAt: "2026-09-11T10:25:00Z",
  },
  {
    ...issueBase,
    id: "ISS-IGN-006",
    version: 3,
    status: "triaged",
    title: "No wake on start button press on DEMO-EV-007",
    description: "Pressing the start switch does not wake the vehicle: cluster dark, no contactor click. 12 V battery healthy.",
    detectedAt: "2026-09-10T16:05:00Z",
    reportingTeamId: T.finalInspection,
    assignedTeamId: "TEAM-ELECTRONICS",
    detectionStationId: "ST-ELECTRICAL-EOL",
    processStepId: "electrical-eol",
    entityIds: ["STSW-0007", "BCM-0007", "LVH-0007-C", "DEMO-EV-007"],
    partNumber: "EL-SW-115",
    partRevision: "A",
    linkedSupplierIds: ["SUP-ELEC", "SUP-HARNESS"],
    defectCode: "NO_WAKE_ON_START",
    severity: "critical",
    evidenceIds: ["EVID-IGN-OBS", "EVID-IGN-SCOPE"],
    createdBy: "eol-tester-1",
    createdAt: "2026-09-10T16:10:00Z",
    updatedAt: "2026-09-11T08:30:00Z",
  },
  {
    ...issueBase,
    id: "ISS-TIRE-007",
    version: 1,
    status: "open",
    title: "TPMS fault on front right wheel of DEMO-EV-005",
    description: "Tire pressure warning for the front right wheel at rolling test; measured pressure in spec.",
    detectedAt: "2026-09-11T14:00:00Z",
    reportingTeamId: T.finalInspection,
    assignedTeamId: null,
    detectionStationId: S.finalInspection,
    processStepId: P.finalInspection,
    entityIds: ["WHL-0005-FR", EV_DEMO.vehicleBuildId],
    partNumber: "WHL-700",
    partRevision: null,
    linkedSupplierIds: ["SUP-WHEEL"],
    defectCode: "TPMS_FAULT",
    severity: "minor",
    evidenceIds: ["EVID-TIRE-OBS"],
    createdBy: "final-inspection-op-1",
    createdAt: "2026-09-11T14:05:00Z",
    updatedAt: "2026-09-11T14:05:00Z",
  },
];

export const causes: CauseAssessment[] = [
  { id: "CAUSE-PRIOR-1", issueId: EV_DEMO.priorIssueId, state: "rejected", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: EV_DEMO.suppliers.connector, causalStationId: null, causalProcessStepId: null, rationale: "Hypothesis: connector body out of spec. Rejected: connector measured within spec on the gauge; bracket flange was the deviation.", evidenceIds: ["EVID-PRIOR-GAUGE"], supersedesId: null, assessedBy: "quality-eng-1", assessedAt: "2026-08-22T10:00:00Z", isCurrent: false },
  { id: "CAUSE-PRIOR-2", issueId: EV_DEMO.priorIssueId, state: "confirmed", causeType: "in_house_manufacturing", responsibleTeamId: T.inHouseManufacturing, responsibleSupplierId: null, causalStationId: S.bracketCell, causalProcessStepId: P.bracketForming, rationale: "Bracket flange 12.5 mm at end of shift on lot DEMO-MFG-LOT-00 (spec 12.0 +/- 0.3) shifts the connector left.", evidenceIds: ["EVID-MFG-INSP-00", "EVID-PRIOR-GAUGE"], supersedesId: "CAUSE-PRIOR-1", assessedBy: "quality-eng-1", assessedAt: "2026-08-22T14:30:00Z", isCurrent: true },
  { id: "CAUSE-CONN-1", issueId: "ISS-SUP-CONN-001", state: "confirmed", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: EV_DEMO.suppliers.connector, causalStationId: null, causalProcessStepId: null, rationale: "Supplier confirmed a pin-insertion tooling fault on part of lot DEMO-SUP-LOT-01.", evidenceIds: ["EVID-CONN-PIN", "EVID-CONN-SUPPLIER-8D"], supersedesId: null, assessedBy: "supplier-quality-1", assessedAt: "2026-09-08T09:00:00Z", isCurrent: true },
  { id: "CAUSE-LAMP-1", issueId: "ISS-LAMP-002", state: "hypothesis", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: "SUP-LAMP", causalStationId: null, causalProcessStepId: null, rationale: "Suspected lamp vent membrane defect. Not confirmed: lamp not yet returned for analysis.", evidenceIds: ["EVID-LAMP-OBS"], supersedesId: null, assessedBy: "supplier-quality-1", assessedAt: "2026-09-10T09:00:00Z", isCurrent: false },
  { id: "CAUSE-IGN-1", issueId: "ISS-IGN-006", state: "hypothesis", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: "SUP-ELEC", causalStationId: null, causalProcessStepId: null, rationale: "Start switch contact suspected. Weakened by the scope capture: switch contact measured OK at X-STSW-01.", evidenceIds: ["EVID-IGN-SCOPE"], supersedesId: null, assessedBy: "electronics-eng-1", assessedAt: "2026-09-11T08:00:00Z", isCurrent: false },
  { id: "CAUSE-IGN-2", issueId: "ISS-IGN-006", state: "hypothesis", causeType: "assembly_process", responsibleTeamId: T.assembly, responsibleSupplierId: null, causalStationId: S.chargePortAssembly, causalProcessStepId: "final-assembly", rationale: "Start request wire W-011 not reaching BCM connector X-BCM-A pin 14: suspect connector not fully seated at IP install. To be confirmed by re-seating and re-test.", evidenceIds: ["EVID-IGN-SCOPE"], supersedesId: null, assessedBy: "electronics-eng-1", assessedAt: "2026-09-11T08:30:00Z", isCurrent: false },
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
    applicability: { partNumber: EV_DEMO.parts.bracket, partRevision: "A", processStepId: P.bracketForming, limitations: ["Verified on one synthetic vehicle (DEMO-EV-002)", "Applies to revision A brackets from the forming cell; other revisions need engineering review"] },
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
  { id: "CMT-IGN-1", issueId: "ISS-IGN-006", body: "Traced the start circuit C-START: F12 OK, switch OK, request not seen at the BCM. Next step: inspect X-BCM-A seating.", evidenceIds: ["EVID-IGN-SCOPE"], authorId: "electronics-eng-1", createdAt: "2026-09-11T08:35:00Z" },
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
  audit("AUD-D5-1", "ISS-DOOR-005", "created", "final-inspection-op-2", "2026-09-11T10:25:00Z", "Issue created by Final Inspection", null, "open"),
  audit("AUD-I-1", "ISS-IGN-006", "created", "eol-tester-1", "2026-09-10T16:10:00Z", "Issue created at Electrical EOL", null, "open"),
  audit("AUD-I-2", "ISS-IGN-006", "transition", "electronics-eng-1", "2026-09-11T07:50:00Z", "Triaged", "open", "triaged"),
  audit("AUD-I-3", "ISS-IGN-006", "cause_recorded", "electronics-eng-1", "2026-09-11T08:00:00Z", "Supplier hypothesis: start switch", null, null, "CAUSE-IGN-1"),
  audit("AUD-I-4", "ISS-IGN-006", "cause_recorded", "electronics-eng-1", "2026-09-11T08:30:00Z", "Assembly hypothesis: BCM connector seating", null, null, "CAUSE-IGN-2"),
  audit("AUD-T-1", "ISS-TIRE-007", "created", "final-inspection-op-1", "2026-09-11T14:05:00Z", "Issue created by Final Inspection", null, "open"),
];

/** Inspection cohorts for supplier rates. Only a complete cohort supports a rate; others are N/A. */
export const supplierCohorts: Record<string, { inspectedUnitCount: number; complete: boolean; note: string }> = {
  [EV_DEMO.suppliers.connector]: { inspectedUnitCount: 80, complete: true, note: "Incoming inspection cohort: lots DEMO-SUP-LOT-01 and -02, 80 units, observation cutoff 2026-09-12 (synthetic)." },
  "SUP-LAMP": { inspectedUnitCount: 0, complete: false, note: "No inspection cohort recorded for SUP-LAMP; rate N/A." },
};
