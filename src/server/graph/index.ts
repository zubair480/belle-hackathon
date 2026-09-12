/**
 * RecallRadius graph services (assembly-quality-v4) on Neo4j via the official driver.
 *
 * Exports `graphServices` implementing `DomainServices`. Every query is parameterized and scoped
 * by workspace (`ws`). Writes run in explicit write transactions; idempotency keys and
 * `expectedVersion` are checked inside the same transaction as the mutation. Expected failures
 * are thrown as `DomainError`; driver errors are wrapped as BACKEND_UNAVAILABLE without credentials.
 *
 * Model (all nodes carry ws + id):
 *   Catalog: Site, Team, Supplier, Station, ProcessStep, DefectCode, Customer
 *   Provenance: Entity -[:HAS_ORIGIN]-> Origin -[:FROM_SUPPLIER_LOT]-> SupplierLot -[:SUPPLIED_BY]-> Supplier
 *                                          Origin -[:PRODUCED_IN]-> MfgLot -[:MADE_BY]-> Team
 *   Assembly:   Entity -[:INSTALLED_IN {id, slotId, installedAt, removedAt, recordedAt, evidenceIds}]-> Entity
 *               Entity -[:SHIPPED_TO {id, shippedAt}]-> Customer
 *   Workflow:   Issue -[:REPORTED_BY|ASSIGNED_TO]-> Team, -[:DETECTED_AT]-> Station, -[:AT_STEP]-> ProcessStep,
 *               -[:AFFECTS]-> Entity, -[:LINKS_SUPPLIER]-> Supplier, -[:HAS_DEFECT]-> DefectCode, -[:HAS_EVIDENCE]-> Evidence
 *               Comment -[:ON]-> Issue; Cause -[:ASSESSES]-> Issue (+RESPONSIBLE_TEAM/RESPONSIBLE_SUPPLIER/CAUSAL_STATION/CAUSAL_STEP/SUPERSEDES)
 *               Fix -[:FIXES]-> Issue, Fix -[:DERIVED_FROM]-> Fix; Verification -[:VERIFIES]-> Fix, -[:OF_ISSUE]-> Issue
 *               Audit -[:AUDITS]-> Issue; Idem (ws,key); Revision; Preview; TraceRun (immutable JSON result)
 */
import { createHash, randomUUID } from "node:crypto";
import neo4j, { type ManagedTransaction } from "neo4j-driver";
import { DomainError, type EntityContext, type EntityRecord, type Evidence, type Installation, type RequestContext, type ReviewIssue } from "@/contracts/common";
import {
  CONTRACT_VERSION,
  TRANSITIONS,
  type AuditEvent,
  type CatalogItem,
  type CatalogKind,
  type CatalogUpsert,
  type CauseAssessment,
  type DefectCode,
  type FixRevision,
  type Insights,
  type InsightsFilter,
  type Issue,
  type IssueComment,
  type IssueDetail,
  type IssueListFilter,
  type IssuePage,
  type IssueServices,
  type IssueStatus,
  type ProcessStep,
  type ReferenceCatalog,
  type SimilarResolution,
  type SimilarResolutions,
  type Station,
  type SupplierInsight,
  type TeamInsight,
} from "@/contracts/issues";
import {
  CURRENT_REVISION_ALIAS,
  IMPORT_FILE_NAMES,
  REVIEW_ISSUE_CODES,
  type DomainServices,
  type ImportPreview,
  type RevisionInfo,
  type TraceComparison,
  type TraceCounts,
  type TracePath,
  type TraceRequest,
  type TraceResult,
  type TraceRow,
  type TraceServices,
} from "@/contracts/recall";
import { openSession } from "./driver";

type Json = Record<string, unknown>;
type Tx = ManagedTransaction;

const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "ITEM";
const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

function wrap(e: unknown): never {
  if (e instanceof DomainError) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  throw new DomainError("BACKEND_UNAVAILABLE", `Neo4j operation failed: ${msg.replace(/neo4j\+s?:\/\/\S+/g, "<uri>").slice(0, 200)}`);
}

async function read<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const s = openSession(process.env, "READ");
  try {
    return await s.executeRead(fn);
  } catch (e) {
    return wrap(e);
  } finally {
    await s.close();
  }
}
async function write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const s = openSession(process.env, "WRITE");
  try {
    return await s.executeWrite(fn);
  } catch (e) {
    return wrap(e);
  } finally {
    await s.close();
  }
}
const props = (rec: unknown): Json => ((rec as { properties?: Json } | null)?.properties ?? {}) as Json;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const toIssue = (p: Json): Issue => ({
  id: String(p.id), version: num(p.version), status: p.status as IssueStatus, title: String(p.title), description: String(p.description ?? ""),
  origin: p.origin as Issue["origin"], detectedAt: String(p.detectedAt), reportingTeamId: String(p.reportingTeamId), assignedTeamId: str(p.assignedTeamId),
  detectionStationId: str(p.detectionStationId), processStepId: str(p.processStepId), entityIds: arr(p.entityIds), partNumber: str(p.partNumber),
  partRevision: str(p.partRevision), linkedSupplierIds: arr(p.linkedSupplierIds), defectCode: str(p.defectCode), severity: p.severity as Issue["severity"],
  evidenceIds: arr(p.evidenceIds), createdBy: String(p.createdBy), createdAt: String(p.createdAt), updatedAt: String(p.updatedAt),
  confirmedCauseId: str(p.confirmedCauseId), currentFixRevisionId: str(p.currentFixRevisionId),
});
const toEvidence = (p: Json): Evidence => ({
  id: String(p.id), sourceName: String(p.sourceName), sourceHash: String(p.sourceHash), locator: String(p.locator), text: String(p.text ?? ""),
  sourceKind: (p.sourceKind as Evidence["sourceKind"]) ?? "synthetic", sourceRecordId: str(p.sourceRecordId), sourceUrl: str(p.sourceUrl), retrievedAt: str(p.retrievedAt),
});
const toCause = (p: Json): CauseAssessment => ({
  id: String(p.id), issueId: String(p.issueId), state: p.state as CauseAssessment["state"], causeType: p.causeType as CauseAssessment["causeType"],
  responsibleTeamId: str(p.responsibleTeamId), responsibleSupplierId: str(p.responsibleSupplierId), causalStationId: str(p.causalStationId),
  causalProcessStepId: str(p.causalProcessStepId), rationale: String(p.rationale ?? ""), evidenceIds: arr(p.evidenceIds), supersedesId: str(p.supersedesId),
  assessedBy: String(p.assessedBy), assessedAt: String(p.assessedAt), isCurrent: Boolean(p.isCurrent),
});
const toFix = (p: Json): FixRevision => ({
  id: String(p.id), issueId: String(p.issueId), version: num(p.version), summary: String(p.summary), steps: JSON.parse(String(p.stepsJson ?? "[]")) as FixRevision["steps"],
  applicability: JSON.parse(String(p.applicabilityJson ?? "{}")) as FixRevision["applicability"], sourceFixRevisionId: str(p.sourceFixRevisionId),
  workInstructionRef: str(p.workInstructionRef), evidenceIds: arr(p.evidenceIds), state: p.state as FixRevision["state"], createdBy: String(p.createdBy),
  createdAt: String(p.createdAt), appliedAt: str(p.appliedAt),
});
const toVerification = (p: Json) => ({
  id: String(p.id), issueId: String(p.issueId), fixRevisionId: String(p.fixRevisionId), outcome: p.outcome as "pass" | "fail", method: String(p.method),
  resultNotes: String(p.resultNotes ?? ""), evidenceIds: arr(p.evidenceIds), verifiedBy: String(p.verifiedBy), verifiedAt: String(p.verifiedAt),
});
const toAudit = (p: Json): AuditEvent => ({
  id: String(p.id), issueId: String(p.issueId), kind: p.kind as AuditEvent["kind"], actorId: String(p.actorId), at: String(p.at),
  fromStatus: str(p.fromStatus) as IssueStatus | null, toStatus: str(p.toStatus) as IssueStatus | null, summary: String(p.summary ?? ""), subjectId: str(p.subjectId),
});
const toComment = (p: Json): IssueComment => ({ id: String(p.id), issueId: String(p.issueId), body: String(p.body), evidenceIds: arr(p.evidenceIds), authorId: String(p.authorId), createdAt: String(p.createdAt) });
const toEntity = (p: Json, o: Json | null): EntityRecord => ({
  id: String(p.id), kind: p.kind as EntityRecord["kind"], partNumber: String(p.partNumber), partRevision: str(p.partRevision), serialNumber: String(p.serialNumber),
  displayCode: String(p.displayCode ?? p.id), issuerId: str(p.issuerId), locationState: (p.locationState as EntityRecord["locationState"]) ?? "unknown",
  origin: o
    ? {
        id: String(o.id), sourcingType: o.sourcingType as "supplier" | "in_house" | "unknown", producerOrganizationId: str(o.producerOrganizationId), partNumber: String(o.partNumber),
        partRevision: str(o.partRevision), productionLotId: str(o.productionLotId), supplierId: str(o.supplierId), supplierBatchCode: str(o.supplierBatchCode), siteId: str(o.siteId),
        manufacturingLotCode: str(o.manufacturingLotCode), workOrderId: str(o.workOrderId), manufacturingTeamId: str(o.manufacturingTeamId), processStepId: str(o.processStepId), evidenceIds: arr(o.evidenceIds),
      }
    : null,
  vehicle: p.kind === "vehicle" ? { entityId: String(p.id), buildId: String(p.buildId ?? p.id), vin: str(p.vin) } : null,
});
const toInstallation = (r: Json, childId: string, parentId: string): Installation => ({
  id: String(r.id), childId, parentId, slotId: String(r.slotId), installedAt: String(r.installedAt), removedAt: str(r.removedAt), recordedAt: String(r.recordedAt ?? r.installedAt), evidenceIds: arr(r.evidenceIds),
});

