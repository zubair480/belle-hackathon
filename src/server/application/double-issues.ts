/**
 * Typed in-memory ISSUE SERVICES DOUBLE for route development and API tests.
 *
 * NOT Codey's Neo4j implementation and never a fallback for a failing real service. It seeds the
 * synthetic EV charge-port story (docs/EV_ASSEMBLY_SCOPE.md) and optionally the quality
 * regression fixture (robot-era ids) for insight arithmetic. Selected only by RECALL_SERVICES=double.
 */
import { createHash } from "node:crypto";
import {
  DomainError,
  type EntityContext,
  type EntityRecord,
  type Evidence,
  type Installation,
  type RequestContext,
} from "@/contracts/common";
import {
  CONTRACT_VERSION,
  EV_DEMO,
  TRANSITIONS,
  type AuditEvent,
  type CatalogItem,
  type CatalogKind,
  type CatalogUpsert,
  type CauseAssessment,
  type CauseAssessmentInput,
  type CreateIssueCommand,
  type DefectCode,
  type FixRevision,
  type FixRevisionInput,
  type Insights,
  type InsightsFilter,
  type Issue,
  type IssueComment,
  type IssueCommentInput,
  type IssueDetail,
  type IssueListFilter,
  type IssuePage,
  type IssueServices,
  type IssueStatus,
  type IssueUpdate,
  type ProcessStep,
  type ReferenceCatalog,
  type SimilarResolution,
  type SimilarResolutions,
  type Station,
  type SupplierInsight,
  type TeamInsight,
  type TransitionCommand,
  type Verification,
  type VerificationInput,
} from "@/contracts/issues";
import quality from "../../../docs/reference/quality/quality_issue_reference.json";

type Env = Record<string, string | undefined>;
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "ITEM";

export type IssueDoubleOptions = {
  /** Also load docs/reference/quality (robot-era ids) so supplier/team insight arithmetic can be checked. */
  includeQualityRegression?: boolean;
  workspaceId?: string;
  now?: () => string;
  failures?: Array<{ method: keyof IssueServices; error: Error; delayMs?: number }>;
};

