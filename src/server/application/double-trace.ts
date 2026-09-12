/**
 * Typed in-memory TRACE SERVICES DOUBLE (assembly context). NOT Codey's Neo4j engine.
 *
 * Answers from the legacy robotics regression fixture under docs/reference/assembly (robot ids
 * mapped onto v4 vehicle rows and labelled as regression data) so the import -> trace -> late
 * evidence -> compare routes can be exercised against the frozen DTOs. Quantities come straight
 * from the reference outputs; nothing here traverses a graph.
 */
import { createHash } from "node:crypto";
import { DomainError, type Evidence, type RequestContext, type ReviewIssue } from "@/contracts/common";
import {
  ASSEMBLY_REGRESSION,
  CONTRACT_VERSION,
  IMPORT_FILE_NAMES,
  REVIEW_ISSUE_CODES,
  type ImportInput,
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
import { EV_DEMO } from "@/contracts/issues";
import { buildEvSeed, type EvSeed } from "./ev-seed";
import fixture1 from "../../../docs/reference/assembly/assembly_reference_output/fixture_revision_1.json";
import fixture2 from "../../../docs/reference/assembly/assembly_reference_output/fixture_revision_2.json";
import reference1 from "../../../docs/reference/assembly/assembly_reference_output/trace_revision_1.json";
import reference2 from "../../../docs/reference/assembly/assembly_reference_output/trace_revision_2.json";

type FixtureEntity = { id: string; kind: string; partNumber: string; partRevision: string; serialNumber: string; issuerId: string; batchId: string | null; locationState: string; originEvidenceId?: string | null };
type FixtureInstallation = { id: string; childId: string; parentId: string; slotId: string; installedAt: string; removedAt: string | null; recordedAt: string; evidenceId: string };
type FixtureShipment = { id: string; unitId: string; customerId: string; shippedAt: string; evidenceId: string };
type Fixture = { revisionId: string; batches: Array<{ id: string; supplierId: string; partNumber: string; externalCode: string }>; entities: FixtureEntity[]; installations: FixtureInstallation[]; shipments: FixtureShipment[]; notes: string[] };
type Reference = { dataHash: string; currentRobotIds: string[]; currentShippedRobotIds: string[]; currentCustomerIds: string[]; historicalOnlyRobotIds: string[]; unresolvedOnlyRobotIds: string[]; originGapRobotIds: string[]; noRecordedLinkRobotIds: string[]; looseCandidateComponentIds: string[]; quarantinedComponentIds: string[]; counts: Record<string, number> };

type Key = "revision1" | "revision2";
/** The reference JSON stores batches/entities as id-keyed objects; normalize to arrays with ids. */
function normalize(raw: unknown): Fixture {
  const r = raw as Record<string, unknown>;
  const toArray = <T extends object>(v: unknown): Array<T & { id: string }> =>
    Array.isArray(v) ? (v as Array<T & { id: string }>) : Object.entries((v ?? {}) as Record<string, T>).map(([id, x]) => ({ id, ...x }));
  return {
    revisionId: String(r.revisionId ?? ""),
    batches: toArray(r.batches),
    entities: toArray<FixtureEntity>(r.entities).map((e) => ({ ...e, batchId: e.batchId ?? null, originEvidenceId: e.originEvidenceId ?? null })),
    installations: toArray<FixtureInstallation>(r.installations).map((i) => ({ ...i, removedAt: i.removedAt ?? null })),
    shipments: toArray<FixtureShipment>(r.shipments),
    notes: Array.isArray(r.notes) ? (r.notes as string[]) : [],
  };
}
const FIX: Record<Key, { data: Fixture; ref: Reference }> = {
  revision1: { data: normalize(fixture1), ref: reference1 as unknown as Reference },
  revision2: { data: normalize(fixture2), ref: reference2 as unknown as Reference },
};
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const mapCounts = (c: Record<string, number>): TraceCounts => ({
  currentOnsiteVehicleCount: c.currentOnsiteRobotCount ?? 0,
  currentShippedVehicleCount: c.currentShippedRobotCount ?? 0,
  currentCustomerCount: c.currentCustomerCount ?? 0,
  looseCandidateComponentCount: c.looseCandidateComponentCount ?? 0,
  quarantinedComponentCount: c.quarantinedComponentCount ?? 0,
  historicalOnlyVehicleCount: c.historicalOnlyRobotCount ?? 0,
  unresolvedOnlyVehicleCount: c.unresolvedOnlyRobotCount ?? 0,
});

export type TraceDoubleOptions = {
  workspaceId?: string;
  now?: () => string;
  failures?: Array<{ method: keyof TraceServices; error: Error; delayMs?: number }>;
  incompleteForRoots?: string[];
};
type RevisionRecord = RevisionInfo & { fixture: Key | "ev"; sequence: number; sourceHashes: string[] };
type PreviewRecord = ImportPreview & { fixture: Key; consumed: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createTraceDouble(options: TraceDoubleOptions = {}): TraceServices {
  const workspaceId = options.workspaceId ?? ASSEMBLY_REGRESSION.workspaceId;
  const now = options.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
  const revisions = new Map<string, RevisionRecord>();
  const previews = new Map<string, PreviewRecord>();
  const runs = new Map<string, TraceResult>();
  const counters = new Map<string, number>();
  let evSeed: EvSeed | null = null;
  const seed = () => (evSeed ??= buildEvSeed());
  if (workspaceId === EV_DEMO.workspaceId) {
    // Pre-accepted synthetic EV revision so the EV trace roots work without an import.
    revisions.set("ev-r1", { contractVersion: CONTRACT_VERSION, revisionId: "ev-r1", acceptedAt: "2026-09-12T08:00:00Z", dataHash: sha256("ev-seed-v1"), fixture: "ev", sequence: 0, sourceHashes: [] });
  }
  const nextId = (p: string) => {
    const n = (counters.get(p) ?? 0) + 1;
    counters.set(p, n);
    return `${p}-${n}`;
  };
  async function gate(method: keyof TraceServices): Promise<void> {
    const f = options.failures?.find((x) => x.method === method);
    if (f) {
      if (f.delayMs) await sleep(f.delayMs);
      throw f.error;
    }
  }
  const assertWorkspace = (ctx: RequestContext) => {
    if (ctx.workspaceId !== workspaceId) throw new DomainError("FORBIDDEN", "Workspace is not the configured synthetic workspace.");
  };
  const latest = () => [...revisions.values()].sort((a, b) => b.sequence - a.sequence)[0] ?? null;
  const strip = (p: PreviewRecord): ImportPreview => {
    const { fixture: _f, consumed: _c, ...dto } = p;
    return structuredClone(dto);
  };

  function evidenceFor(key: Key): Evidence[] {
    const { data } = FIX[key];
    const out: Evidence[] = [];
    const mk = (id: string, sourceName: string, locator: string, text: string) => out.push({ id, sourceName, sourceHash: sha256(text), locator, text, sourceKind: "synthetic", sourceRecordId: null, sourceUrl: null, retrievedAt: null });
    for (const e of data.entities) if (e.originEvidenceId) mk(e.originEvidenceId, IMPORT_FILE_NAMES.entities, `entity:${e.id}`, JSON.stringify(e));
    for (const i of data.installations) mk(i.evidenceId, IMPORT_FILE_NAMES.installations, `installation:${i.id}`, JSON.stringify(i));
    for (const s of data.shipments) mk(s.evidenceId, IMPORT_FILE_NAMES.shipments, `shipment:${s.id}`, JSON.stringify(s));
    return out;
  }

  function buildRun(rev: RevisionRecord, request: TraceRequest, runId: string): TraceResult {
    const { data, ref } = FIX[rev.fixture as Key];
    const current = new Set(ref.currentRobotIds);
    const historicalOnly = new Set(ref.historicalOnlyRobotIds);
    const unresolvedOnly = new Set(ref.unresolvedOnlyRobotIds);
    const loose = new Set(ref.looseCandidateComponentIds);
    const quarantined = new Set(ref.quarantinedComponentIds);
    const originGap = new Set(ref.originGapRobotIds);
    const rootBatch = request.root.id;
    const suspectComponents = new Set(data.entities.filter((e) => e.batchId === rootBatch).map((e) => e.id));
    const shipmentByUnit = new Map(data.shipments.map((s) => [s.unitId, s]));
    const issues: ReviewIssue[] = [];
    for (const r of originGap) {
      issues.push({ id: `ISSUE-UNKNOWN-ORIGIN-${r}`, code: REVIEW_ISSUE_CODES.UNKNOWN_ORIGIN, severity: "warning", message: `A component installed in ${r} has no recorded batch origin; ${r} stays in the unresolved queue.`, entityIds: [r], evidenceIds: [] });
    }
    for (const r of historicalOnly) {
      issues.push({ id: `ISSUE-REVIEW-PENDING-${r}`, code: REVIEW_ISSUE_CODES.ENGINEERING_REVIEW_PENDING, severity: "warning", message: `${r} had a suspect component replaced; removal is not engineering clearance.`, entityIds: [r], evidenceIds: [] });
    }
    const incomplete = options.incompleteForRoots?.includes(rootBatch) ?? false;
    if (incomplete) issues.push({ id: "ISSUE-TRAVERSAL-BUDGET", code: REVIEW_ISSUE_CODES.TRAVERSAL_BUDGET_EXCEEDED, severity: "blocking", message: "Traversal budget exceeded; results are partial.", entityIds: [], evidenceIds: [] });

    const rows: TraceRow[] = data.entities
      .filter((e) => e.kind === "robot" || suspectComponents.has(e.id) || loose.has(e.id) || quarantined.has(e.id))
      .map((e): TraceRow => {
        const isVehicle = e.kind === "robot";
        const ship = shipmentByUnit.get(e.id);
        const rowCurrent = isVehicle ? current.has(e.id) : suspectComponents.has(e.id) && e.locationState === "installed";
        const rowHistorical = isVehicle ? current.has(e.id) || historicalOnly.has(e.id) : suspectComponents.has(e.id);
        return {
          entityId: e.id,
          entityKind: isVehicle ? "vehicle" : e.kind === "subassembly" ? "subassembly" : "component",
          partNumber: e.partNumber,
          serialNumber: e.serialNumber,
          buildId: isVehicle ? e.id : null,
          vin: null,
          locationState: e.locationState as TraceRow["locationState"],
          customerId: ship?.customerId ?? null,
          shipmentLineIds: ship ? [ship.id] : [],
          currentContainment: rowCurrent,
          historicalContainment: rowHistorical,
          hasUnresolvedEvidence: isVehicle ? unresolvedOnly.has(e.id) : e.batchId === null,
          engineeringReview: historicalOnly.has(e.id) ? "pending" : quarantined.has(e.id) ? "reviewed" : "not_recorded",
          evidenceIds: [e.originEvidenceId ?? "", ...data.installations.filter((i) => i.childId === e.id || i.parentId === e.id).map((i) => i.evidenceId), ship?.evidenceId ?? ""].filter(Boolean),
          issueIds: issues.filter((i) => i.entityIds.includes(e.id)).map((i) => i.id),
        };
      })
      .sort((a, b) => a.entityId.localeCompare(b.entityId));

    const paths: TracePath[] = [];
    for (const e of data.entities) if (e.batchId === rootBatch) paths.push({ relationshipId: `BATCH-${e.batchId}-${e.id}`, fromId: e.batchId!, toId: e.id, kind: "BATCH_HAS_COMPONENT", validFrom: null, validTo: null, evidenceIds: e.originEvidenceId ? [e.originEvidenceId] : [] });
    for (const i of data.installations) paths.push({ relationshipId: i.id, fromId: i.childId, toId: i.parentId, kind: "INSTALLED_IN", validFrom: i.installedAt, validTo: i.removedAt, evidenceIds: [i.evidenceId] });
    const customerIds = new Set(ref.currentCustomerIds);
    return {
      contractVersion: CONTRACT_VERSION,
      runId,
      revisionId: rev.revisionId,
      root: structuredClone(request.root),
      createdAt: now(),
      engineVersion: "trace-double-regression-1",
      dataHash: rev.dataHash,
      scope: structuredClone(request.scope),
      executionStatus: incomplete ? "incomplete" : "completed",
      dataCompleteness: originGap.size > 0 ? "gaps_found" : "reviewed_scope",
      counts: mapCounts(ref.counts),
      rows,
      issues,
      evidence: evidenceFor(rev.fixture as Key),
      paths,
      customers: [...customerIds].sort().map((id) => ({ id, name: `${id} (synthetic)` })),
      ...(request.incidentId ? { incidentId: request.incidentId } : {}),
    };
  }

  /** EV seed trace (double): lot -> produced/received components -> active installations -> distinct vehicles. */
  function buildEvRun(rev: RevisionRecord, request: TraceRequest, runId: string): TraceResult {
    const { entities, installations, shipments, evidenceTexts } = seed();
    const byId = new Map(entities.map((e) => [e.id, e]));
    const at = Date.parse(request.scope.configurationAsOf);
    const active = (i: (typeof installations)[number]) => Date.parse(i.installedAt) <= at && (i.removedAt === null || Date.parse(i.removedAt) > at);
    const root = request.root;
    const suspects = entities.filter((e) => {
      if (root.kind === "component_serial") return e.id === root.id;
      if (!e.origin || e.origin.productionLotId !== root.id) return false;
      return root.kind === "supplier_batch" ? e.origin.sourcingType === "supplier" : e.origin.sourcingType === "in_house";
    });
    if (suspects.length === 0) throw new DomainError("NOT_FOUND", "Root " + root.kind + " " + root.id + " is not in the accepted revision.");
    const rowsById = new Map<string, TraceRow>();
    const paths: TracePath[] = [];
    const evidenceIds = new Set<string>();
    const shipmentByUnit = new Map(shipments.map((sh) => [sh.unitId, sh]));
    const currentVehicles = new Set<string>();
    const rowFor = (e: (typeof entities)[number], current: boolean): TraceRow => {
      const sh = e.kind === "vehicle" ? shipmentByUnit.get(e.id) : undefined;
      const existing = rowsById.get(e.id);
      if (existing) {
        existing.currentContainment = existing.currentContainment || current;
        existing.historicalContainment = existing.historicalContainment || current;
        return existing;
      }
      const row: TraceRow = {
        entityId: e.id, entityKind: e.kind, partNumber: e.partNumber, serialNumber: e.serialNumber, buildId: e.vehicle?.buildId ?? null, vin: e.vehicle?.vin ?? null,
        locationState: e.locationState, customerId: sh?.customerId ?? null, shipmentLineIds: sh ? [sh.id] : [],
        currentContainment: current, historicalContainment: current, hasUnresolvedEvidence: false,
        engineeringReview: e.locationState === "quarantine" ? "reviewed" : "not_recorded",
        evidenceIds: [...(e.origin?.evidenceIds ?? []), ...(sh ? ["EVID-" + sh.id] : [])], issueIds: [],
      };
      rowsById.set(e.id, row);
      return row;
    };
    let loose = 0;
    let quarantined = 0;
    for (const c of suspects) {
      const kind = c.origin?.sourcingType === "in_house" ? "LOT_PRODUCED_COMPONENT" : "BATCH_HAS_COMPONENT";
      paths.push({ relationshipId: kind + "-" + root.id + "-" + c.id, fromId: root.id, toId: c.id, kind, validFrom: null, validTo: null, evidenceIds: c.origin?.evidenceIds ?? [] });
      c.origin?.evidenceIds.forEach((x) => evidenceIds.add(x));
      const chain: string[] = [];
      let cursor = c.id;
      let reachedVehicle: string | null = null;
      for (let hop = 0; hop < 6; hop += 1) {
        const inst = installations.find((i) => i.childId === cursor && active(i));
        if (!inst) break;
        paths.push({ relationshipId: inst.id, fromId: inst.childId, toId: inst.parentId, kind: "INSTALLED_IN", validFrom: inst.installedAt, validTo: inst.removedAt, evidenceIds: inst.evidenceIds });
        inst.evidenceIds.forEach((x) => evidenceIds.add(x));
        chain.push(inst.parentId);
        const parent = byId.get(inst.parentId);
        if (!parent) break;
        if (parent.kind === "vehicle") {
          reachedVehicle = parent.id;
          break;
        }
        cursor = parent.id;
      }
      rowFor(c, reachedVehicle !== null);
      for (const id of chain) {
        const e = byId.get(id);
        if (e) rowFor(e, true);
      }
      if (reachedVehicle) currentVehicles.add(reachedVehicle);
      else if (c.locationState === "quarantine") quarantined += 1;
      else if (c.locationState === "onsite") loose += 1;
    }
    const vehicles = [...currentVehicles].map((id) => byId.get(id)).filter((v): v is (typeof entities)[number] => Boolean(v));
    const customers = new Set(vehicles.map((v) => shipmentByUnit.get(v.id)?.customerId).filter((x): x is string => Boolean(x)));
    const evidence: Evidence[] = [...evidenceIds]
      .map((id) => {
        const t = evidenceTexts[id];
        return t ? ({ id, sourceName: t.sourceName, sourceHash: sha256(t.text), locator: t.locator, text: t.text, sourceKind: "synthetic", sourceRecordId: null, sourceUrl: null, retrievedAt: null } as Evidence) : null;
      })
      .filter((x): x is Evidence => x !== null);
    return {
      contractVersion: CONTRACT_VERSION, runId, revisionId: rev.revisionId, root: structuredClone(root), createdAt: now(), engineVersion: "trace-double-ev-seed-1", dataHash: rev.dataHash,
      scope: structuredClone(request.scope), executionStatus: "completed", dataCompleteness: "reviewed_scope",
      counts: {
        currentOnsiteVehicleCount: vehicles.filter((v) => v.locationState !== "shipped").length,
        currentShippedVehicleCount: vehicles.filter((v) => v.locationState === "shipped").length,
        currentCustomerCount: customers.size,
        looseCandidateComponentCount: loose,
        quarantinedComponentCount: quarantined,
        historicalOnlyVehicleCount: 0,
        unresolvedOnlyVehicleCount: 0,
      },
      rows: [...rowsById.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)), issues: [], evidence, paths,
      customers: [...customers].sort().map((id) => ({ id, name: id + " (synthetic)" })),
      ...(request.incidentId ? { incidentId: request.incidentId } : {}),
    };
  }

  const services: TraceServices = {
    async previewImport(ctx, input: ImportInput) {
      await gate("previewImport");
      assertWorkspace(ctx);
      const expected = Object.values(IMPORT_FILE_NAMES);
      const received = input.files.map((f) => f.name);
      const missing = expected.filter((n) => !received.includes(n));
      const sourceHashes = input.files.map((f) => sha256(f.text));
      const issues: ReviewIssue[] = [];
      if (input.baseRevisionId && !revisions.has(input.baseRevisionId)) throw new DomainError("NOT_FOUND", `Base revision ${input.baseRevisionId} does not exist.`);
      for (const name of missing) {
        const blocking = name === IMPORT_FILE_NAMES.entities || name === IMPORT_FILE_NAMES.installations;
        issues.push({ id: `ISSUE-COVERAGE-${name}`, code: REVIEW_ISSUE_CODES.COVERAGE_GAP, severity: blocking ? "blocking" : "warning", message: `${name} was expected but not received.`, entityIds: [], evidenceIds: [] });
      }
      for (const f of input.files) if (/CONFLICTING-INSTALLATION/.test(f.text)) issues.push({ id: `ISSUE-CONFLICT-${f.name}`, code: REVIEW_ISSUE_CODES.CONFLICTING_INSTALLATION, severity: "blocking", message: `${f.name} reuses an installation id with different content.`, entityIds: [], evidenceIds: [] });
      const dup = [...revisions.values()].find((r) => r.sourceHashes.length === sourceHashes.length && r.sourceHashes.every((h) => sourceHashes.includes(h)));
      if (dup) issues.push({ id: `ISSUE-ALREADY-IMPORTED-${dup.revisionId}`, code: REVIEW_ISSUE_CODES.ALREADY_IMPORTED, severity: "warning", message: `Identical source files were already accepted as ${dup.revisionId}.`, entityIds: [], evidenceIds: [] });
      issues.push({ id: "ISSUE-UNKNOWN-ORIGIN-E900", code: REVIEW_ISSUE_CODES.UNKNOWN_ORIGIN, severity: "warning", message: "Component E900 has no recorded batch origin (regression fixture).", entityIds: ["E900", "R005"], evidenceIds: [] });
      const p: PreviewRecord = { previewId: nextId("preview"), baseRevisionId: input.baseRevisionId ?? null, canAccept: !issues.some((i) => i.severity === "blocking"), issues, sourceHashes, coverage: { expected, received, missing }, fixture: "revision1", consumed: false };
      previews.set(p.previewId, p);
      return strip(p);
    },
    async previewLateEvidence(ctx, { baseRevisionId }) {
      await gate("previewLateEvidence");
      assertWorkspace(ctx);
      const base = revisions.get(baseRevisionId);
      if (!base) throw new DomainError("NOT_FOUND", `Revision ${baseRevisionId} does not exist.`);
      if (base.fixture !== "revision1") throw new DomainError("PREVIEW_REJECTED", "The prepared late evidence has already been applied to this revision.");
      const text = "Late supplier certificate: E900 belongs to batch B17 (regression fixture). Newly recorded provenance, not a new installation.";
      const p: PreviewRecord = { previewId: nextId("preview"), baseRevisionId: base.revisionId, canAccept: true, issues: [{ id: "ISSUE-LATE-CERT", code: REVIEW_ISSUE_CODES.UNKNOWN_ORIGIN, severity: "warning", message: text, entityIds: ["E900", "R005"], evidenceIds: [] }], sourceHashes: [sha256(text)], coverage: { expected: [IMPORT_FILE_NAMES.batches], received: [IMPORT_FILE_NAMES.batches], missing: [] }, fixture: "revision2", consumed: false };
      previews.set(p.previewId, p);
      return strip(p);
    },
    async acceptImport(ctx, { previewId, expectedBaseRevisionId }) {
      await gate("acceptImport");
      assertWorkspace(ctx);
      const p = previews.get(previewId);
      if (!p) throw new DomainError("NOT_FOUND", `Preview ${previewId} does not exist.`);
      if (p.consumed) throw new DomainError("DUPLICATE_ACTION", `Preview ${previewId} was already accepted.`);
      if (!p.canAccept) throw new DomainError("PREVIEW_REJECTED", "Preview has blocking issues.", { blocking: p.issues.filter((i) => i.severity === "blocking").map((i) => i.id) });
      const cur = latest();
      if (p.baseRevisionId !== null) {
        if (expectedBaseRevisionId !== p.baseRevisionId || cur?.revisionId !== p.baseRevisionId) throw new DomainError("REVISION_MISMATCH", "Expected base revision does not match the current accepted revision.", { expected: expectedBaseRevisionId ?? null, current: cur?.revisionId ?? null });
      } else if (expectedBaseRevisionId !== undefined) throw new DomainError("REVISION_MISMATCH", "This preview has no base revision.");
      const dup = p.issues.find((i) => i.code === REVIEW_ISSUE_CODES.ALREADY_IMPORTED);
      if (dup) throw new DomainError("DUPLICATE_ACTION", dup.message);
      p.consumed = true;
      const rec: RevisionRecord = { contractVersion: CONTRACT_VERSION, revisionId: nextId("rev"), acceptedAt: now(), dataHash: FIX[p.fixture as Key].ref.dataHash, fixture: p.fixture, sequence: revisions.size + 1, sourceHashes: p.sourceHashes };
      revisions.set(rec.revisionId, rec);
      return { contractVersion: CONTRACT_VERSION, revisionId: rec.revisionId, acceptedAt: rec.acceptedAt, dataHash: rec.dataHash };
    },
    async runTrace(ctx, request) {
      await gate("runTrace");
      assertWorkspace(ctx);
      const rev = revisions.get(request.revisionId);
      if (!rev) throw new DomainError("NOT_FOUND", "Revision " + request.revisionId + " does not exist.");
      if (rev.fixture === "ev") {
        if (request.scope.siteId !== EV_DEMO.siteId) throw new DomainError("SCOPE_INVALID", "Site " + request.scope.siteId + " is outside the accepted revision's coverage.");
        const evRun = buildEvRun(rev, request, nextId("run"));
        runs.set(evRun.runId, Object.freeze(structuredClone(evRun)));
        return structuredClone(evRun);
      }
      if (request.scope.siteId !== ASSEMBLY_REGRESSION.scope.siteId) throw new DomainError("SCOPE_INVALID", `Site ${request.scope.siteId} is outside the accepted revision's coverage.`);
      if (request.root.id === "AMBIGUOUS") throw new DomainError("AMBIGUOUS_ROOT", "Root code matches more than one accepted batch; review required.", { candidates: ["B17@SUP-A", "B17@SUP-B"] });
      const { data } = FIX[rev.fixture as Key];
      if (request.root.kind === "supplier_batch" && !data.batches.some((b) => b.id === request.root.id)) throw new DomainError("NOT_FOUND", `Batch ${request.root.id} is not in the accepted revision.`);
      if (request.root.kind === "manufacturing_lot") throw new DomainError("NOT_FOUND", "The regression fixture has no manufacturing lots; the EV fixture (Codey) provides them.");
      const run = buildRun(rev, request, nextId("run"));
      runs.set(run.runId, Object.freeze(structuredClone(run)));
      return structuredClone(run);
    },
    async getTrace(ctx, { runId }) {
      await gate("getTrace");
      assertWorkspace(ctx);
      const run = runs.get(runId);
      if (!run) throw new DomainError("NOT_FOUND", `Run ${runId} does not exist.`);
      return structuredClone(run);
    },
    async compareTraces(ctx, { earlierRunId, laterRunId }) {
      await gate("compareTraces");
      assertWorkspace(ctx);
      const a = runs.get(earlierRunId);
      const b = runs.get(laterRunId);
      if (!a || !b) throw new DomainError("NOT_FOUND", "One or both runs do not exist.");
      const reasons: string[] = [];
      if (a.root.kind !== b.root.kind || a.root.id !== b.root.id) reasons.push("Different roots.");
      for (const k of ["siteId", "configurationAsOf", "historyFrom", "trackedPartNumber"] as const) if (a.scope[k] !== b.scope[k]) reasons.push(`Scope changed: ${k}.`);
      if (a.executionStatus !== "completed" || b.executionStatus !== "completed") reasons.push("At least one run is incomplete.");
      const comparable = reasons.length === 0;
      if (comparable) reasons.push(a.revisionId === b.revisionId ? "Same data revision; identical scope and cutoff." : `Data revision changed ${a.revisionId} -> ${b.revisionId}; scope, root and cutoff unchanged.`);
      const currentVehicles = (r: TraceResult) => new Set(r.rows.filter((x) => x.entityKind === "vehicle" && x.currentContainment).map((x) => x.entityId));
      const va = currentVehicles(a);
      const vb = currentVehicles(b);
      const ca = new Set(a.customers.map((c) => c.id));
      const laterIssues = new Set(b.issues.map((i) => i.id));
      const delta = comparable ? (Object.fromEntries(Object.keys(a.counts).map((k) => [k, b.counts[k as keyof TraceCounts] - a.counts[k as keyof TraceCounts]])) as TraceComparison["delta"]) : null;
      return { earlierRunId, laterRunId, comparable, reasons, delta, addedCurrentVehicleIds: [...vb].filter((x) => !va.has(x)).sort(), removedCurrentVehicleIds: [...va].filter((x) => !vb.has(x)).sort(), addedCurrentCustomerIds: b.customers.map((c) => c.id).filter((c) => !ca.has(c)).sort(), resolvedIssueIds: a.issues.map((i) => i.id).filter((id) => !laterIssues.has(id)) };
    },
  };
  return services;
}