// ---------------------------------------------------------------------------
// Shared helpers (inside transactions)
// ---------------------------------------------------------------------------

async function exists(tx: Tx, label: string, ws: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const r = await tx.run(`UNWIND $ids AS id OPTIONAL MATCH (n:${label} {ws: $ws, id: id}) RETURN id, n IS NOT NULL AS found`, { ws, ids });
  return r.records.filter((x) => !x.get("found")).map((x) => String(x.get("id")));
}

async function assertRefs(tx: Tx, ws: string, input: Partial<Pick<Issue, "reportingTeamId" | "assignedTeamId" | "detectionStationId" | "processStepId" | "entityIds" | "linkedSupplierIds" | "defectCode" | "evidenceIds">>): Promise<void> {
  const bad: string[] = [];
  const check = async (label: string, ids: Array<string | null | undefined>) => {
    const missing = await exists(tx, label, ws, ids.filter((x): x is string => typeof x === "string"));
    bad.push(...missing.map((m) => `${label.toLowerCase()}:${m}`));
  };
  await check("Team", [input.reportingTeamId, input.assignedTeamId]);
  await check("Station", [input.detectionStationId]);
  await check("ProcessStep", [input.processStepId]);
  await check("DefectCode", [input.defectCode]);
  await check("Entity", input.entityIds ?? []);
  await check("Supplier", input.linkedSupplierIds ?? []);
  await check("Evidence", input.evidenceIds ?? []);
  if (bad.length) throw new DomainError("INVALID_REFERENCE", "One or more linked ids do not exist in this workspace.", { invalid: bad });
}

async function idempotent<T extends { id: string }>(tx: Tx, ws: string, key: string, payload: unknown, lookup: () => Promise<T | null>, create: () => Promise<T>): Promise<{ record: T; replayed: boolean }> {
  const hash = sha256(JSON.stringify(payload));
  const seen = await tx.run("MATCH (k:Idem {ws: $ws, key: $key}) RETURN k.hash AS hash, k.resultId AS resultId", { ws, key });
  const row = seen.records[0];
  if (row) {
    if (row.get("hash") !== hash) throw new DomainError("DUPLICATE_ACTION", "Idempotency key was already used with a different payload.", { idempotencyKey: key });
    const existing = await lookup();
    if (existing) return { record: existing, replayed: true };
  }
  const record = await create();
  await tx.run("MERGE (k:Idem {ws: $ws, key: $key}) SET k.hash = $hash, k.resultId = $resultId, k.at = $at", { ws, key, hash, resultId: record.id, at: now() });
  return { record, replayed: false };
}

async function addEvidence(tx: Tx, ws: string, id: string, sourceName: string, locator: string, text: string, kind: Evidence["sourceKind"]): Promise<string> {
  await tx.run("MERGE (e:Evidence {ws: $ws, id: $id}) SET e.sourceName = $sourceName, e.sourceHash = $hash, e.locator = $locator, e.text = $text, e.sourceKind = $kind, e.sourceRecordId = null, e.sourceUrl = null, e.retrievedAt = null", { ws, id, sourceName, hash: sha256(text), locator, text, kind });
  return id;
}

async function audit(tx: Tx, ws: string, issueId: string, kind: AuditEvent["kind"], actorId: string, summary: string, subjectId: string | null = null, fromStatus: IssueStatus | null = null, toStatus: IssueStatus | null = null): Promise<void> {
  const seq = await tx.run("MATCH (a:Audit {ws: $ws, issueId: $issueId}) RETURN count(a) AS c", { ws, issueId });
  await tx.run(
    "MATCH (i:Issue {ws: $ws, id: $issueId}) CREATE (a:Audit {ws: $ws, id: $id, issueId: $issueId, kind: $kind, actorId: $actorId, at: $at, fromStatus: $fromStatus, toStatus: $toStatus, summary: $summary, subjectId: $subjectId, seq: $seq})-[:AUDITS]->(i)",
    { ws, id: newId("AUD"), issueId, kind, actorId, at: now(), fromStatus, toStatus, summary, subjectId, seq: num(seq.records[0]?.get("c")) + 1 },
  );
}

async function getIssueNode(tx: Tx, ws: string, id: string): Promise<Issue> {
  const r = await tx.run("MATCH (i:Issue {ws: $ws, id: $id}) RETURN i", { ws, id });
  const rec = r.records[0];
  if (!rec) throw new DomainError("NOT_FOUND", `Issue ${id} does not exist.`);
  return toIssue(props(rec.get("i")));
}

async function syncIssueRels(tx: Tx, ws: string, issue: Issue): Promise<void> {
  await tx.run(
    `MATCH (i:Issue {ws: $ws, id: $id})
     OPTIONAL MATCH (i)-[r:REPORTED_BY|ASSIGNED_TO|DETECTED_AT|AT_STEP|AFFECTS|LINKS_SUPPLIER|HAS_DEFECT|HAS_EVIDENCE]->() DELETE r
     WITH i
     MATCH (t:Team {ws: $ws, id: $reportingTeamId}) MERGE (i)-[:REPORTED_BY]->(t)
     WITH i
     FOREACH (_ IN CASE WHEN $assignedTeamId IS NULL THEN [] ELSE [1] END | MERGE (a:Team {ws: $ws, id: $assignedTeamId}) MERGE (i)-[:ASSIGNED_TO]->(a))
     FOREACH (_ IN CASE WHEN $detectionStationId IS NULL THEN [] ELSE [1] END | MERGE (s:Station {ws: $ws, id: $detectionStationId}) MERGE (i)-[:DETECTED_AT]->(s))
     FOREACH (_ IN CASE WHEN $processStepId IS NULL THEN [] ELSE [1] END | MERGE (p:ProcessStep {ws: $ws, id: $processStepId}) MERGE (i)-[:AT_STEP]->(p))
     FOREACH (_ IN CASE WHEN $defectCode IS NULL THEN [] ELSE [1] END | MERGE (d:DefectCode {ws: $ws, id: $defectCode}) MERGE (i)-[:HAS_DEFECT]->(d))
     FOREACH (eid IN $entityIds | MERGE (e:Entity {ws: $ws, id: eid}) MERGE (i)-[:AFFECTS]->(e))
     FOREACH (sid IN $linkedSupplierIds | MERGE (s:Supplier {ws: $ws, id: sid}) MERGE (i)-[:LINKS_SUPPLIER]->(s))
     FOREACH (vid IN $evidenceIds | MERGE (v:Evidence {ws: $ws, id: vid}) MERGE (i)-[:HAS_EVIDENCE]->(v))`,
    { ws, id: issue.id, reportingTeamId: issue.reportingTeamId, assignedTeamId: issue.assignedTeamId, detectionStationId: issue.detectionStationId, processStepId: issue.processStepId, defectCode: issue.defectCode, entityIds: issue.entityIds, linkedSupplierIds: issue.linkedSupplierIds, evidenceIds: issue.evidenceIds },
  );
}

async function setIssueProps(tx: Tx, ws: string, issue: Issue): Promise<void> {
  await tx.run("MATCH (i:Issue {ws: $ws, id: $id}) SET i += $p", { ws, id: issue.id, p: { ...issue, version: neo4j.int(issue.version) } });
}

async function currentConfirmedCause(tx: Tx, ws: string, issueId: string): Promise<CauseAssessment | null> {
  const r = await tx.run("MATCH (c:Cause {ws: $ws, issueId: $issueId, isCurrent: true, state: 'confirmed'}) RETURN c LIMIT 1", { ws, issueId });
  const rec = r.records[0];
  return rec ? toCause(props(rec.get("c"))) : null;
}

// ---------------------------------------------------------------------------
// Entity context and traversal
// ---------------------------------------------------------------------------

async function loadEntity(tx: Tx, ws: string, id: string): Promise<EntityRecord | null> {
  const r = await tx.run("MATCH (e:Entity {ws: $ws, id: $id}) OPTIONAL MATCH (e)-[:HAS_ORIGIN]->(o:Origin) RETURN e, o", { ws, id });
  const rec = r.records[0];
  if (!rec) return null;
  return toEntity(props(rec.get("e")), rec.get("o") ? props(rec.get("o")) : null);
}