type Idem = { hash: string; resultId: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createIssueDouble(options: IssueDoubleOptions = {}): IssueServices & { _reset(): void } {
  const workspaceId = options.workspaceId ?? EV_DEMO.workspaceId;
  const now = options.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));

  // ----- state -----
  const catalog: ReferenceCatalog = { contractVersion: CONTRACT_VERSION, teams: [], suppliers: [], stations: [], processSteps: [], defectCodes: [], sites: [] };
  const entities = new Map<string, EntityRecord>();
  const installations: Installation[] = [];
  const customers = new Map<string, string>(); // entityId -> customerId
  const evidence = new Map<string, Evidence>();
  const issues = new Map<string, Issue>();
  const comments: IssueComment[] = [];
  const causes: CauseAssessment[] = [];
  const fixes: FixRevision[] = [];
  const verifications: Verification[] = [];
  const audit: AuditEvent[] = [];
  const idem = new Map<string, Idem>();
  const cohorts = new Map<string, { inspectedUnits: Set<string>; complete: boolean }>(); // supplierId -> cohort
  const counters = new Map<string, number>();
  const nextId = (prefix: string) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${String(n).padStart(4, "0")}`;
  };

  // ----- helpers -----
  const addEvidence = (id: string, sourceName: string, locator: string, text: string, kind: Evidence["sourceKind"] = "synthetic"): Evidence => {
    const e: Evidence = { id, sourceName, sourceHash: sha256(text), locator, text, sourceKind: kind, sourceRecordId: null, sourceUrl: null, retrievedAt: null };
    evidence.set(id, e);
    return e;
  };
  const log = (issueId: string, kind: AuditEvent["kind"], actorId: string, summary: string, subjectId: string | null = null, fromStatus: IssueStatus | null = null, toStatus: IssueStatus | null = null) => {
    audit.push({ id: nextId("AUD"), issueId, kind, actorId, at: now(), fromStatus, toStatus, summary, subjectId });
  };
  const has = (list: Array<{ id: string }>, id: string | null | undefined) => id == null || list.some((x) => x.id === id);
  function assertRefs(input: Partial<Pick<Issue, "reportingTeamId" | "assignedTeamId" | "detectionStationId" | "processStepId" | "entityIds" | "linkedSupplierIds" | "defectCode" | "evidenceIds">>): void {
    const bad: string[] = [];
    if (input.reportingTeamId !== undefined && !has(catalog.teams, input.reportingTeamId)) bad.push(`team:${input.reportingTeamId}`);
    if (!has(catalog.teams, input.assignedTeamId)) bad.push(`team:${input.assignedTeamId}`);
    if (!has(catalog.stations, input.detectionStationId)) bad.push(`station:${input.detectionStationId}`);
    if (!has(catalog.processSteps, input.processStepId)) bad.push(`processStep:${input.processStepId}`);
    if (!has(catalog.defectCodes, input.defectCode)) bad.push(`defectCode:${input.defectCode}`);
    for (const id of input.entityIds ?? []) if (!entities.has(id)) bad.push(`entity:${id}`);
    for (const id of input.linkedSupplierIds ?? []) if (!has(catalog.suppliers, id)) bad.push(`supplier:${id}`);
    for (const id of input.evidenceIds ?? []) if (!evidence.has(id)) bad.push(`evidence:${id}`);
    if (bad.length) throw new DomainError("INVALID_REFERENCE", "One or more linked ids do not exist in this workspace.", { invalid: bad });
  }
  function assertWorkspace(ctx: RequestContext): void {
    if (ctx.workspaceId !== workspaceId) throw new DomainError("FORBIDDEN", "Workspace is not the configured synthetic demo workspace.");
  }
  async function gate(method: keyof IssueServices): Promise<void> {
    const f = options.failures?.find((x) => x.method === method);
    if (f) {
      if (f.delayMs) await sleep(f.delayMs);
      throw f.error;
    }
  }
  function idempotent<T extends { id: string }>(key: string, payload: unknown, lookup: (id: string) => T | undefined, create: () => T): { record: T; replayed: boolean } {
    const hash = sha256(JSON.stringify(payload));
    const seen = idem.get(key);
    if (seen) {
      if (seen.hash !== hash) throw new DomainError("DUPLICATE_ACTION", "Idempotency key was already used with a different payload.", { idempotencyKey: key });
      const existing = lookup(seen.resultId);
      if (existing) return { record: existing, replayed: true };
    }
    const record = create();
    idem.set(key, { hash, resultId: record.id });
    return { record, replayed: false };
  }
  const getIssueOrThrow = (id: string): Issue => {
    const i = issues.get(id);
    if (!i) throw new DomainError("NOT_FOUND", `Issue ${id} does not exist.`);
    return i;
  };
  const bump = (issue: Issue) => {
    issue.version += 1;
    issue.updatedAt = now();
  };
  const currentConfirmedCause = (issueId: string) => causes.find((c) => c.issueId === issueId && c.isCurrent && c.state === "confirmed") ?? null;
  const activeAt = (i: Installation, at: string) => Date.parse(i.installedAt) <= Date.parse(at) && (i.removedAt === null || Date.parse(i.removedAt) > Date.parse(at));

  function entityContext(entityId: string, configurationAsOf: string | null): EntityContext {
    const entity = entities.get(entityId);
    if (!entity) throw new DomainError("NOT_FOUND", `Entity ${entityId} does not exist.`);
    const at = configurationAsOf ?? now();
    const parents: EntityRecord[] = [];
    let cursor = entityId;
    const seen = new Set<string>();
    while (!seen.has(cursor)) {
      seen.add(cursor);
      const inst = installations.find((i) => i.childId === cursor && activeAt(i, at));
      if (!inst) break;
      const p = entities.get(inst.parentId);
      if (!p) break;
      parents.push(p);
      cursor = inst.parentId;
    }
    const children = installations.filter((i) => i.parentId === entityId && activeAt(i, at)).map((i) => entities.get(i.childId)).filter((x): x is EntityRecord => Boolean(x));
    const touching = installations.filter((i) => i.childId === entityId || i.parentId === entityId);
    const historicalVehicles = new Set<string>();
    const walkHistory = (id: string, depth: number) => {
      if (depth > 6) return;
      for (const i of installations.filter((x) => x.childId === id)) {
        const p = entities.get(i.parentId);
        if (!p) continue;
        if (p.kind === "vehicle") historicalVehicles.add(p.id);
        walkHistory(p.id, depth + 1);
      }
    };
    walkHistory(entityId, 0);
    if (entity.kind === "vehicle") historicalVehicles.add(entity.id);
    const currentVehicles = entity.kind === "vehicle" ? [entity.id] : parents.filter((p) => p.kind === "vehicle").map((p) => p.id);
    const ev = [...new Set([...(entity.origin?.evidenceIds ?? []), ...touching.flatMap((i) => i.evidenceIds)])].map((id) => evidence.get(id)).filter((x): x is Evidence => Boolean(x));
    return {
      entity,
      currentParents: parents,
      currentChildren: children,
      installations: touching,
      currentVehicleIds: currentVehicles,
      historicalVehicleIds: [...historicalVehicles].sort(),
      evidence: ev,
      limitations: ["Synthetic fixture; one charge-port path only, not a full vehicle BOM", "A producer or supplier link is not a confirmed cause"],
    };
  }

  // ----- seed: EV story (fictional) -----
  function seedEv(): void {
    catalog.sites.push({ id: EV_DEMO.siteId, name: "Demo EV Plant 1", active: true });
    catalog.teams.push(
      { id: EV_DEMO.teams.finalInspection, name: "Final Inspection", active: true },
      { id: EV_DEMO.teams.inHouseManufacturing, name: "In-house Manufacturing", active: true },
      { id: EV_DEMO.teams.assembly, name: "Charge-port Assembly", active: true },
      { id: EV_DEMO.teams.supplierQuality, name: "Supplier Quality", active: true },
      { id: EV_DEMO.teams.incomingQuality, name: "Incoming Quality", active: true },
    );
    catalog.suppliers.push({ id: EV_DEMO.suppliers.connector, name: "Demo Connector Supplier (fictional)", active: true });
    catalog.stations.push(
      { id: EV_DEMO.stations.finalInspection, name: "Final inspection", active: true, siteId: EV_DEMO.siteId, areaLabel: "Final line" },
      { id: EV_DEMO.stations.chargePortAssembly, name: "Charge-port module assembly", active: true, siteId: EV_DEMO.siteId, areaLabel: "Subassembly" },
      { id: EV_DEMO.stations.bracketCell, name: "Bracket forming cell", active: true, siteId: EV_DEMO.siteId, areaLabel: "In-house manufacturing" },
    );
    catalog.processSteps.push(
      { id: EV_DEMO.processSteps.chargePortInstall, name: "Charge-port module install", active: true, areaLabel: "Final assembly" },
      { id: EV_DEMO.processSteps.bracketForming, name: "Bracket forming", active: true, areaLabel: "In-house manufacturing" },
      { id: EV_DEMO.processSteps.finalInspection, name: "Final inspection", active: true, areaLabel: "Final line" },
    );
    catalog.defectCodes.push(
      { id: EV_DEMO.defectCodes.misalignment, name: "Connector misaligned", active: true, family: "Fit and alignment" },
      { id: EV_DEMO.defectCodes.bracketDimension, name: "Bracket out of tolerance", active: true, family: "Dimensional" },
      { id: "CONNECTOR_DEFECT", name: "Connector defect (supplied part)", active: true, family: "Supplied component" },
    );

    const supplierOrigin = (id: string, evid: string) => ({
      id: `ORIGIN-${id}`, sourcingType: "supplier" as const, producerOrganizationId: EV_DEMO.suppliers.connector, partNumber: EV_DEMO.parts.connector, partRevision: "A",
      productionLotId: "LOT-SUP-01", supplierId: EV_DEMO.suppliers.connector, supplierBatchCode: EV_DEMO.supplierLotCode, siteId: null, manufacturingLotCode: null,
      workOrderId: null, manufacturingTeamId: null, processStepId: null, evidenceIds: [evid],
    });
    const inHouseOrigin = (id: string, evid: string) => ({
      id: `ORIGIN-${id}`, sourcingType: "in_house" as const, producerOrganizationId: null, partNumber: EV_DEMO.parts.bracket, partRevision: "A",
      productionLotId: "LOT-MFG-01", supplierId: null, supplierBatchCode: null, siteId: EV_DEMO.siteId, manufacturingLotCode: EV_DEMO.manufacturingLotCode,
      workOrderId: EV_DEMO.workOrderId, manufacturingTeamId: EV_DEMO.teams.inHouseManufacturing, processStepId: EV_DEMO.processSteps.bracketForming, evidenceIds: [evid],
    });
    const moduleOrigin = (id: string) => ({
      id: `ORIGIN-${id}`, sourcingType: "in_house" as const, producerOrganizationId: null, partNumber: EV_DEMO.parts.module, partRevision: "A",
      productionLotId: "LOT-MFG-02", supplierId: null, supplierBatchCode: null, siteId: EV_DEMO.siteId, manufacturingLotCode: "DEMO-MFG-LOT-02",
      workOrderId: "WO-DEMO-0002", manufacturingTeamId: EV_DEMO.teams.assembly, processStepId: EV_DEMO.processSteps.chargePortInstall, evidenceIds: [],
    });
    const put = (e: EntityRecord) => entities.set(e.id, e);
    for (const n of ["0002", "0003", "0004", "0005", "0006"]) {
      const recv = addEvidence(`EVID-RECEIPT-CONN-${n}`, "Synthetic receiving record", `receipt:CONN-${n}`, `Connector CONN-${n} received in supplier batch ${EV_DEMO.supplierLotCode}; incoming inspection recorded.`);
      const mfg = addEvidence(`EVID-MFG-BRKT-${n}`, "Synthetic work order record", `workorder:${EV_DEMO.workOrderId}:BRKT-${n}`, `Bracket BRKT-${n} produced in ${EV_DEMO.manufacturingLotCode} under ${EV_DEMO.workOrderId} at bracket forming.`);
      put({ id: `CONN-${n}`, kind: "component", partNumber: EV_DEMO.parts.connector, partRevision: "A", serialNumber: `CONN-${n}`, displayCode: `CP-CONN-100 / CONN-${n}`, issuerId: EV_DEMO.suppliers.connector, locationState: n === "0006" ? "onsite" : "installed", origin: supplierOrigin(`CONN-${n}`, recv.id), vehicle: null });
      put({ id: `BRKT-${n}`, kind: "component", partNumber: EV_DEMO.parts.bracket, partRevision: "A", serialNumber: `BRKT-${n}`, displayCode: `CP-BRKT-200 / BRKT-${n}`, issuerId: null, locationState: n === "0006" ? "quarantine" : "installed", origin: inHouseOrigin(`BRKT-${n}`, mfg.id), vehicle: null });
      if (n === "0006") continue;
      put({ id: `CPM-${n}`, kind: "subassembly", partNumber: EV_DEMO.parts.module, partRevision: "A", serialNumber: `CPM-${n}`, displayCode: `CP-MOD-300 / CPM-${n}`, issuerId: null, locationState: "installed", origin: moduleOrigin(`CPM-${n}`), vehicle: null });
      const shipped = n === "0002" || n === "0003";
      put({ id: `DEMO-EV-${n.slice(1)}`, kind: "vehicle", partNumber: EV_DEMO.parts.vehicle, partRevision: null, serialNumber: `DEMO-EV-${n.slice(1)}`, displayCode: `Build DEMO-EV-${n}`, issuerId: null, locationState: shipped ? "shipped" : "onsite", origin: null, vehicle: { entityId: `DEMO-EV-${n.slice(1)}`, buildId: `DEMO-EV-${n.slice(1)}`, vin: null } });
      if (shipped) customers.set(`DEMO-EV-${n.slice(1)}`, "CUST-DEALER-1");
      const build = addEvidence(`EVID-BUILD-${n}`, "Synthetic build record", `build:DEMO-EV-${n}`, `Module CPM-${n} (connector CONN-${n}, bracket BRKT-${n}) installed into build DEMO-EV-${n}.`);
      installations.push(
        { id: `INST-CONN-${n}`, childId: `CONN-${n}`, parentId: `CPM-${n}`, slotId: "connector", installedAt: "2026-09-03T09:00:00Z", removedAt: null, recordedAt: "2026-09-03T09:05:00Z", evidenceIds: [build.id] },
        { id: `INST-BRKT-${n}`, childId: `BRKT-${n}`, parentId: `CPM-${n}`, slotId: "bracket", installedAt: "2026-09-03T09:00:00Z", removedAt: null, recordedAt: "2026-09-03T09:05:00Z", evidenceIds: [build.id] },
        { id: `INST-CPM-${n}`, childId: `CPM-${n}`, parentId: `DEMO-EV-${n.slice(1)}`, slotId: "chargeport", installedAt: "2026-09-05T09:00:00Z", removedAt: null, recordedAt: "2026-09-05T09:05:00Z", evidenceIds: [build.id] },
      );
    }
    // Prior closed bracket issue with a verified fix (reusable knowledge).
    const obs = addEvidence("EVID-BRKT-PRIOR-OBS", "Synthetic inspection note", "note:1", "Bracket BRKT-0002 measured out of tolerance at final inspection; connector could not seat.");
    const cause = addEvidence("EVID-BRKT-PRIOR-CAUSE", "Synthetic cell inspection", "note:2", "Forming die offset found in bracket cell; lot DEMO-MFG-LOT-01 affected.");
    const fixEv = addEvidence("EVID-BRKT-PRIOR-FIX", "Synthetic work instruction reference", "WI-BRKT-12 rev 2", "Placeholder work instruction WI-BRKT-12 rev 2: re-set die, rework bracket, re-inspect.");
    const verEv = addEvidence("EVID-BRKT-PRIOR-VERIFY", "Synthetic verification record", "gauge:1", "Fixture result PASS on re-inspection. No real hardware was inspected.");
    const prior: Issue = {
      id: EV_DEMO.priorIssueId, version: 6, status: "closed", title: "Bracket out of tolerance on DEMO-EV-002", description: "Charge-port bracket did not meet dimension; connector would not seat.",
      origin: "manual", detectedAt: "2026-09-06T14:00:00Z", reportingTeamId: EV_DEMO.teams.finalInspection, assignedTeamId: EV_DEMO.teams.inHouseManufacturing,
      detectionStationId: EV_DEMO.stations.finalInspection, processStepId: EV_DEMO.processSteps.bracketForming, entityIds: ["BRKT-0002", "CPM-0002", "DEMO-EV-002"],
      partNumber: EV_DEMO.parts.bracket, partRevision: "A", linkedSupplierIds: [], defectCode: EV_DEMO.defectCodes.bracketDimension, severity: "major", evidenceIds: [obs.id],
      createdBy: "demo-operator", createdAt: "2026-09-06T14:05:00Z", updatedAt: "2026-09-08T16:00:00Z", confirmedCauseId: "CAUSE-BRKT-PRIOR", currentFixRevisionId: EV_DEMO.priorVerifiedFixId,
    };
    issues.set(prior.id, prior);
    causes.push({ id: "CAUSE-BRKT-PRIOR", issueId: prior.id, state: "confirmed", causeType: "in_house_manufacturing", responsibleTeamId: EV_DEMO.teams.inHouseManufacturing, responsibleSupplierId: null, causalStationId: EV_DEMO.stations.bracketCell, causalProcessStepId: EV_DEMO.processSteps.bracketForming, rationale: "Forming die offset confirmed by cell inspection.", evidenceIds: [cause.id], supersedesId: null, assessedBy: "demo-quality-reviewer", assessedAt: "2026-09-07T10:00:00Z", isCurrent: true });
    fixes.push({ id: EV_DEMO.priorVerifiedFixId, issueId: prior.id, version: 1, summary: "Re-set forming die per WI-BRKT-12 rev 2 and rework bracket", steps: [{ order: 1, instruction: "Confirm WI-BRKT-12 rev 2 applies to bracket revision A." }, { order: 2, instruction: "Re-set die, rework affected brackets, document execution." }, { order: 3, instruction: "Re-inspect to gauge and record evidence." }], applicability: { partNumber: EV_DEMO.parts.bracket, partRevision: "A", processStepId: EV_DEMO.processSteps.bracketForming, limitations: ["Synthetic placeholder; not a real procedure"] }, sourceFixRevisionId: null, workInstructionRef: "WI-BRKT-12 rev 2", evidenceIds: [fixEv.id], state: "verified", createdBy: "demo-engineer", createdAt: "2026-09-07T12:00:00Z", appliedAt: "2026-09-08T09:00:00Z" });
    verifications.push({ id: "VERIFY-BRKT-PRIOR", issueId: prior.id, fixRevisionId: EV_DEMO.priorVerifiedFixId, outcome: "pass", method: "Gauge re-inspection (synthetic)", resultNotes: "PASS", evidenceIds: [verEv.id], verifiedBy: "demo-quality-reviewer", verifiedAt: "2026-09-08T15:00:00Z" });
    audit.push({ id: "AUD-PRIOR-1", issueId: prior.id, kind: "created", actorId: "demo-operator", at: prior.createdAt, fromStatus: null, toStatus: "open", summary: "Issue created", subjectId: null });
    audit.push({ id: "AUD-PRIOR-2", issueId: prior.id, kind: "transition", actorId: "demo-quality-reviewer", at: prior.updatedAt, fromStatus: "pending_verification", toStatus: "closed", summary: "Closed after passed verification VERIFY-BRKT-PRIOR", subjectId: "VERIFY-BRKT-PRIOR" });

    // Separate seeded supplier-caused case (confirmed supplier component cause; cohort unknown -> rate N/A).
    const supEv = addEvidence("EVID-CONN-SUPPLIER", "Synthetic incoming inspection", "note:3", "Connector CONN-0003 latch cracked on receipt; supplier notified.");
    const sup: Issue = {
      id: "ISS-CONN-SUPPLIER", version: 3, status: "in_progress", title: "Cracked connector latch on CONN-0003", description: "Latch cracked at incoming inspection.", origin: "manual",
      detectedAt: "2026-09-04T09:00:00Z", reportingTeamId: EV_DEMO.teams.incomingQuality, assignedTeamId: EV_DEMO.teams.supplierQuality, detectionStationId: null, processStepId: null,
      entityIds: ["CONN-0003"], partNumber: EV_DEMO.parts.connector, partRevision: "A", linkedSupplierIds: [EV_DEMO.suppliers.connector], defectCode: "CONNECTOR_DEFECT", severity: "major",
      evidenceIds: [supEv.id], createdBy: "demo-inspector", createdAt: "2026-09-04T09:10:00Z", updatedAt: "2026-09-05T10:00:00Z", confirmedCauseId: "CAUSE-CONN-SUPPLIER", currentFixRevisionId: null,
    };
    issues.set(sup.id, sup);
    causes.push({ id: "CAUSE-CONN-SUPPLIER", issueId: sup.id, state: "confirmed", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: EV_DEMO.suppliers.connector, causalStationId: null, causalProcessStepId: null, rationale: "Supplier confirmed moulding defect in batch.", evidenceIds: [supEv.id], supersedesId: null, assessedBy: "demo-supplier-quality", assessedAt: "2026-09-05T10:00:00Z", isCurrent: true });
  }

  // ----- seed: quality regression fixture (robot-era ids; arithmetic oracle only) -----
  function seedQualityRegression(): void {
    const q = quality;
    for (const t of q.teams) if (!catalog.teams.some((x) => x.id === t.id)) catalog.teams.push({ id: t.id, name: `${t.name} (regression fixture)`, active: true });
    for (const s of q.suppliers) if (!catalog.suppliers.some((x) => x.id === s.id)) catalog.suppliers.push({ id: s.id, name: `${s.name} (regression fixture)`, active: true });
    for (const s of q.stations) if (!catalog.stations.some((x) => x.id === s.id)) catalog.stations.push({ id: s.id, name: `${s.name} (regression fixture)`, active: true, siteId: null, areaLabel: null });
    for (const p of ["incoming-inspection", "joint-fastening"]) if (!catalog.processSteps.some((x) => x.id === p)) catalog.processSteps.push({ id: p, name: `${p} (regression fixture)`, active: true, areaLabel: null });
    for (const d of ["ENCODER_DROPOUT", "TORQUE_LOW"]) if (!catalog.defectCodes.some((x) => x.id === d)) catalog.defectCodes.push({ id: d, name: `${d} (regression fixture)`, active: true, family: null });
    for (const e of q.evidence) if (!evidence.has(e.id)) addEvidence(e.id, e.sourceName, e.locator, e.text);
    for (const e of q.additionalEntities) {
      if (!entities.has(e.id)) entities.set(e.id, { id: e.id, kind: "component", partNumber: e.partNumber, partRevision: e.partRevision, serialNumber: e.serialNumber, displayCode: `${e.partNumber} / ${e.serialNumber}`, issuerId: e.issuerId, locationState: e.locationState as EntityRecord["locationState"], origin: null, vehicle: null });
    }
    for (const id of ["E001", "E002", "E003", "E900", "J004", "R003", "J005", "R005"]) {
      if (!entities.has(id)) entities.set(id, { id, kind: id.startsWith("R") ? "vehicle" : id.startsWith("J") ? "subassembly" : "component", partNumber: id.startsWith("R") ? "ARM-100" : id.startsWith("J") ? "JOINT-10" : "ENC-42", partRevision: id.startsWith("E") ? "A" : "B", serialNumber: id, displayCode: id, issuerId: id.startsWith("E") ? "SUP-A" : "OEM-DEMO", locationState: "installed", origin: null, vehicle: id.startsWith("R") ? { entityId: id, buildId: id, vin: null } : null });
    }
    for (const i of q.issues) {
      issues.set(i.id, { ...i, status: i.status as IssueStatus, origin: i.origin as Issue["origin"], severity: i.severity as Issue["severity"], confirmedCauseId: null, currentFixRevisionId: null });
    }
    for (const c of q.causeAssessments) {
      causes.push({ ...c, state: c.state as CauseAssessment["state"], causeType: c.causeType as CauseAssessment["causeType"], causalProcessStepId: null, isCurrent: true });
      const issue = issues.get(c.issueId);
      if (issue && c.state === "confirmed") issue.confirmedCauseId = c.id;
    }
    for (const f of q.fixRevisions) {
      fixes.push({ ...f, state: f.state as FixRevision["state"], workInstructionRef: null, createdBy: "demo-engineer", createdAt: "2026-09-09T12:00:00Z", appliedAt: "2026-09-10T09:00:00Z" });
      const issue = issues.get(f.issueId);
      if (issue) issue.currentFixRevisionId = f.id;
    }
    for (const v of q.verifications) verifications.push({ ...v, outcome: v.outcome as Verification["outcome"] });
    const bySupplier = new Map<string, Set<string>>();
    for (const r of q.inspectionCohort.records) {
      const set = bySupplier.get(r.supplierId) ?? new Set<string>();
      set.add(r.entityId);
      bySupplier.set(r.supplierId, set);
    }
    for (const [supplierId, set] of bySupplier) cohorts.set(supplierId, { inspectedUnits: set, complete: q.inspectionCohort.complete });
  }

  seedEv();
  if (options.includeQualityRegression) seedQualityRegression();

  // ----- detail / list -----
  const detail = (issue: Issue): IssueDetail => {
    const ents = issue.entityIds.map((id) => entities.get(id)).filter((x): x is EntityRecord => Boolean(x));
    const ctxs = ents.map((e) => entityContext(e.id, null));
    const evIds = new Set<string>(issue.evidenceIds);
    const issueCauses = causes.filter((c) => c.issueId === issue.id);
    const issueFixes = fixes.filter((f) => f.issueId === issue.id);
    const issueVerifs = verifications.filter((v) => v.issueId === issue.id);
    const issueComments = comments.filter((c) => c.issueId === issue.id);
    for (const c of issueCauses) c.evidenceIds.forEach((e) => evIds.add(e));
    for (const f of issueFixes) f.evidenceIds.forEach((e) => evIds.add(e));
    for (const v of issueVerifs) v.evidenceIds.forEach((e) => evIds.add(e));
    for (const c of issueComments) c.evidenceIds.forEach((e) => evIds.add(e));
    for (const e of ents) e.origin?.evidenceIds.forEach((x) => evIds.add(x));
    return {
      contractVersion: CONTRACT_VERSION,
      issue: structuredClone(issue),
      entities: structuredClone(ents),
      entityContexts: structuredClone(ctxs),
      causes: structuredClone(issueCauses),
      fixes: structuredClone(issueFixes),
      verifications: structuredClone(issueVerifs),
      comments: structuredClone(issueComments),
      audit: structuredClone(audit.filter((a) => a.issueId === issue.id)),
      evidence: [...evIds].map((id) => evidence.get(id)).filter((x): x is Evidence => Boolean(x)),
    };
  };

  function matches(issue: Issue, f: IssueListFilter | InsightsFilter): boolean {
    if (f.status && !f.status.includes(issue.status)) return false;
    if (f.severity && !f.severity.includes(issue.severity)) return false;
    if (f.supplierId && !issue.linkedSupplierIds.includes(f.supplierId) && currentConfirmedCause(issue.id)?.responsibleSupplierId !== f.supplierId) return false;
    if (f.defectCode && issue.defectCode !== f.defectCode) return false;
    if (f.partNumber && issue.partNumber !== f.partNumber) return false;
    if (f.stationId && issue.detectionStationId !== f.stationId && currentConfirmedCause(issue.id)?.causalStationId !== f.stationId) return false;
    if (f.processStepId && issue.processStepId !== f.processStepId && currentConfirmedCause(issue.id)?.causalProcessStepId !== f.processStepId) return false;
    if (f.detectedFrom && Date.parse(issue.detectedAt) < Date.parse(f.detectedFrom)) return false;
    if (f.detectedToExclusive && Date.parse(issue.detectedAt) >= Date.parse(f.detectedToExclusive)) return false;
    if ("teamId" in f && f.teamId) {
      const role = f.teamRole ?? "reporting";
      if (role === "reporting" && issue.reportingTeamId !== f.teamId) return false;
      if (role === "assigned" && issue.assignedTeamId !== f.teamId) return false;
      if (role === "confirmed_cause" && currentConfirmedCause(issue.id)?.responsibleTeamId !== f.teamId) return false;
    }
    if ("entityId" in f && f.entityId && !issue.entityIds.includes(f.entityId)) return false;
    if ("text" in f && f.text && !`${issue.title} ${issue.description}`.toLowerCase().includes(f.text.toLowerCase())) return false;
    return true;
  }

  // ----- similar resolutions (deterministic, explainable) -----
  function similar(issue: Issue): SimilarResolutions {
    const markedParts = new Set(issue.entityIds.map((id) => entities.get(id)?.partNumber).filter((x): x is string => Boolean(x)));
    const markedRevs = new Map<string, string | null>();
    for (const id of issue.entityIds) {
      const e = entities.get(id);
      if (e) markedRevs.set(e.partNumber, e.partRevision);
    }
    const cause = currentConfirmedCause(issue.id);
    const results: SimilarResolution[] = [];
    for (const fix of fixes) {
      if (fix.issueId === issue.id) continue;
      const src = issues.get(fix.issueId);
      if (!src) continue;
      const passed = verifications.filter((v) => v.fixRevisionId === fix.id && v.outcome === "pass").sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt))[0];
      if (!passed || fix.state !== "verified") continue;
      const reasons: string[] = [];
      const warnings: string[] = [];
      let score = 0;
      if (issue.defectCode && src.defectCode === issue.defectCode) {
        reasons.push(`same defect code ${issue.defectCode}`);
        score += 3;
      }
      const fixPart = fix.applicability.partNumber ?? src.partNumber;
      if (fixPart && (issue.partNumber === fixPart || markedParts.has(fixPart))) {
        reasons.push(`same part family ${fixPart}`);
        score += 2;
        const issueRev = issue.partNumber === fixPart ? issue.partRevision : (markedRevs.get(fixPart) ?? null);
        if (fix.applicability.partRevision && issueRev && fix.applicability.partRevision !== issueRev) warnings.push(`part revision differs (${issueRev} vs ${fix.applicability.partRevision}): engineering review required`);
        if (!issueRev) warnings.push("part revision unknown on this issue: applicability unconfirmed");
      }
      const srcCause = currentConfirmedCause(src.id);
      if (cause && srcCause && cause.causeType === srcCause.causeType) {
        reasons.push(`same confirmed cause type ${cause.causeType}`);
        score += 1;
      }
      const stepId = fix.applicability.processStepId ?? src.processStepId;
      if (stepId && (issue.processStepId === stepId || cause?.causalProcessStepId === stepId)) {
        reasons.push(`same process step ${stepId}`);
        score += 1;
      }
      if (src.linkedSupplierIds.some((s) => issue.linkedSupplierIds.includes(s)) && score === 0) {
        warnings.push("shared supplier only: not evidence of the same cause");
      }
      if (score < 2) continue;
      if (fix.applicability.limitations.length) warnings.push(...fix.applicability.limitations.map((l) => `limitation: ${l}`));
      results.push({ sourceIssueId: src.id, sourceIssueTitle: src.title, sourceFixRevisionId: fix.id, fixSummary: fix.summary, matchReasons: reasons, applicabilityWarnings: warnings, verificationId: passed.id, verifiedAt: passed.verifiedAt, evidenceIds: [...new Set([...fix.evidenceIds, ...passed.evidenceIds])], rank: score });
    }
    results.sort((a, b) => b.rank - a.rank || a.verifiedAt.localeCompare(b.verifiedAt));
    return { issueId: issue.id, results, queryExplanation: "Deterministic match on defect code (+3), part family incl. marked entities (+2), confirmed cause type (+1), process step (+1); verified fixes only; shared supplier/team is never a match reason." };
  }

  // ----- insights -----
  function insights(filter: InsightsFilter): Insights {
    const all = [...issues.values()].filter((i) => matches(i, filter));
    const ids = (list: Issue[]) => list.map((i) => i.id).sort();
    const teams: TeamInsight[] = catalog.teams.map((t) => {
      const reported = all.filter((i) => i.reportingTeamId === t.id);
      const assignedOpen = all.filter((i) => i.assignedTeamId === t.id && i.status !== "closed");
      const confirmed = all.filter((i) => currentConfirmedCause(i.id)?.responsibleTeamId === t.id);
      return { teamId: t.id, teamName: t.name, reportedIssueCount: reported.length, assignedOpenCount: assignedOpen.length, confirmedCauseIssueCount: confirmed.length, reportedIssueIds: ids(reported), assignedOpenIssueIds: ids(assignedOpen), confirmedCauseIssueIds: ids(confirmed) };
    });
    const suppliers: SupplierInsight[] = catalog.suppliers.map((s) => {
      const linked = all.filter((i) => i.linkedSupplierIds.includes(s.id));
      const confirmed = all.filter((i) => currentConfirmedCause(i.id)?.responsibleSupplierId === s.id);
      const affectedUnits = new Set(confirmed.flatMap((i) => i.entityIds));
      const cohort = cohorts.get(s.id);
      const affectedInspected = cohort ? [...affectedUnits].filter((u) => cohort.inspectedUnits.has(u)).length : affectedUnits.size;
      const rate = cohort && cohort.complete && cohort.inspectedUnits.size > 0 ? affectedInspected / cohort.inspectedUnits.size : null;
      return { supplierId: s.id, supplierName: s.name, linkedIssueCount: linked.length, confirmedIssueCount: confirmed.length, distinctAffectedUnitCount: affectedUnits.size, inspectedUnitCount: cohort ? cohort.inspectedUnits.size : null, cohortComplete: cohort?.complete ?? false, affectedUnitRate: rate, linkedIssueIds: ids(linked), confirmedIssueIds: ids(confirmed) };
    });
    const bucket = (label: (i: Issue) => { id: string; label: string } | null) => {
      const m = new Map<string, { id: string; label: string; issueIds: string[] }>();
      for (const i of all) {
        const b = label(i);
        if (!b) continue;
        const cur = m.get(b.id) ?? { ...b, issueIds: [] };
        cur.issueIds.push(i.id);
        m.set(b.id, cur);
      }
      return [...m.values()].map((b) => ({ id: b.id, label: b.label, issueCount: b.issueIds.length, issueIds: b.issueIds.sort() })).sort((a, b) => b.issueCount - a.issueCount || a.id.localeCompare(b.id));
    };
    const name = (list: Array<{ id: string; name: string }>, id: string) => list.find((x) => x.id === id)?.name ?? id;
    return {
      contractVersion: CONTRACT_VERSION,
      filter,
      totalIssueCount: all.length,
      openIssueCount: all.filter((i) => i.status !== "closed").length,
      teams,
      suppliers,
      detectionStations: bucket((i) => (i.detectionStationId ? { id: i.detectionStationId, label: name(catalog.stations, i.detectionStationId) } : null)),
      causalProcessSteps: bucket((i) => {
        const c = currentConfirmedCause(i.id);
        const id = c?.causalProcessStepId ?? c?.causalStationId ?? null;
        return id ? { id, label: name([...catalog.processSteps, ...catalog.stations], id) } : null;
      }),
      causeTypes: bucket((i) => {
        const c = currentConfirmedCause(i.id);
        return c ? { id: c.causeType, label: c.causeType } : null;
      }),
      defectFamilies: bucket((i) => {
        if (!i.defectCode) return null;
        const d = catalog.defectCodes.find((x) => x.id === i.defectCode);
        const fam = d?.family ?? i.defectCode;
        return { id: slug(fam), label: fam };
      }),
      reusedFixCount: fixes.filter((f) => f.sourceFixRevisionId !== null && all.some((i) => i.id === f.issueId)).length,
      reopenedIssueCount: all.filter((i) => audit.some((a) => a.issueId === i.id && a.kind === "transition" && a.fromStatus === "closed")).length,
      notes: [
        "Counts are distinct issue ids unless labeled as units; cards overlap and are not additive blame scores.",
        "Detection location is not causal location. Linked suppliers are not confirmed faults.",
        "A null rate means the inspection cohort is unknown or incomplete (display N/A).",
      ],
    };
  }

  const services: IssueServices = {
    async getCatalog(ctx) {
      await gate("getCatalog");
      assertWorkspace(ctx);
      return structuredClone(catalog);
    },
    async upsertCatalogItem(ctx, { kind, item }) {
      await gate("upsertCatalogItem");
      assertWorkspace(ctx);
      const id = item.id ?? slug(item.name);
      const list = catalog[kind] as Array<CatalogItem | Station | ProcessStep | DefectCode>;
      const existing = list.find((x) => x.id === id);
      const record = kind === "stations"
        ? ({ id, name: item.name, active: item.active, siteId: item.siteId ?? null, areaLabel: item.areaLabel ?? null } satisfies Station)
        : kind === "processSteps"
          ? ({ id, name: item.name, active: item.active, areaLabel: item.areaLabel ?? null } satisfies ProcessStep)
          : kind === "defectCodes"
            ? ({ id, name: item.name, active: item.active, family: item.family ?? null } satisfies DefectCode)
            : ({ id, name: item.name, active: item.active } satisfies CatalogItem);
      if (existing) Object.assign(existing, record);
      else list.push(record);
      return structuredClone(record);
    },
    async getEntityContext(ctx, { entityId, configurationAsOf }) {
      await gate("getEntityContext");
      assertWorkspace(ctx);
      return structuredClone(entityContext(entityId, configurationAsOf));
    },
    async createIssue(ctx, command) {
      await gate("createIssue");
      assertWorkspace(ctx);
      const { idempotencyKey, newEvidence, ...input } = command;
      const { record, replayed } = idempotent(`create:${idempotencyKey}`, { input, newEvidence }, (id) => issues.get(id), () => {
        assertRefs(input);
        const evIds = [...input.evidenceIds];
        for (const ev of newEvidence) evIds.push(addEvidence(nextId("EVID"), ev.sourceName, ev.locator, ev.text, "manual").id);
        const issue: Issue = { ...input, evidenceIds: evIds, id: nextId("ISS"), version: 1, status: "open", createdBy: ctx.actorId, createdAt: now(), updatedAt: now(), confirmedCauseId: null, currentFixRevisionId: null };
        issues.set(issue.id, issue);
        log(issue.id, "created", ctx.actorId, "Issue created manually", null, null, "open");
        return issue;
      });
      return { issue: structuredClone(record), replayed };
    },
    async listIssues(ctx, filter) {
      await gate("listIssues");
      assertWorkspace(ctx);
      const all = [...issues.values()].filter((i) => matches(i, filter)).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt) || a.id.localeCompare(b.id));
      const start = filter.cursor ? Math.max(0, Number(filter.cursor)) : 0;
      const items = all.slice(start, start + filter.limit);
      const next = start + filter.limit < all.length ? String(start + filter.limit) : null;
      const page: IssuePage = { items: structuredClone(items), nextCursor: next, total: all.length };
      return page;
    },
    async getIssue(ctx, { issueId }) {
      await gate("getIssue");
      assertWorkspace(ctx);
      return detail(getIssueOrThrow(issueId));
    },
    async updateIssue(ctx, { issueId, update }) {
      await gate("updateIssue");
      assertWorkspace(ctx);
      const issue = getIssueOrThrow(issueId);
      if (issue.version !== update.expectedVersion) throw new DomainError("STALE_VERSION", "Issue was modified by someone else; reload and retry.", { currentVersion: issue.version, expectedVersion: update.expectedVersion });
      const { expectedVersion: _v, ...fields } = update;
      assertRefs(fields);
      const changed = Object.keys(fields).filter((k) => fields[k as keyof typeof fields] !== undefined);
      Object.assign(issue, Object.fromEntries(changed.map((k) => [k, fields[k as keyof typeof fields]])));
      bump(issue);
      log(issue.id, "updated", ctx.actorId, `Updated ${changed.join(", ") || "nothing"}`);
      return structuredClone(issue);
    },
    async addIssueComment(ctx, { issueId, comment }) {
      await gate("addIssueComment");
      assertWorkspace(ctx);
      const issue = getIssueOrThrow(issueId);
      const { record } = idempotent(`comment:${issueId}:${comment.idempotencyKey}`, comment, (id) => comments.find((c) => c.id === id), () => {
        assertRefs({ evidenceIds: comment.evidenceIds });
        const evIds = [...comment.evidenceIds, ...comment.newEvidence.map((ev) => addEvidence(nextId("EVID"), ev.sourceName, ev.locator, ev.text, "manual").id)];
        const c: IssueComment = { id: nextId("CMT"), issueId, body: comment.body, evidenceIds: evIds, authorId: ctx.actorId, createdAt: now() };
        comments.push(c);
        log(issueId, "commented", ctx.actorId, "Comment added", c.id);
        return c;
      });
      void issue;
      return structuredClone(record);
    },
    async recordCauseAssessment(ctx, { issueId, assessment }) {
      await gate("recordCauseAssessment");
      assertWorkspace(ctx);
      const issue = getIssueOrThrow(issueId);
      const { record } = idempotent(`cause:${issueId}:${assessment.idempotencyKey}`, assessment, (id) => causes.find((c) => c.id === id), () => {
        assertRefs({ evidenceIds: assessment.evidenceIds, assignedTeamId: assessment.responsibleTeamId, detectionStationId: assessment.causalStationId, processStepId: assessment.causalProcessStepId, linkedSupplierIds: assessment.responsibleSupplierId ? [assessment.responsibleSupplierId] : [] });
        if (assessment.supersedesId && !causes.some((c) => c.id === assessment.supersedesId && c.issueId === issueId)) throw new DomainError("INVALID_REFERENCE", "supersedesId does not belong to this issue.");
        for (const c of causes) if (c.issueId === issueId) c.isCurrent = false;
        const { idempotencyKey: _k, ...rest } = assessment;
        const c: CauseAssessment = { ...rest, id: nextId("CAUSE"), issueId, assessedBy: ctx.actorId, assessedAt: now(), isCurrent: true };
        causes.push(c);
        issue.confirmedCauseId = c.state === "confirmed" ? c.id : null;
        bump(issue);
        log(issueId, "cause_recorded", ctx.actorId, `${c.state} cause ${c.causeType}`, c.id);
        return c;
      });
      return structuredClone(record);
    },
    async createFixRevision(ctx, { issueId, fix }) {
      await gate("createFixRevision");
      assertWorkspace(ctx);
      const issue = getIssueOrThrow(issueId);
      const { record } = idempotent(`fix:${issueId}:${fix.idempotencyKey}`, fix, (id) => fixes.find((f) => f.id === id), () => {
        assertRefs({ evidenceIds: fix.evidenceIds, processStepId: fix.applicability.processStepId });
        if (fix.sourceFixRevisionId && !fixes.some((f) => f.id === fix.sourceFixRevisionId)) throw new DomainError("INVALID_REFERENCE", "sourceFixRevisionId does not exist.");
        const version = fixes.filter((f) => f.issueId === issueId).length + 1;
        const { idempotencyKey: _k, ...rest } = fix;
        const f: FixRevision = { ...rest, id: nextId("FIX"), issueId, version, state: "proposed", createdBy: ctx.actorId, createdAt: now(), appliedAt: null };
        fixes.push(f);
        issue.currentFixRevisionId = f.id;
        bump(issue);
        log(issueId, "fix_created", ctx.actorId, f.sourceFixRevisionId ? `Fix v${version} proposed from ${f.sourceFixRevisionId}` : `Fix v${version} proposed`, f.id);
        return f;
      });
      return structuredClone(record);
    },
    async recordVerification(ctx, { issueId, verification }) {
      await gate("recordVerification");
      assertWorkspace(ctx);
      const issue = getIssueOrThrow(issueId);
      const { record } = idempotent(`verify:${issueId}:${verification.idempotencyKey}`, verification, (id) => verifications.find((v) => v.id === id), () => {
        const fix = fixes.find((f) => f.id === verification.fixRevisionId && f.issueId === issueId);
        if (!fix) throw new DomainError("INVALID_REFERENCE", "fixRevisionId does not belong to this issue.");
        assertRefs({ evidenceIds: verification.evidenceIds });
        const evIds = [...verification.evidenceIds, ...verification.newEvidence.map((ev) => addEvidence(nextId("EVID"), ev.sourceName, ev.locator, ev.text, "manual").id)];
        const { idempotencyKey: _k, newEvidence: _n, ...rest } = verification;
        const v: Verification = { ...rest, evidenceIds: evIds, id: nextId("VERIFY"), issueId, verifiedBy: ctx.actorId, verifiedAt: now() };
        verifications.push(v);
        fix.appliedAt ??= now();
        fix.state = v.outcome === "pass" ? "verified" : "applied";
        if (v.outcome === "fail" && issue.status === "pending_verification") {
          log(issueId, "transition", ctx.actorId, "Verification failed; back to work", v.id, "pending_verification", "in_progress");
          issue.status = "in_progress";
        }
        bump(issue);
        log(issueId, "verification_recorded", ctx.actorId, `Verification ${v.outcome} for ${fix.id}`, v.id);
        return v;
      });
      return structuredClone(record);
    },
    async transitionIssue(ctx, { issueId, command }) {
      await gate("transitionIssue");
      assertWorkspace(ctx);
      const issue = getIssueOrThrow(issueId);
      const { record } = idempotent(`transition:${issueId}:${command.idempotencyKey}`, command, () => issue, () => {
        if (issue.version !== command.expectedVersion) throw new DomainError("STALE_VERSION", "Issue was modified; reload and retry.", { currentVersion: issue.version, expectedVersion: command.expectedVersion });
        const rule = TRANSITIONS[command.action];
        if (!rule.from.includes(issue.status)) throw new DomainError("INVALID_TRANSITION", `Cannot ${command.action} an issue in status ${issue.status}.`, { from: issue.status, allowedFrom: rule.from });
        if (command.action === "close") {
          if (!command.fixRevisionId) throw new DomainError("VERIFICATION_REQUIRED", "Closing requires the applied fix revision id and its passed verification.");
          const fix = fixes.find((f) => f.id === command.fixRevisionId && f.issueId === issueId);
          if (!fix) throw new DomainError("INVALID_REFERENCE", "fixRevisionId does not belong to this issue.");
          const latest = verifications.filter((v) => v.fixRevisionId === fix.id).sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt) || b.id.localeCompare(a.id))[0];
          if (!latest || latest.outcome !== "pass") throw new DomainError("VERIFICATION_REQUIRED", "A passed verification for this fix revision is required before closure.", { fixRevisionId: fix.id, latestOutcome: latest?.outcome ?? null });
          issue.currentFixRevisionId = fix.id;
        }
        const from = issue.status;
        issue.status = rule.to;
        bump(issue);
        log(issueId, "transition", ctx.actorId, command.reason || `${command.action}`, command.fixRevisionId, from, rule.to);
        return issue;
      });
      return structuredClone(record);
    },
    async findSimilarResolutions(ctx, { issueId }) {
      await gate("findSimilarResolutions");
      assertWorkspace(ctx);
      return structuredClone(similar(getIssueOrThrow(issueId)));
    },
    async getInsights(ctx, filter) {
      await gate("getInsights");
      assertWorkspace(ctx);
      return structuredClone(insights(filter));
    },
  };

  return Object.assign(services, { _reset: () => undefined });
}

export function issueDoubleWorkspaceId(env: Env = process.env): string {
  return env.RECALL_WORKSPACE_ID ?? EV_DEMO.workspaceId;
}
