/**
 * SAMPLE DATA for UI development (mock mode only). Everything is synthetic and labeled as such
 * in the UI. Vehicles are instantiated from the platform part catalog
 * (frontend/data/ev-platform/parts.json) and the seed (frontend/data/ev-platform/seed.json),
 * which is also what export-neo4j.mjs turns into a Neo4j seed for Codey. Identifiers follow
 * EV_DEMO in src/contracts/issues.ts. Public-evidence records keep NHTSA provenance.
 */
import { EvidenceSchema, type EntityRecord, type Evidence, type Installation } from "@/contracts/common";
import { AuditEventSchema, CauseAssessmentSchema, EV_DEMO, FixRevisionSchema, IssueCommentSchema, IssueSchema, VerificationSchema, type AuditEvent, type CauseAssessment, type FixRevision, type Issue, type IssueComment, type ReferenceCatalog, type Verification } from "@/contracts/issues";
import { z } from "zod";
import seedJson from "../../../../data/ev-platform/seed.json";
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
    ...seedJson.extraDefectCodes.map((d) => ({ id: d.id, name: d.name, active: true, family: d.family })),
  ],
  sites: [{ id: EV_DEMO.siteId, name: "Demo Plant 1", active: true }],
};

// ---------------------------------------------------------------------------
// Seed records (validated against the frozen schemas at load time)
// ---------------------------------------------------------------------------

const SeedEvidenceSchema = z.object({ id: z.string(), sourceName: z.string(), locator: z.string(), sourceKind: EvidenceSchema.shape.sourceKind, text: z.string(), sourceRecordId: z.string().nullable().optional(), sourceUrl: z.string().nullable().optional(), retrievedAt: z.string().nullable().optional() });

export const evidence: Evidence[] = z.array(SeedEvidenceSchema).parse(seedJson.evidence).map((e) => ({
  id: e.id,
  sourceName: e.sourceName,
  sourceHash: pseudoHash(e.text),
  locator: e.locator,
  text: e.text,
  sourceKind: e.sourceKind,
  sourceRecordId: e.sourceRecordId ?? null,
  sourceUrl: e.sourceUrl ?? null,
  retrievedAt: e.retrievedAt ?? null,
}));

export const customers: Array<{ id: string; name: string; kind: string }> = seedJson.customers;
export const shipments: Array<{ id: string; vehicleId: string; customerId: string; shippedAt: string }> = seedJson.shipments;
export const issues: Issue[] = z.array(IssueSchema).parse(seedJson.issues);
export const causes: CauseAssessment[] = z.array(CauseAssessmentSchema).parse(seedJson.causes);
export const fixes: FixRevision[] = z.array(FixRevisionSchema).parse(seedJson.fixes);
export const verifications: Verification[] = z.array(VerificationSchema).parse(seedJson.verifications);
export const comments: IssueComment[] = z.array(IssueCommentSchema).parse(seedJson.comments);
export const auditEvents: AuditEvent[] = z.array(AuditEventSchema).parse(seedJson.audit);
export const supplierCohorts: Record<string, { inspectedUnitCount: number; complete: boolean; note: string }> = seedJson.supplierCohorts;

// ---------------------------------------------------------------------------
// Vehicles: instantiate every slot from the platform catalog with per-vehicle overrides
// ---------------------------------------------------------------------------

export type MockVehicleSpec = {
  suffix: string;
  buildId: string;
  style: string;
  vin: string | null;
  locationState: EntityRecord["locationState"];
  builtDay: string;
  overrides: Record<string, Partial<PartSlot>>;
  unknownOrigin: string[];
};

export const vehicleSpecs: MockVehicleSpec[] = seedJson.vehicles.map((v) => ({ ...v, locationState: v.locationState as EntityRecord["locationState"], overrides: v.overrides as Record<string, Partial<PartSlot>> }));

const RECEIPT_EVIDENCE: Record<string, string> = seedJson.originEvidence.supplierBatch;
const LOT_EVIDENCE: Record<string, string> = seedJson.originEvidence.manufacturingLot;

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
    const ordered = [...PARTS.filter((p) => !p.parent), ...PARTS.filter((p) => p.parent)];
    for (const base of ordered) {
      const slot: PartSlot = { ...base, ...(v.overrides[base.slot] ?? {}) } as PartSlot;
      const id = entityIdFor(slot, v.suffix);
      const unknown = v.unknownOrigin.includes(slot.slot);
      const replacement = seedJson.replacements.find((r) => r.vehicleSuffix === v.suffix && r.slot === slot.slot);
      entities.push({
        id,
        kind: slot.kind === "subassembly" ? "subassembly" : "component",
        partNumber: slot.partNumber,
        partRevision: slot.partRevision ?? null,
        serialNumber: id,
        displayCode: id,
        issuerId: slot.sourcing === "supplier" ? (slot.supplierId ?? null) : unknown ? null : "ORG-DEMO-PLANT",
        locationState: replacement ? "quarantine" : "installed",
        origin: originFor(slot, id, unknown),
        vehicle: null,
      });
      const parentId = slot.parent ? entityIdFor(PARTS.find((p) => p.slot === slot.parent)!, v.suffix) : vehicleId;
      const hour = slot.parent ? "06:30" : slot.kind === "subassembly" ? "07:30" : "09:00";
      if (replacement) {
        inst(id, parentId, slot.slot, t("08:20"), replacement.removedAt, replacement.removedEvidence);
        const slot2 = { ...slot, ...replacement.replacementOverrides } as PartSlot;
        const id2 = replacement.replacementEntityId;
        entities.push({ id: id2, kind: "component", partNumber: slot.partNumber, partRevision: slot.partRevision ?? null, serialNumber: id2, displayCode: id2, issuerId: slot.supplierId ?? null, locationState: "installed", origin: originFor(slot2, id2, false), vehicle: null });
        inst(id2, parentId, slot.slot, replacement.replacementInstalledAt, null, replacement.replacementEvidence);
      } else {
        inst(id, parentId, slot.slot, t(hour));
      }
    }
  }
  return { entities, installations };
}