const activeCypher = (at: string) => `r.installedAt <= '${at.replace(/'/g, "")}' AND (r.removedAt IS NULL OR r.removedAt > '${at.replace(/'/g, "")}')`;

async function entityContext(tx: Tx, ws: string, entityId: string, configurationAsOf: string | null): Promise<EntityContext> {
  const entity = await loadEntity(tx, ws, entityId);
  if (!entity) throw new DomainError("NOT_FOUND", `Entity ${entityId} does not exist.`);
  const at = configurationAsOf ?? now();
  const chain = await tx.run(
    `MATCH p = (e:Entity {ws: $ws, id: $id})-[:INSTALLED_IN*1..6]->(x:Entity)
     WHERE all(r IN relationships(p) WHERE ${activeCypher(at)})
     RETURN [n IN nodes(p)[1..] | n] AS parents ORDER BY length(p) DESC LIMIT 1`,
    { ws, id: entityId },
  );
  const parentNodes = (chain.records[0]?.get("parents") as unknown[] | undefined) ?? [];
  const currentParents: EntityRecord[] = [];
  for (const n of parentNodes) {
    const e = await loadEntity(tx, ws, String(props(n).id));
    if (e) currentParents.push(e);
  }
  const kids = await tx.run(`MATCH (c:Entity)-[r:INSTALLED_IN]->(e:Entity {ws: $ws, id: $id}) WHERE ${activeCypher(at)} RETURN c.id AS id`, { ws, id: entityId });
  const currentChildren: EntityRecord[] = [];
  for (const rec of kids.records) {
    const e = await loadEntity(tx, ws, String(rec.get("id")));
    if (e) currentChildren.push(e);
  }
  const touching = await tx.run("MATCH (a:Entity {ws: $ws})-[r:INSTALLED_IN]->(b:Entity {ws: $ws}) WHERE a.id = $id OR b.id = $id RETURN r, a.id AS childId, b.id AS parentId ORDER BY r.installedAt", { ws, id: entityId });
  const installations = touching.records.map((rec) => toInstallation(props(rec.get("r")), String(rec.get("childId")), String(rec.get("parentId"))));
  const hist = await tx.run("MATCH (e:Entity {ws: $ws, id: $id})-[:INSTALLED_IN*1..6]->(v:Entity {ws: $ws, kind: 'vehicle'}) RETURN DISTINCT v.id AS id", { ws, id: entityId });
  const historical = new Set(hist.records.map((r) => String(r.get("id"))));
  if (entity.kind === "vehicle") historical.add(entity.id);
  const evIds = [...new Set([...(entity.origin?.evidenceIds ?? []), ...installations.flatMap((i) => i.evidenceIds)])];
  const ev = await tx.run("UNWIND $ids AS id MATCH (v:Evidence {ws: $ws, id: id}) RETURN v", { ws, ids: evIds });
  return {
    entity, currentParents, currentChildren, installations,
    currentVehicleIds: entity.kind === "vehicle" ? [entity.id] : currentParents.filter((p) => p.kind === "vehicle").map((p) => p.id),
    historicalVehicleIds: [...historical].sort(),
    evidence: ev.records.map((r) => toEvidence(props(r.get("v")))),
    limitations: ["Synthetic fixture; one charge-port path only, not a full vehicle BOM", "A producer or supplier link is not a confirmed cause"],
  };
}

// ---------------------------------------------------------------------------
// Issue services
// ---------------------------------------------------------------------------

const catalogQuery = async (tx: Tx, ws: string): Promise<ReferenceCatalog> => {
  const q = async (label: string) => (await tx.run(`MATCH (n:${label} {ws: $ws}) RETURN n ORDER BY n.name`, { ws })).records.map((r) => props(r.get("n")));
  const base = (p: Json): CatalogItem => ({ id: String(p.id), name: String(p.name ?? p.id), active: p.active !== false });
  return {
    contractVersion: CONTRACT_VERSION,
    teams: (await q("Team")).map(base),
    suppliers: (await q("Supplier")).map(base),
    stations: (await q("Station")).map((p): Station => ({ ...base(p), siteId: str(p.siteId), areaLabel: str(p.areaLabel) })),
    processSteps: (await q("ProcessStep")).map((p): ProcessStep => ({ ...base(p), areaLabel: str(p.areaLabel) })),
    defectCodes: (await q("DefectCode")).map((p): DefectCode => ({ ...base(p), family: str(p.family) })),
    sites: (await q("Site")).map(base),
  };
};

const CATALOG_LABEL: Record<CatalogKind, string> = { teams: "Team", suppliers: "Supplier", stations: "Station", processSteps: "ProcessStep", defectCodes: "DefectCode" };

async function issueDetail(tx: Tx, ws: string, issue: Issue): Promise<IssueDetail> {
  const entities: EntityRecord[] = [];
  const entityContexts: EntityContext[] = [];
  for (const id of issue.entityIds) {
    const e = await loadEntity(tx, ws, id);
    if (e) {
      entities.push(e);
      entityContexts.push(await entityContext(tx, ws, id, null));
    }
  }
  const rows = async (label: string, order: string) => (await tx.run(`MATCH (n:${label} {ws: $ws, issueId: $issueId}) RETURN n ORDER BY ${order}`, { ws, issueId: issue.id })).records.map((r) => props(r.get("n")));
  const causes = (await rows("Cause", "n.assessedAt, n.id")).map(toCause);
  const fixes = (await rows("Fix", "n.version")).map(toFix);
  const verifications = (await rows("Verification", "n.verifiedAt, n.id")).map(toVerification);
  const comments = (await rows("Comment", "n.createdAt, n.id")).map(toComment);
  const auditEvents = (await rows("Audit", "n.seq")).map(toAudit);
  const evIds = new Set<string>(issue.evidenceIds);
  for (const c of causes) c.evidenceIds.forEach((x) => evIds.add(x));
  for (const f of fixes) f.evidenceIds.forEach((x) => evIds.add(x));
  for (const v of verifications) v.evidenceIds.forEach((x) => evIds.add(x));
  for (const c of comments) c.evidenceIds.forEach((x) => evIds.add(x));
  for (const e of entities) e.origin?.evidenceIds.forEach((x) => evIds.add(x));
  const ev = await tx.run("UNWIND $ids AS id MATCH (v:Evidence {ws: $ws, id: id}) RETURN v", { ws, ids: [...evIds] });
  return { contractVersion: CONTRACT_VERSION, issue, entities, entityContexts, causes, fixes, verifications, comments, audit: auditEvents, evidence: ev.records.map((r) => toEvidence(props(r.get("v")))) };
}

function matches(issue: Issue, cause: CauseAssessment | null, f: IssueListFilter | InsightsFilter): boolean {
  if (f.status && !f.status.includes(issue.status)) return false;
  if (f.severity && !f.severity.includes(issue.severity)) return false;
  if (f.supplierId && !issue.linkedSupplierIds.includes(f.supplierId) && cause?.responsibleSupplierId !== f.supplierId) return false;
  if (f.defectCode && issue.defectCode !== f.defectCode) return false;
  if (f.partNumber && issue.partNumber !== f.partNumber) return false;
  if (f.stationId && issue.detectionStationId !== f.stationId && cause?.causalStationId !== f.stationId) return false;
  if (f.processStepId && issue.processStepId !== f.processStepId && cause?.causalProcessStepId !== f.processStepId) return false;
  if (f.detectedFrom && Date.parse(issue.detectedAt) < Date.parse(f.detectedFrom)) return false;
  if (f.detectedToExclusive && Date.parse(issue.detectedAt) >= Date.parse(f.detectedToExclusive)) return false;
  if ("teamId" in f && f.teamId) {
    const role = f.teamRole ?? "reporting";
    if (role === "reporting" && issue.reportingTeamId !== f.teamId) return false;
    if (role === "assigned" && issue.assignedTeamId !== f.teamId) return false;
    if (role === "confirmed_cause" && cause?.responsibleTeamId !== f.teamId) return false;
  }
  if ("entityId" in f && f.entityId && !issue.entityIds.includes(f.entityId)) return false;
  if ("text" in f && f.text && !`${issue.title} ${issue.description}`.toLowerCase().includes(f.text.toLowerCase())) return false;
  return true;
}

async function issuesWithCauses(tx: Tx, ws: string): Promise<Array<{ issue: Issue; cause: CauseAssessment | null }>> {
  const r = await tx.run("MATCH (i:Issue {ws: $ws}) OPTIONAL MATCH (i)<-[:ASSESSES]-(c:Cause {isCurrent: true, state: 'confirmed'}) RETURN i, c ORDER BY i.detectedAt DESC, i.id", { ws });
  return r.records.map((rec) => ({ issue: toIssue(props(rec.get("i"))), cause: rec.get("c") ? toCause(props(rec.get("c"))) : null }));
}

const issueServices: IssueServices = {
  async getCatalog(ctx) {
    return read((tx) => catalogQuery(tx, ctx.workspaceId));
  },
  async upsertCatalogItem(ctx, { kind, item }) {
    const ws = ctx.workspaceId;
    const id = item.id ?? slug(item.name);
    const label = CATALOG_LABEL[kind];
    const extra: Json = kind === "stations" ? { siteId: item.siteId ?? null, areaLabel: item.areaLabel ?? null } : kind === "processSteps" ? { areaLabel: item.areaLabel ?? null } : kind === "defectCodes" ? { family: item.family ?? null } : {};
    return write(async (tx) => {
      const r = await tx.run(`MERGE (n:${label} {ws: $ws, id: $id}) SET n.name = $name, n.active = $active, n += $extra RETURN n`, { ws, id, name: item.name, active: item.active, extra });
      const p = props(r.records[0]?.get("n"));
      const base = { id: String(p.id), name: String(p.name), active: p.active !== false };
      if (kind === "stations") return { ...base, siteId: str(p.siteId), areaLabel: str(p.areaLabel) };
      if (kind === "processSteps") return { ...base, areaLabel: str(p.areaLabel) };
      if (kind === "defectCodes") return { ...base, family: str(p.family) };
      return base;
    });
  },
  async getEntityContext(ctx, { entityId, configurationAsOf }) {
    return read((tx) => entityContext(tx, ctx.workspaceId, entityId, configurationAsOf));
  },
  async createIssue(ctx, command) {
    const ws = ctx.workspaceId;
    const { idempotencyKey, newEvidence, ...input } = command;
    return write(async (tx) => {
      const { record, replayed } = await idempotent(tx, ws, `create:${idempotencyKey}`, { input, newEvidence }, async () => {
        const r = await tx.run("MATCH (k:Idem {ws: $ws, key: $key})-[:RESULT]->(i:Issue) RETURN i", { ws, key: `create:${idempotencyKey}` });
        return r.records[0] ? toIssue(props(r.records[0].get("i"))) : null;
      }, async () => {
        await assertRefs(tx, ws, input);
        const evidenceIds = [...input.evidenceIds];
        for (const ev of newEvidence) evidenceIds.push(await addEvidence(tx, ws, newId("EVID"), ev.sourceName, ev.locator, ev.text, "manual"));
        const t = now();
        const issue: Issue = { ...input, evidenceIds, id: newId("ISS"), version: 1, status: "open", createdBy: ctx.actorId, createdAt: t, updatedAt: t, confirmedCauseId: null, currentFixRevisionId: null };
        await tx.run("CREATE (i:Issue {ws: $ws, id: $id}) SET i += $p", { ws, id: issue.id, p: { ...issue, version: neo4j.int(1) } });
        await syncIssueRels(tx, ws, issue);
        await audit(tx, ws, issue.id, "created", ctx.actorId, "Issue created manually", null, null, "open");
        await tx.run("MERGE (k:Idem {ws: $ws, key: $key}) WITH k MATCH (i:Issue {ws: $ws, id: $id}) MERGE (k)-[:RESULT]->(i)", { ws, key: `create:${idempotencyKey}`, id: issue.id });
        return issue;
      });
      return { issue: record, replayed };
    });
  },
  async listIssues(ctx, filter) {
    return read(async (tx) => {
      const all = (await issuesWithCauses(tx, ctx.workspaceId)).filter(({ issue, cause }) => matches(issue, cause, filter)).map((x) => x.issue);
      const start = filter.cursor ? Math.max(0, Number(filter.cursor)) : 0;
      const items = all.slice(start, start + filter.limit);
      const page: IssuePage = { items, nextCursor: start + filter.limit < all.length ? String(start + filter.limit) : null, total: all.length };
      return page;
    });
  },
  async getIssue(ctx, { issueId }) {
    return read(async (tx) => issueDetail(tx, ctx.workspaceId, await getIssueNode(tx, ctx.workspaceId, issueId)));
  },
  async updateIssue(ctx, { issueId, update }) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      const issue = await getIssueNode(tx, ws, issueId);
      if (issue.version !== update.expectedVersion) throw new DomainError("STALE_VERSION", "Issue was modified by someone else; reload and retry.", { currentVersion: issue.version, expectedVersion: update.expectedVersion });
      const { expectedVersion: _v, ...fields } = update;
      await assertRefs(tx, ws, fields);
      const changed = Object.keys(fields).filter((k) => fields[k as keyof typeof fields] !== undefined);
      const next: Issue = { ...issue, ...Object.fromEntries(changed.map((k) => [k, fields[k as keyof typeof fields]])), version: issue.version + 1, updatedAt: now() };
      await setIssueProps(tx, ws, next);
      await syncIssueRels(tx, ws, next);
      await audit(tx, ws, issueId, "updated", ctx.actorId, `Updated ${changed.join(", ") || "nothing"}`);
      return next;
    });
  },
  async addIssueComment(ctx, { issueId, comment }) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      await getIssueNode(tx, ws, issueId);
      const { record } = await idempotent(tx, ws, `comment:${issueId}:${comment.idempotencyKey}`, comment, async () => {
        const r = await tx.run("MATCH (k:Idem {ws: $ws, key: $key}) MATCH (c:Comment {ws: $ws, id: k.resultId}) RETURN c", { ws, key: `comment:${issueId}:${comment.idempotencyKey}` });
        return r.records[0] ? toComment(props(r.records[0].get("c"))) : null;
      }, async () => {
        await assertRefs(tx, ws, { evidenceIds: comment.evidenceIds });
        const evidenceIds = [...comment.evidenceIds];
        for (const ev of comment.newEvidence) evidenceIds.push(await addEvidence(tx, ws, newId("EVID"), ev.sourceName, ev.locator, ev.text, "manual"));
        const c: IssueComment = { id: newId("CMT"), issueId, body: comment.body, evidenceIds, authorId: ctx.actorId, createdAt: now() };
        await tx.run("MATCH (i:Issue {ws: $ws, id: $issueId}) CREATE (c:Comment {ws: $ws})-[:ON]->(i) SET c += $p", { ws, issueId, p: c });
        await audit(tx, ws, issueId, "commented", ctx.actorId, "Comment added", c.id);
        return c;
      });
      return record;
    });
  },
  async recordCauseAssessment(ctx, { issueId, assessment }) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      const issue = await getIssueNode(tx, ws, issueId);
      const { record } = await idempotent(tx, ws, `cause:${issueId}:${assessment.idempotencyKey}`, assessment, async () => {
        const r = await tx.run("MATCH (k:Idem {ws: $ws, key: $key}) MATCH (c:Cause {ws: $ws, id: k.resultId}) RETURN c", { ws, key: `cause:${issueId}:${assessment.idempotencyKey}` });
        return r.records[0] ? toCause(props(r.records[0].get("c"))) : null;
      }, async () => {
        await assertRefs(tx, ws, { evidenceIds: assessment.evidenceIds, assignedTeamId: assessment.responsibleTeamId, detectionStationId: assessment.causalStationId, processStepId: assessment.causalProcessStepId, linkedSupplierIds: assessment.responsibleSupplierId ? [assessment.responsibleSupplierId] : [] });
        if (assessment.supersedesId) {
          const s = await tx.run("MATCH (c:Cause {ws: $ws, id: $id, issueId: $issueId}) RETURN c", { ws, id: assessment.supersedesId, issueId });
          if (!s.records[0]) throw new DomainError("INVALID_REFERENCE", "supersedesId does not belong to this issue.");
        }
        await tx.run("MATCH (c:Cause {ws: $ws, issueId: $issueId}) SET c.isCurrent = false", { ws, issueId });
        const { idempotencyKey: _k, ...rest } = assessment;
        const c: CauseAssessment = { ...rest, id: newId("CAUSE"), issueId, assessedBy: ctx.actorId, assessedAt: now(), isCurrent: true };
        await tx.run(
          `MATCH (i:Issue {ws: $ws, id: $issueId}) CREATE (c:Cause {ws: $ws})-[:ASSESSES]->(i) SET c += $p
           WITH c
           FOREACH (_ IN CASE WHEN $team IS NULL THEN [] ELSE [1] END | MERGE (t:Team {ws: $ws, id: $team}) MERGE (c)-[:RESPONSIBLE_TEAM]->(t))
           FOREACH (_ IN CASE WHEN $sup IS NULL THEN [] ELSE [1] END | MERGE (s:Supplier {ws: $ws, id: $sup}) MERGE (c)-[:RESPONSIBLE_SUPPLIER]->(s))
           FOREACH (_ IN CASE WHEN $station IS NULL THEN [] ELSE [1] END | MERGE (s:Station {ws: $ws, id: $station}) MERGE (c)-[:CAUSAL_STATION]->(s))
           FOREACH (_ IN CASE WHEN $step IS NULL THEN [] ELSE [1] END | MERGE (p:ProcessStep {ws: $ws, id: $step}) MERGE (c)-[:CAUSAL_STEP]->(p))
           FOREACH (_ IN CASE WHEN $supersedes IS NULL THEN [] ELSE [1] END | MERGE (o:Cause {ws: $ws, id: $supersedes}) MERGE (c)-[:SUPERSEDES]->(o))
           FOREACH (vid IN $evidenceIds | MERGE (v:Evidence {ws: $ws, id: vid}) MERGE (c)-[:HAS_EVIDENCE]->(v))`,
          { ws, issueId, p: c, team: c.responsibleTeamId, sup: c.responsibleSupplierId, station: c.causalStationId, step: c.causalProcessStepId, supersedes: c.supersedesId, evidenceIds: c.evidenceIds },
        );
        const next: Issue = { ...issue, confirmedCauseId: c.state === "confirmed" ? c.id : null, version: issue.version + 1, updatedAt: now() };
        await setIssueProps(tx, ws, next);
        await audit(tx, ws, issueId, "cause_recorded", ctx.actorId, `${c.state} cause ${c.causeType}`, c.id);
        return c;
      });
      return record;
    });
  },
  async createFixRevision(ctx, { issueId, fix }) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      const issue = await getIssueNode(tx, ws, issueId);
      const { record } = await idempotent(tx, ws, `fix:${issueId}:${fix.idempotencyKey}`, fix, async () => {
        const r = await tx.run("MATCH (k:Idem {ws: $ws, key: $key}) MATCH (f:Fix {ws: $ws, id: k.resultId}) RETURN f", { ws, key: `fix:${issueId}:${fix.idempotencyKey}` });
        return r.records[0] ? toFix(props(r.records[0].get("f"))) : null;
      }, async () => {
        await assertRefs(tx, ws, { evidenceIds: fix.evidenceIds, processStepId: fix.applicability.processStepId });
        if (fix.sourceFixRevisionId && (await exists(tx, "Fix", ws, [fix.sourceFixRevisionId])).length) throw new DomainError("INVALID_REFERENCE", "sourceFixRevisionId does not exist.");
        const count = await tx.run("MATCH (f:Fix {ws: $ws, issueId: $issueId}) RETURN count(f) AS c", { ws, issueId });
        const version = num(count.records[0]?.get("c")) + 1;
        const { idempotencyKey: _k, ...rest } = fix;
        const f: FixRevision = { ...rest, id: newId("FIX"), issueId, version, state: "proposed", createdBy: ctx.actorId, createdAt: now(), appliedAt: null };
        await tx.run(
          `MATCH (i:Issue {ws: $ws, id: $issueId}) CREATE (f:Fix {ws: $ws})-[:FIXES]->(i) SET f += $p
           WITH f
           FOREACH (_ IN CASE WHEN $source IS NULL THEN [] ELSE [1] END | MERGE (s:Fix {ws: $ws, id: $source}) MERGE (f)-[:DERIVED_FROM]->(s))
           FOREACH (vid IN $evidenceIds | MERGE (v:Evidence {ws: $ws, id: vid}) MERGE (f)-[:HAS_EVIDENCE]->(v))`,
          { ws, issueId, p: { id: f.id, issueId, version: neo4j.int(version), summary: f.summary, stepsJson: JSON.stringify(f.steps), applicabilityJson: JSON.stringify(f.applicability), sourceFixRevisionId: f.sourceFixRevisionId, workInstructionRef: f.workInstructionRef, evidenceIds: f.evidenceIds, state: f.state, createdBy: f.createdBy, createdAt: f.createdAt, appliedAt: null }, source: f.sourceFixRevisionId, evidenceIds: f.evidenceIds },
        );
        await setIssueProps(tx, ws, { ...issue, currentFixRevisionId: f.id, version: issue.version + 1, updatedAt: now() });
        await audit(tx, ws, issueId, "fix_created", ctx.actorId, f.sourceFixRevisionId ? `Fix v${version} proposed from ${f.sourceFixRevisionId}` : `Fix v${version} proposed`, f.id);
        return f;
      });
      return record;
    });
  },
  async recordVerification(ctx, { issueId, verification }) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      const issue = await getIssueNode(tx, ws, issueId);
      const { record } = await idempotent(tx, ws, `verify:${issueId}:${verification.idempotencyKey}`, verification, async () => {
        const r = await tx.run("MATCH (k:Idem {ws: $ws, key: $key}) MATCH (v:Verification {ws: $ws, id: k.resultId}) RETURN v", { ws, key: `verify:${issueId}:${verification.idempotencyKey}` });
        return r.records[0] ? toVerification(props(r.records[0].get("v"))) : null;
      }, async () => {
        const fr = await tx.run("MATCH (f:Fix {ws: $ws, id: $id, issueId: $issueId}) RETURN f", { ws, id: verification.fixRevisionId, issueId });
        if (!fr.records[0]) throw new DomainError("INVALID_REFERENCE", "fixRevisionId does not belong to this issue.");
        await assertRefs(tx, ws, { evidenceIds: verification.evidenceIds });
        const evidenceIds = [...verification.evidenceIds];
        for (const ev of verification.newEvidence) evidenceIds.push(await addEvidence(tx, ws, newId("EVID"), ev.sourceName, ev.locator, ev.text, "manual"));
        const { idempotencyKey: _k, newEvidence: _n, ...rest } = verification;
        const v = { ...rest, evidenceIds, id: newId("VERIFY"), issueId, verifiedBy: ctx.actorId, verifiedAt: now() };
        await tx.run(
          `MATCH (f:Fix {ws: $ws, id: $fixId}) MATCH (i:Issue {ws: $ws, id: $issueId})
           CREATE (v:Verification {ws: $ws})-[:VERIFIES]->(f) CREATE (v)-[:OF_ISSUE]->(i) SET v += $p
           SET f.appliedAt = coalesce(f.appliedAt, $at), f.state = CASE WHEN $outcome = 'pass' THEN 'verified' ELSE 'applied' END
           WITH v FOREACH (vid IN $evidenceIds | MERGE (e:Evidence {ws: $ws, id: vid}) MERGE (v)-[:HAS_EVIDENCE]->(e))`,
          { ws, fixId: v.fixRevisionId, issueId, p: v, at: now(), outcome: v.outcome, evidenceIds },
        );
        let status = issue.status;
        if (v.outcome === "fail" && issue.status === "pending_verification") {
          await audit(tx, ws, issueId, "transition", ctx.actorId, "Verification failed; back to work", v.id, "pending_verification", "in_progress");
          status = "in_progress";
        }
        await setIssueProps(tx, ws, { ...issue, status, version: issue.version + 1, updatedAt: now() });
        await audit(tx, ws, issueId, "verification_recorded", ctx.actorId, `Verification ${v.outcome} for ${v.fixRevisionId}`, v.id);
        return v;
      });
      return record;
    });
  },
  async transitionIssue(ctx, { issueId, command }) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      const issue = await getIssueNode(tx, ws, issueId);
      const { record } = await idempotent(tx, ws, `transition:${issueId}:${command.idempotencyKey}`, command, async () => getIssueNode(tx, ws, issueId), async () => {
        if (issue.version !== command.expectedVersion) throw new DomainError("STALE_VERSION", "Issue was modified; reload and retry.", { currentVersion: issue.version, expectedVersion: command.expectedVersion });
        const rule = TRANSITIONS[command.action];
        if (!rule.from.includes(issue.status)) throw new DomainError("INVALID_TRANSITION", `Cannot ${command.action} an issue in status ${issue.status}.`, { from: issue.status, allowedFrom: rule.from });
        let currentFixRevisionId = issue.currentFixRevisionId;
        if (command.action === "close") {
          if (!command.fixRevisionId) throw new DomainError("VERIFICATION_REQUIRED", "Closing requires the applied fix revision id and its passed verification.");
          const fr = await tx.run("MATCH (f:Fix {ws: $ws, id: $id, issueId: $issueId}) OPTIONAL MATCH (f)<-[:VERIFIES]-(v:Verification) WITH f, v ORDER BY v.verifiedAt DESC, v.id DESC RETURN f, collect(v)[0] AS latest", { ws, id: command.fixRevisionId, issueId });
          const rec = fr.records[0];
          if (!rec) throw new DomainError("INVALID_REFERENCE", "fixRevisionId does not belong to this issue.");
          const latest = rec.get("latest") ? props(rec.get("latest")) : null;
          if (!latest || latest.outcome !== "pass") throw new DomainError("VERIFICATION_REQUIRED", "A passed verification for this fix revision is required before closure.", { fixRevisionId: command.fixRevisionId, latestOutcome: latest?.outcome ?? null });
          currentFixRevisionId = command.fixRevisionId;
        }
        if (command.action === "request_verification" && command.fixRevisionId) {
          const fr = await tx.run("MATCH (f:Fix {ws: $ws, id: $id, issueId: $issueId}) SET f.state = CASE WHEN f.state = 'proposed' THEN 'applied' ELSE f.state END, f.appliedAt = coalesce(f.appliedAt, $at) RETURN f", { ws, id: command.fixRevisionId, issueId, at: now() });
          if (!fr.records[0]) throw new DomainError("INVALID_REFERENCE", "fixRevisionId does not belong to this issue.");
          currentFixRevisionId = command.fixRevisionId;
          await audit(tx, ws, issueId, "fix_applied", ctx.actorId, `Fix ${command.fixRevisionId} applied`, command.fixRevisionId);
        }
        const next: Issue = { ...issue, status: rule.to, currentFixRevisionId, version: issue.version + 1, updatedAt: now() };
        await setIssueProps(tx, ws, next);
        await audit(tx, ws, issueId, "transition", ctx.actorId, command.reason || command.action, command.fixRevisionId, issue.status, rule.to);
        return next;
      });
      return record;
    });
  },
  async findSimilarResolutions(ctx, { issueId }) {
    const ws = ctx.workspaceId;
    return read(async (tx) => {
      const issue = await getIssueNode(tx, ws, issueId);
      const cause = await currentConfirmedCause(tx, ws, issueId);
      const marked = await tx.run("MATCH (i:Issue {ws: $ws, id: $id})-[:AFFECTS]->(e:Entity) RETURN e.partNumber AS pn, e.partRevision AS rev", { ws, id: issueId });
      const markedParts = new Map<string, string | null>();
      for (const r of marked.records) markedParts.set(String(r.get("pn")), str(r.get("rev")));
      // Graph retrieval: verified fixes reachable from other issues through their passed verifications and confirmed causes.
      const cands = await tx.run(
        `MATCH (src:Issue {ws: $ws})<-[:FIXES]-(f:Fix {state: 'verified'})<-[:VERIFIES]-(v:Verification {outcome: 'pass'})
         WHERE src.id <> $id
         OPTIONAL MATCH (src)<-[:ASSESSES]-(c:Cause {isCurrent: true, state: 'confirmed'})
         WITH src, f, c, v ORDER BY v.verifiedAt DESC
         RETURN src, f, c, collect(v)[0] AS v`,
        { ws, id: issueId },
      );
      const results: SimilarResolution[] = [];
      for (const rec of cands.records) {
        const src = toIssue(props(rec.get("src")));
        const fix = toFix(props(rec.get("f")));
        const srcCause = rec.get("c") ? toCause(props(rec.get("c"))) : null;
        const ver = toVerification(props(rec.get("v")));
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
          const issueRev = issue.partNumber === fixPart ? issue.partRevision : (markedParts.get(fixPart) ?? null);
          if (fix.applicability.partRevision && issueRev && fix.applicability.partRevision !== issueRev) warnings.push(`part revision differs (${issueRev} vs ${fix.applicability.partRevision}): engineering review required`);
          if (!issueRev) warnings.push("part revision unknown on this issue: applicability unconfirmed");
        }
        if (cause && srcCause && cause.causeType === srcCause.causeType) {
          reasons.push(`same confirmed cause type ${cause.causeType}`);
          score += 1;
        }
        const stepId = fix.applicability.processStepId ?? src.processStepId;
        if (stepId && (issue.processStepId === stepId || cause?.causalProcessStepId === stepId)) {
          reasons.push(`same process step ${stepId}`);
          score += 1;
        }
        if (score < 2) continue;
        for (const l of fix.applicability.limitations) warnings.push(`limitation: ${l}`);
        results.push({ sourceIssueId: src.id, sourceIssueTitle: src.title, sourceFixRevisionId: fix.id, fixSummary: fix.summary, matchReasons: reasons, applicabilityWarnings: warnings, verificationId: ver.id, verifiedAt: ver.verifiedAt, evidenceIds: [...new Set([...fix.evidenceIds, ...ver.evidenceIds])], rank: score });
      }
      results.sort((a, b) => b.rank - a.rank || a.verifiedAt.localeCompare(b.verifiedAt));
      const out: SimilarResolutions = { issueId, results, queryExplanation: "Graph retrieval: Issue<-FIXES-Fix{verified}<-VERIFIES-Verification{pass} joined with the current confirmed Cause; scored on defect code (+3), part family incl. marked entities (+2), confirmed cause type (+1), process step (+1). Shared supplier/team is never a reason." };
      return out;
    });
  },
  async getInsights(ctx, filter) {
    const ws = ctx.workspaceId;
    return read(async (tx) => {
      const catalog = await catalogQuery(tx, ws);
      const all = (await issuesWithCauses(tx, ws)).filter(({ issue, cause }) => matches(issue, cause, filter));
      const ids = (list: Array<{ issue: Issue }>) => list.map((x) => x.issue.id).sort();
      const teams: TeamInsight[] = catalog.teams.map((t) => {
        const reported = all.filter((x) => x.issue.reportingTeamId === t.id);
        const assignedOpen = all.filter((x) => x.issue.assignedTeamId === t.id && x.issue.status !== "closed");
        const confirmed = all.filter((x) => x.cause?.responsibleTeamId === t.id);
        return { teamId: t.id, teamName: t.name, reportedIssueCount: reported.length, assignedOpenCount: assignedOpen.length, confirmedCauseIssueCount: confirmed.length, reportedIssueIds: ids(reported), assignedOpenIssueIds: ids(assignedOpen), confirmedCauseIssueIds: ids(confirmed) };
      });
      const cohorts = await tx.run("MATCH (c:Cohort {ws: $ws}) RETURN c.supplierId AS supplierId, c.inspectedUnitIds AS units, c.complete AS complete", { ws });
      const cohortBy = new Map(cohorts.records.map((r) => [String(r.get("supplierId")), { units: new Set(arr(r.get("units"))), complete: Boolean(r.get("complete")) }]));
      const suppliers: SupplierInsight[] = catalog.suppliers.map((s) => {
        const linked = all.filter((x) => x.issue.linkedSupplierIds.includes(s.id));
        const confirmed = all.filter((x) => x.cause?.responsibleSupplierId === s.id);
        const affected = new Set(confirmed.flatMap((x) => x.issue.entityIds));
        const cohort = cohortBy.get(s.id);
        const affectedInspected = cohort ? [...affected].filter((u) => cohort.units.has(u)).length : affected.size;
        const rate = cohort && cohort.complete && cohort.units.size > 0 ? affectedInspected / cohort.units.size : null;
        return { supplierId: s.id, supplierName: s.name, linkedIssueCount: linked.length, confirmedIssueCount: confirmed.length, distinctAffectedUnitCount: affected.size, inspectedUnitCount: cohort ? cohort.units.size : null, cohortComplete: cohort?.complete ?? false, affectedUnitRate: rate, linkedIssueIds: ids(linked), confirmedIssueIds: ids(confirmed) };
      });
      const bucket = (label: (x: { issue: Issue; cause: CauseAssessment | null }) => { id: string; label: string } | null) => {
        const m = new Map<string, { id: string; label: string; issueIds: string[] }>();
        for (const x of all) {
          const b = label(x);
          if (!b) continue;
          const cur = m.get(b.id) ?? { ...b, issueIds: [] };
          cur.issueIds.push(x.issue.id);
          m.set(b.id, cur);
        }
        return [...m.values()].map((b) => ({ id: b.id, label: b.label, issueCount: b.issueIds.length, issueIds: b.issueIds.sort() })).sort((a, b) => b.issueCount - a.issueCount || a.id.localeCompare(b.id));
      };
      const name = (list: Array<{ id: string; name: string }>, id: string) => list.find((x) => x.id === id)?.name ?? id;
      const reopened = await tx.run("MATCH (a:Audit {ws: $ws, kind: 'transition', fromStatus: 'closed'}) RETURN DISTINCT a.issueId AS id", { ws });
      const reopenedIds = new Set(reopened.records.map((r) => String(r.get("id"))));
      const reused = await tx.run("MATCH (f:Fix {ws: $ws})-[:DERIVED_FROM]->(:Fix) RETURN f.issueId AS issueId", { ws });
      const inScope = new Set(all.map((x) => x.issue.id));
      const insights: Insights = {
        contractVersion: CONTRACT_VERSION, filter, totalIssueCount: all.length, openIssueCount: all.filter((x) => x.issue.status !== "closed").length, teams, suppliers,
        detectionStations: bucket((x) => (x.issue.detectionStationId ? { id: x.issue.detectionStationId, label: name(catalog.stations, x.issue.detectionStationId) } : null)),
        causalProcessSteps: bucket((x) => {
          const id = x.cause?.causalProcessStepId ?? x.cause?.causalStationId ?? null;
          return id ? { id, label: name([...catalog.processSteps, ...catalog.stations], id) } : null;
        }),
        causeTypes: bucket((x) => (x.cause ? { id: x.cause.causeType, label: x.cause.causeType } : null)),
        defectFamilies: bucket((x) => {
          if (!x.issue.defectCode) return null;
          const fam = catalog.defectCodes.find((d) => d.id === x.issue.defectCode)?.family ?? x.issue.defectCode;
          return { id: slug(fam), label: fam };
        }),
        reusedFixCount: reused.records.filter((r) => inScope.has(String(r.get("issueId")))).length,
        reopenedIssueCount: all.filter((x) => reopenedIds.has(x.issue.id)).length,
        notes: [
          "Counts are distinct issue ids unless labeled as units; cards overlap and are not additive blame scores.",
          "Detection location is not causal location. Linked suppliers are not confirmed faults.",
          "A null rate means the inspection cohort is unknown or incomplete (display N/A).",
        ],
      };
      return insights;
    });
  },
};

// ---------------------------------------------------------------------------
// Trace services
// ---------------------------------------------------------------------------

async function resolveRevision(tx: Tx, ws: string, revisionId: string): Promise<{ revisionId: string; dataHash: string }> {
  const r = revisionId === CURRENT_REVISION_ALIAS
    ? await tx.run("MATCH (r:Revision {ws: $ws}) RETURN r ORDER BY r.sequence DESC LIMIT 1", { ws })
    : await tx.run("MATCH (r:Revision {ws: $ws, id: $id}) RETURN r", { ws, id: revisionId });
  const rec = r.records[0];
  if (!rec) throw new DomainError("NOT_FOUND", `Revision ${revisionId} does not exist.`);
  const p = props(rec.get("r"));
  return { revisionId: String(p.id), dataHash: String(p.dataHash) };
}

async function buildTrace(tx: Tx, ws: string, rev: { revisionId: string; dataHash: string }, request: TraceRequest, runId: string): Promise<TraceResult> {
  const root = request.root;
  const asOf = request.scope.configurationAsOf;
  const rootQuery =
    root.kind === "supplier_batch"
      ? "MATCH (lot:SupplierLot {ws: $ws, id: $rootId})<-[:FROM_SUPPLIER_LOT]-(o:Origin)<-[:HAS_ORIGIN]-(c:Entity) RETURN c, o"
      : root.kind === "manufacturing_lot"
        ? "MATCH (lot:MfgLot {ws: $ws, id: $rootId})<-[:PRODUCED_IN]-(o:Origin)<-[:HAS_ORIGIN]-(c:Entity) RETURN c, o"
        : "MATCH (c:Entity {ws: $ws, id: $rootId}) OPTIONAL MATCH (c)-[:HAS_ORIGIN]->(o:Origin) RETURN c, o";
  const suspects = (await tx.run(rootQuery, { ws, rootId: root.id })).records.map((r) => toEntity(props(r.get("c")), r.get("o") ? props(r.get("o")) : null));
  if (suspects.length === 0) throw new DomainError("NOT_FOUND", `Root ${root.kind} ${root.id} is not in the accepted revision.`);
  const rowsById = new Map<string, TraceRow>();
  const paths: TracePath[] = [];
  const evidenceIds = new Set<string>();
  const currentVehicles = new Set<string>();
  const historicalVehicles = new Set<string>();
  const issues: ReviewIssue[] = [];
  let loose = 0;
  let quarantined = 0;
  const shipments = new Map<string, { id: string; customerId: string }>();
  const ship = await tx.run("MATCH (v:Entity {ws: $ws, kind: 'vehicle'})-[s:SHIPPED_TO]->(c:Customer) RETURN v.id AS vid, s.id AS sid, c.id AS cid", { ws });
  for (const r of ship.records) shipments.set(String(r.get("vid")), { id: String(r.get("sid")), customerId: String(r.get("cid")) });
  const rowFor = (e: EntityRecord, current: boolean, historical: boolean): TraceRow => {
    const sh = e.kind === "vehicle" ? shipments.get(e.id) : undefined;
    const existing = rowsById.get(e.id);
    if (existing) {
      existing.currentContainment = existing.currentContainment || current;
      existing.historicalContainment = existing.historicalContainment || historical || current;
      return existing;
    }
    const row: TraceRow = {
      entityId: e.id, entityKind: e.kind, partNumber: e.partNumber, serialNumber: e.serialNumber, buildId: e.vehicle?.buildId ?? null, vin: e.vehicle?.vin ?? null,
      locationState: e.locationState, customerId: sh?.customerId ?? null, shipmentLineIds: sh ? [sh.id] : [], currentContainment: current, historicalContainment: historical || current,
      hasUnresolvedEvidence: e.origin === null && e.kind === "component", engineeringReview: e.locationState === "quarantine" ? "reviewed" : "not_recorded",
      evidenceIds: [...(e.origin?.evidenceIds ?? []), ...(sh ? [`EVID-${sh.id}`] : [])], issueIds: [],
    };
    rowsById.set(e.id, row);
    return row;
  };
  for (const c of suspects) {
    const kind = c.origin?.sourcingType === "in_house" ? "LOT_PRODUCED_COMPONENT" : "BATCH_HAS_COMPONENT";
    if (root.kind !== "component_serial") paths.push({ relationshipId: `${kind}-${root.id}-${c.id}`, fromId: root.id, toId: c.id, kind, validFrom: null, validTo: null, evidenceIds: c.origin?.evidenceIds ?? [] });
    c.origin?.evidenceIds.forEach((x) => evidenceIds.add(x));
    // Current containment: every hop active at configurationAsOf.
    const cur = await tx.run(
      `MATCH p = (c:Entity {ws: $ws, id: $id})-[:INSTALLED_IN*1..6]->(v:Entity {ws: $ws, kind: 'vehicle'})
       WHERE all(r IN relationships(p) WHERE ${activeCypher(asOf)})
       RETURN [n IN nodes(p) | n.id] AS ids, [r IN relationships(p) | r] AS rels LIMIT 1`,
      { ws, id: c.id },
    );
    // Historical containment: every hop overlaps [historyFrom, configurationAsOf].
    const hist = await tx.run(
      `MATCH p = (c:Entity {ws: $ws, id: $id})-[:INSTALLED_IN*1..6]->(v:Entity {ws: $ws, kind: 'vehicle'})
       WHERE all(r IN relationships(p) WHERE r.installedAt <= $asOf AND (r.removedAt IS NULL OR r.removedAt > $from))
       RETURN DISTINCT v.id AS vid`,
      { ws, id: c.id, asOf, from: request.scope.historyFrom },
    );
    const currentRow = cur.records[0];
    const histVehicles = hist.records.map((r) => String(r.get("vid")));
    if (currentRow) {
      const idsOnPath = (currentRow.get("ids") as string[]);
      const rels = currentRow.get("rels") as unknown[];
      rowFor(c, true, true);
      for (let i = 0; i < rels.length; i += 1) {
        const rp = props(rels[i]);
        const from = idsOnPath[i]!;
        const to = idsOnPath[i + 1]!;
        paths.push({ relationshipId: String(rp.id), fromId: from, toId: to, kind: "INSTALLED_IN", validFrom: str(rp.installedAt), validTo: str(rp.removedAt), evidenceIds: arr(rp.evidenceIds) });
        arr(rp.evidenceIds).forEach((x) => evidenceIds.add(x));
        const e = await loadEntity(tx, ws, to);
        if (e) rowFor(e, true, true);
      }
      currentVehicles.add(idsOnPath[idsOnPath.length - 1]!);
    } else {
      rowFor(c, false, histVehicles.length > 0);
      if (c.locationState === "quarantine") quarantined += 1;
      else if (c.locationState === "onsite") loose += 1;
    }
    for (const vid of histVehicles) {
      historicalVehicles.add(vid);
      if (!currentVehicles.has(vid)) {
        const e = await loadEntity(tx, ws, vid);
        if (e) {
          rowFor(e, false, true);
          issues.push({ id: `ISSUE-REVIEW-PENDING-${vid}`, code: REVIEW_ISSUE_CODES.ENGINEERING_REVIEW_PENDING, severity: "warning", message: `${vid} historically contained ${c.id}; removal is not engineering clearance.`, entityIds: [vid], evidenceIds: [] });
        }
      }
    }
    if (c.origin === null) issues.push({ id: `ISSUE-UNKNOWN-ORIGIN-${c.id}`, code: REVIEW_ISSUE_CODES.UNKNOWN_ORIGIN, severity: "warning", message: `${c.id} has no recorded origin.`, entityIds: [c.id], evidenceIds: [] });
  }
  const vehicles = [...currentVehicles].map((id) => rowsById.get(id)).filter((r): r is TraceRow => Boolean(r));
  const historicalOnly = [...historicalVehicles].filter((v) => !currentVehicles.has(v));
  for (const row of rowsById.values()) row.engineeringReview = historicalOnly.includes(row.entityId) ? "pending" : row.engineeringReview;
  const customers = new Set(vehicles.map((v) => v.customerId).filter((x): x is string => Boolean(x)));
  const ev = await tx.run("UNWIND $ids AS id MATCH (v:Evidence {ws: $ws, id: id}) RETURN v", { ws, ids: [...evidenceIds] });
  const custNames = await tx.run("UNWIND $ids AS id MATCH (c:Customer {ws: $ws, id: id}) RETURN c.id AS id, c.name AS name", { ws, ids: [...customers] });
  const counts: TraceCounts = {
    currentOnsiteVehicleCount: vehicles.filter((v) => v.locationState !== "shipped").length,
    currentShippedVehicleCount: vehicles.filter((v) => v.locationState === "shipped").length,
    currentCustomerCount: customers.size,
    looseCandidateComponentCount: loose,
    quarantinedComponentCount: quarantined,
    historicalOnlyVehicleCount: historicalOnly.length,
    unresolvedOnlyVehicleCount: 0,
  };
  return {
    contractVersion: CONTRACT_VERSION, runId, revisionId: rev.revisionId, root: { ...root }, createdAt: now(), engineVersion: "neo4j-graph-1", dataHash: rev.dataHash, scope: { ...request.scope, limitations: [...request.scope.limitations] },
    executionStatus: "completed", dataCompleteness: issues.some((i) => i.code === REVIEW_ISSUE_CODES.UNKNOWN_ORIGIN) ? "gaps_found" : "reviewed_scope",
    counts, rows: [...rowsById.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)), issues, evidence: ev.records.map((r) => toEvidence(props(r.get("v")))), paths,
    customers: custNames.records.map((r) => ({ id: String(r.get("id")), name: String(r.get("name") ?? r.get("id")) })).sort((a, b) => a.id.localeCompare(b.id)),
    ...(request.incidentId ? { incidentId: request.incidentId } : {}),
  };
}

const traceServices: TraceServices = {
  async previewImport(ctx, input) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      const expected = Object.values(IMPORT_FILE_NAMES);
      const received = input.files.map((f) => f.name);
      const missing = expected.filter((n) => !received.includes(n));
      const sourceHashes = input.files.map((f) => sha256(f.text));
      if (input.baseRevisionId) await resolveRevision(tx, ws, input.baseRevisionId);
      const issues: ReviewIssue[] = missing.map((name) => ({ id: `ISSUE-COVERAGE-${name}`, code: REVIEW_ISSUE_CODES.COVERAGE_GAP, severity: name === IMPORT_FILE_NAMES.entities || name === IMPORT_FILE_NAMES.installations ? "blocking" : "warning", message: `${name} was expected but not received.`, entityIds: [], evidenceIds: [] }));
      issues.push({ id: "ISSUE-IMPORT-NOT-APPLIED", code: REVIEW_ISSUE_CODES.SCHEMA_ERROR, severity: "warning", message: "Graph mode records the import as a revision marker only; the EV seed is loaded by scripts/neo4j/seed-ev.mts. Row-level CSV ingestion is not implemented in this build.", entityIds: [], evidenceIds: [] });
      const preview: ImportPreview = { previewId: newId("PREVIEW"), baseRevisionId: input.baseRevisionId ?? null, canAccept: !issues.some((i) => i.severity === "blocking"), issues, sourceHashes, coverage: { expected, received, missing } };
      await tx.run("CREATE (p:Preview {ws: $ws, id: $id, json: $json, consumed: false, baseRevisionId: $base, canAccept: $canAccept, sourceHashes: $hashes})", { ws, id: preview.previewId, json: JSON.stringify(preview), base: preview.baseRevisionId, canAccept: preview.canAccept, hashes: sourceHashes });
      return preview;
    });
  },
  async previewLateEvidence(ctx, { baseRevisionId }) {
    return write(async (tx) => {
      await resolveRevision(tx, ctx.workspaceId, baseRevisionId);
      throw new DomainError("PREVIEW_REJECTED", "No prepared late-evidence correction exists for the EV seed in graph mode.");
    });
  },
  async acceptImport(ctx, { previewId, expectedBaseRevisionId }) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      const r = await tx.run("MATCH (p:Preview {ws: $ws, id: $id}) RETURN p", { ws, id: previewId });
      const rec = r.records[0];
      if (!rec) throw new DomainError("NOT_FOUND", `Preview ${previewId} does not exist.`);
      const p = props(rec.get("p"));
      if (p.consumed) throw new DomainError("DUPLICATE_ACTION", `Preview ${previewId} was already accepted.`);
      if (!p.canAccept) throw new DomainError("PREVIEW_REJECTED", "Preview has blocking issues.");
      const latest = await tx.run("MATCH (r:Revision {ws: $ws}) RETURN r ORDER BY r.sequence DESC LIMIT 1", { ws });
      const latestId = latest.records[0] ? String(props(latest.records[0].get("r")).id) : null;
      const base = str(p.baseRevisionId);
      if (base !== null) {
        if (expectedBaseRevisionId !== base || latestId !== base) throw new DomainError("REVISION_MISMATCH", "Expected base revision does not match the current accepted revision.", { expected: expectedBaseRevisionId ?? null, current: latestId });
      } else if (expectedBaseRevisionId !== undefined) throw new DomainError("REVISION_MISMATCH", "This preview has no base revision.");
      const seq = await tx.run("MATCH (r:Revision {ws: $ws}) RETURN count(r) AS c", { ws });
      const info: RevisionInfo = { contractVersion: CONTRACT_VERSION, revisionId: newId("REV"), acceptedAt: now(), dataHash: sha256(arr(p.sourceHashes).join("|")) };
      await tx.run("MATCH (p:Preview {ws: $ws, id: $pid}) SET p.consumed = true CREATE (r:Revision {ws: $ws, id: $id, acceptedAt: $at, dataHash: $hash, sequence: $seq, source: 'import'})", { ws, pid: previewId, id: info.revisionId, at: info.acceptedAt, hash: info.dataHash, seq: num(seq.records[0]?.get("c")) + 1 });
      return info;
    });
  },
  async runTrace(ctx, request) {
    const ws = ctx.workspaceId;
    return write(async (tx) => {
      const rev = await resolveRevision(tx, ws, request.revisionId);
      const siteOk = await tx.run("MATCH (s:Site {ws: $ws, id: $id}) RETURN s", { ws, id: request.scope.siteId });
      if (!siteOk.records[0]) throw new DomainError("SCOPE_INVALID", `Site ${request.scope.siteId} is outside the accepted revision's coverage.`);
      const run = await buildTrace(tx, ws, rev, request, newId("RUN"));
      await tx.run("CREATE (t:TraceRun {ws: $ws, id: $id, revisionId: $rev, rootKind: $rk, rootId: $rid, createdAt: $at, json: $json})", { ws, id: run.runId, rev: run.revisionId, rk: run.root.kind, rid: run.root.id, at: run.createdAt, json: JSON.stringify(run) });
      return run;
    });
  },
  async getTrace(ctx, { runId }) {
    return read(async (tx) => {
      const r = await tx.run("MATCH (t:TraceRun {ws: $ws, id: $id}) RETURN t.json AS json", { ws: ctx.workspaceId, id: runId });
      const rec = r.records[0];
      if (!rec) throw new DomainError("NOT_FOUND", `Run ${runId} does not exist.`);
      return JSON.parse(String(rec.get("json"))) as TraceResult;
    });
  },
  async compareTraces(ctx, { earlierRunId, laterRunId }) {
    const a = await traceServices.getTrace(ctx, { runId: earlierRunId }).catch(() => null);
    const b = await traceServices.getTrace(ctx, { runId: laterRunId }).catch(() => null);
    if (!a || !b) throw new DomainError("NOT_FOUND", "One or both runs do not exist.");
    const reasons: string[] = [];
    if (a.root.kind !== b.root.kind || a.root.id !== b.root.id) reasons.push("Different roots.");
    for (const k of ["siteId", "configurationAsOf", "historyFrom", "trackedPartNumber"] as const) if (a.scope[k] !== b.scope[k]) reasons.push(`Scope changed: ${k}.`);
    if (a.executionStatus !== "completed" || b.executionStatus !== "completed") reasons.push("At least one run is incomplete.");
    const comparable = reasons.length === 0;
    if (comparable) reasons.push(a.revisionId === b.revisionId ? "Same data revision; identical scope and cutoff." : `Data revision changed ${a.revisionId} -> ${b.revisionId}; scope, root and cutoff unchanged.`);
    const cv = (r: TraceResult) => new Set(r.rows.filter((x) => x.entityKind === "vehicle" && x.currentContainment).map((x) => x.entityId));
    const va = cv(a);
    const vb = cv(b);
    const ca = new Set(a.customers.map((c) => c.id));
    const later = new Set(b.issues.map((i) => i.id));
    const delta = comparable ? (Object.fromEntries(Object.keys(a.counts).map((k) => [k, b.counts[k as keyof TraceCounts] - a.counts[k as keyof TraceCounts]])) as TraceComparison["delta"]) : null;
    return { earlierRunId, laterRunId, comparable, reasons, delta, addedCurrentVehicleIds: [...vb].filter((x) => !va.has(x)).sort(), removedCurrentVehicleIds: [...va].filter((x) => !vb.has(x)).sort(), addedCurrentCustomerIds: b.customers.map((c) => c.id).filter((c) => !ca.has(c)).sort(), resolvedIssueIds: a.issues.map((i) => i.id).filter((id) => !later.has(id)) };
  },
};

export const graphServices: DomainServices = { ...issueServices, ...traceServices };
export default graphServices;
export type { RequestContext };
