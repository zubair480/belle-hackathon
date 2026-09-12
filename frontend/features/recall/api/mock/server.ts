/**
 * In-memory MOCK of the v4 issue/trace services for UI development and tests. It applies the
 * same rules the real server enforces (transition table, expectedVersion, idempotency,
 * verification-gated closure) so the UI's error states can be exercised without a backend.
 * It is selected only by NEXT_PUBLIC_RECALL_UI_MOCKS=true and is never a fallback for a
 * failed live call. Sample data lives in data.ts.
 */
import type { EntityContext, EntityRecord, Evidence, Installation, ReviewIssue } from "@/contracts/common";
import type { TraceRequest, TraceResult, TraceRow } from "@/contracts/recall";
import {
  TRANSITIONS,
  type AuditEvent,
  type CauseAssessment,
  type CauseAssessmentInput,
  type CountBucket,
  type CreateIssueCommand,
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
  type IssueUpdate,
  type ReferenceCatalog,
  type SimilarResolution,
  type SimilarResolutions,
  type TransitionCommand,
  type Verification,
  type VerificationInput,
} from "@/contracts/issues";
import type { ClientError } from "../types";
import * as seed from "./data";

export class MockError extends Error {
  constructor(
    readonly code: ClientError["code"],
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Store = {
  catalog: ReferenceCatalog;
  entities: Map<string, EntityRecord>;
  installations: Installation[];
  evidence: Map<string, Evidence>;
  issues: Map<string, Issue>;
  causes: CauseAssessment[];
  fixes: FixRevision[];
  verifications: Verification[];
  comments: IssueComment[];
  audit: AuditEvent[];
  idempotency: Map<string, { payload: string; result: unknown }>;
  seq: number;
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function createStore(): Store {
  const { entities, installations } = seed.buildEntities();
  return {
    catalog: clone(seed.catalog),
    entities: new Map(entities.map((e) => [e.id, e])),
    installations,
    evidence: new Map(seed.evidence.map((e) => [e.id, e])),
    issues: new Map(clone(seed.issues).map((i) => [i.id, i])),
    causes: clone(seed.causes),
    fixes: clone(seed.fixes),
    verifications: clone(seed.verifications),
    comments: clone(seed.comments),
    audit: clone(seed.auditEvents),
    idempotency: new Map(),
    seq: 100,
  };
}

export type MockServerOptions = { now?: () => string; actorId?: string };

export class MockServer {
  readonly store: Store;
  private readonly now: () => string;
  private readonly actor: string;

  constructor(options: MockServerOptions = {}) {
    this.store = createStore();
    this.now = options.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
    this.actor = options.actorId ?? seed.MOCK_ACTOR;
  }

  private nextId(prefix: string): string {
    this.store.seq += 1;
    return `${prefix}-${String(this.store.seq).padStart(4, "0")}`;
  }

  private idempotent<T>(key: string, payload: unknown, run: () => T): T {
    const serialized = JSON.stringify(payload);
    const hit = this.store.idempotency.get(key);
    if (hit) {
      if (hit.payload === serialized) return clone(hit.result as T);
      throw new MockError("DUPLICATE_ACTION", `Idempotency key ${key} was already used with a different payload.`);
    }
    const result = run();
    this.store.idempotency.set(key, { payload: serialized, result: clone(result) });
    return result;
  }

  private issueOrThrow(issueId: string): Issue {
    const issue = this.store.issues.get(issueId);
    if (!issue) throw new MockError("NOT_FOUND", `Issue ${issueId} not found.`);
    return issue;
  }

  private checkRefs(input: { teamIds?: Array<string | null>; supplierIds?: string[]; stationIds?: Array<string | null>; processStepIds?: Array<string | null>; entityIds?: string[]; evidenceIds?: string[]; defectCode?: string | null }) {
    const c = this.store.catalog;
    const missing: string[] = [];
    const has = (list: Array<{ id: string }>, id: string) => list.some((x) => x.id === id);
    for (const t of input.teamIds ?? []) if (t && !has(c.teams, t)) missing.push(`team ${t}`);
    for (const s of input.supplierIds ?? []) if (!has(c.suppliers, s)) missing.push(`supplier ${s}`);
    for (const s of input.stationIds ?? []) if (s && !has(c.stations, s)) missing.push(`station ${s}`);
    for (const p of input.processStepIds ?? []) if (p && !has(c.processSteps, p)) missing.push(`process step ${p}`);
    for (const e of input.entityIds ?? []) if (!this.store.entities.has(e)) missing.push(`entity ${e}`);
    for (const e of input.evidenceIds ?? []) if (!this.store.evidence.has(e)) missing.push(`evidence ${e}`);
    if (input.defectCode && !has(c.defectCodes, input.defectCode)) missing.push(`defect code ${input.defectCode}`);
    if (missing.length) throw new MockError("INVALID_REFERENCE", `Unknown reference(s): ${missing.join(", ")}.`, { missing });
  }

  private addAudit(issueId: string, kind: AuditEvent["kind"], summary: string, fromStatus: AuditEvent["fromStatus"] = null, toStatus: AuditEvent["toStatus"] = null, subjectId: string | null = null): void {
    this.store.audit.push({ id: this.nextId("AUD"), issueId, kind, actorId: this.actor, at: this.now(), fromStatus, toStatus, summary, subjectId });
  }

  private createEvidence(inputs: Array<{ sourceName: string; locator?: string; text: string }>): string[] {
    return inputs.map((e) => {
      const id = this.nextId("EVID");
      this.store.evidence.set(id, {
        id,
        sourceName: e.sourceName,
        sourceHash: seed.pseudoHash(e.text),
        locator: e.locator ?? "manual-note",
        text: e.text,
        sourceKind: "manual",
        sourceRecordId: null,
        sourceUrl: null,
        retrievedAt: null,
      });
      return id;
    });
  }

  // ---- catalog and entities ----

  getCatalog(): ReferenceCatalog {
    return clone(this.store.catalog);
  }

  getEntityContext(entityId: string, configurationAsOf: string | null): EntityContext {
    const entity = this.store.entities.get(entityId);
    if (!entity) throw new MockError("NOT_FOUND", `Entity ${entityId} is not recorded in this workspace.`);
    const asOf = configurationAsOf ?? this.now();
    const active = (i: Installation) => i.installedAt <= asOf && (i.removedAt === null || i.removedAt > asOf);
    const parentsOf = (id: string): EntityRecord[] => {
      const chain: EntityRecord[] = [];
      let cur = id;
      for (let hops = 0; hops < 6; hops++) {
        const link = this.store.installations.find((i) => i.childId === cur && active(i));
        if (!link) break;
        const parent = this.store.entities.get(link.parentId);
        if (!parent) break;
        chain.push(parent);
        cur = parent.id;
      }
      return chain;
    };
    const currentParents = parentsOf(entityId);
    const currentChildren = this.store.installations.filter((i) => i.parentId === entityId && active(i)).map((i) => this.store.entities.get(i.childId)).filter((e): e is EntityRecord => Boolean(e));
    const installations = this.store.installations.filter((i) => i.childId === entityId || i.parentId === entityId);
    const currentVehicleIds = entity.kind === "vehicle" ? [entity.id] : currentParents.filter((p) => p.kind === "vehicle").map((p) => p.id);
    // Historical: any vehicle reached through installation intervals that touched this entity, including removed ones.
    const historical = new Set<string>(currentVehicleIds);
    for (const i of this.store.installations.filter((x) => x.childId === entityId)) {
      let cur = i.parentId;
      for (let hops = 0; hops < 6; hops++) {
        const p = this.store.entities.get(cur);
        if (!p) break;
        if (p.kind === "vehicle") {
          historical.add(p.id);
          break;
        }
        const up = this.store.installations.find((x) => x.childId === cur);
        if (!up) break;
        cur = up.parentId;
      }
    }
    const evidenceIds = new Set<string>([...(entity.origin?.evidenceIds ?? []), ...installations.flatMap((i) => i.evidenceIds)]);
    const limitations = ["Removal is not engineering clearance"];
    if (entity.origin?.sourcingType === "unknown") limitations.push("Origin not recorded: supplier/lot unknown; review required");
    if (entity.kind === "vehicle") {
      const shp = seed.shipments.find((x) => x.vehicleId === entity.id);
      if (shp) limitations.push(`Shipped ${shp.shippedAt} to ${seed.customers.find((c) => c.id === shp.customerId)?.name ?? shp.customerId} (${shp.id})`);
    }
    return clone({
      entity,
      currentParents,
      currentChildren,
      installations,
      currentVehicleIds,
      historicalVehicleIds: [...historical],
      evidence: [...evidenceIds].map((id) => this.store.evidence.get(id)).filter((e): e is Evidence => Boolean(e)),
      limitations,
    });
  }

  // ---- issues ----

  createIssue(command: CreateIssueCommand): { issue: Issue; replayed: boolean } {
    const { idempotencyKey, newEvidence, ...input } = command;
    const replayed = this.store.idempotency.has(idempotencyKey);
    const issue = this.idempotent(idempotencyKey, command, () => {
      this.checkRefs({ teamIds: [input.reportingTeamId, input.assignedTeamId], supplierIds: input.linkedSupplierIds, stationIds: [input.detectionStationId], processStepIds: [input.processStepId], entityIds: input.entityIds, evidenceIds: input.evidenceIds, defectCode: input.defectCode });
      const evidenceIds = [...input.evidenceIds, ...this.createEvidence(newEvidence ?? [])];
      const at = this.now();
      const created: Issue = { ...input, evidenceIds, id: this.nextId("ISS"), version: 1, status: "open", createdBy: this.actor, createdAt: at, updatedAt: at, confirmedCauseId: null, currentFixRevisionId: null };
      this.store.issues.set(created.id, created);
      this.addAudit(created.id, "created", `Issue created (${input.origin})`, null, "open");
      return created;
    });
    return { issue: clone(issue), replayed };
  }

  listIssues(filter: Partial<IssueListFilter>): IssuePage {
    let items = [...this.store.issues.values()];
    const currentCause = (i: Issue) => this.store.causes.find((c) => c.id === i.confirmedCauseId) ?? null;
    if (filter.status?.length) items = items.filter((i) => filter.status!.includes(i.status));
    if (filter.severity?.length) items = items.filter((i) => filter.severity!.includes(i.severity));
    if (filter.teamId) {
      const role = filter.teamRole ?? "assigned";
      items = items.filter((i) => (role === "reporting" ? i.reportingTeamId === filter.teamId : role === "assigned" ? i.assignedTeamId === filter.teamId : currentCause(i)?.responsibleTeamId === filter.teamId));
    }
    if (filter.supplierId) items = items.filter((i) => i.linkedSupplierIds.includes(filter.supplierId!) || currentCause(i)?.responsibleSupplierId === filter.supplierId);
    if (filter.defectCode) items = items.filter((i) => i.defectCode === filter.defectCode);
    if (filter.partNumber) items = items.filter((i) => i.partNumber === filter.partNumber);
    if (filter.stationId) items = items.filter((i) => i.detectionStationId === filter.stationId);
    if (filter.processStepId) items = items.filter((i) => i.processStepId === filter.processStepId);
    if (filter.entityId) items = items.filter((i) => i.entityIds.includes(filter.entityId!));
    if (filter.detectedFrom) items = items.filter((i) => i.detectedAt >= filter.detectedFrom!);
    if (filter.detectedToExclusive) items = items.filter((i) => i.detectedAt < filter.detectedToExclusive!);
    if (filter.text) {
      const q = filter.text.toLowerCase();
      items = items.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
    }
    items.sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1));
    const limit = filter.limit ?? 50;
    const start = filter.cursor ? Number(filter.cursor) || 0 : 0;
    const page = items.slice(start, start + limit);
    return clone({ items: page, nextCursor: start + limit < items.length ? String(start + limit) : null, total: items.length });
  }

  getIssue(issueId: string): IssueDetail {
    const issue = this.issueOrThrow(issueId);
    const entities = issue.entityIds.map((id) => this.store.entities.get(id)).filter((e): e is EntityRecord => Boolean(e));
    const entityContexts = entities.map((e) => this.getEntityContext(e.id, null));
    const causes = this.store.causes.filter((c) => c.issueId === issueId);
    const fixes = this.store.fixes.filter((f) => f.issueId === issueId);
    const verifications = this.store.verifications.filter((v) => v.issueId === issueId);
    const comments = this.store.comments.filter((c) => c.issueId === issueId);
    const audit = this.store.audit.filter((a) => a.issueId === issueId).sort((a, b) => (a.at < b.at ? -1 : 1));
    const evidenceIds = new Set<string>([...issue.evidenceIds, ...causes.flatMap((c) => c.evidenceIds), ...fixes.flatMap((f) => f.evidenceIds), ...verifications.flatMap((v) => v.evidenceIds), ...comments.flatMap((c) => c.evidenceIds)]);
    if (issue.defectCode && ["CONNECTOR_MISALIGNED", "CONNECTOR_PIN_DAMAGE"].includes(issue.defectCode)) evidenceIds.add("EVID-PUBLIC-NHTSA-CP");
    return clone({ contractVersion: "assembly-quality-v4", issue, entities, entityContexts, causes, fixes, verifications, comments, audit, evidence: [...evidenceIds].map((id) => this.store.evidence.get(id)).filter((e): e is Evidence => Boolean(e)) });
  }

  updateIssue(issueId: string, update: IssueUpdate): Issue {
    const issue = this.issueOrThrow(issueId);
    if (update.expectedVersion !== issue.version) throw new MockError("STALE_VERSION", `Issue ${issueId} is at version ${issue.version}, not ${update.expectedVersion}. Reload before editing.`, { currentVersion: issue.version });
    const { expectedVersion: _v, ...fields } = update;
    this.checkRefs({ teamIds: [fields.assignedTeamId ?? null], supplierIds: fields.linkedSupplierIds, stationIds: [fields.detectionStationId ?? null], processStepIds: [fields.processStepId ?? null], entityIds: fields.entityIds, evidenceIds: fields.evidenceIds, defectCode: fields.defectCode });
    const changed = Object.keys(fields).filter((k) => (fields as Record<string, unknown>)[k] !== undefined);
    Object.assign(issue, Object.fromEntries(changed.map((k) => [k, (fields as Record<string, unknown>)[k]])));
    issue.version += 1;
    issue.updatedAt = this.now();
    this.addAudit(issueId, "updated", `Updated ${changed.join(", ") || "nothing"}`);
    return clone(issue);
  }

  addComment(issueId: string, input: IssueCommentInput): IssueComment {
    const issue = this.issueOrThrow(issueId);
    return clone(
      this.idempotent(input.idempotencyKey, input, () => {
        this.checkRefs({ evidenceIds: input.evidenceIds });
        const evidenceIds = [...(input.evidenceIds ?? []), ...this.createEvidence(input.newEvidence ?? [])];
        const c: IssueComment = { id: this.nextId("CMT"), issueId, body: input.body, evidenceIds, authorId: this.actor, createdAt: this.now() };
        this.store.comments.push(c);
        issue.version += 1;
        issue.updatedAt = c.createdAt;
        this.addAudit(issueId, "commented", "Comment added", null, null, c.id);
        return c;
      }),
    );
  }

  recordCause(issueId: string, input: CauseAssessmentInput): CauseAssessment {
    const issue = this.issueOrThrow(issueId);
    return clone(
      this.idempotent(input.idempotencyKey, input, () => {
        this.checkRefs({ teamIds: [input.responsibleTeamId], supplierIds: input.responsibleSupplierId ? [input.responsibleSupplierId] : [], stationIds: [input.causalStationId], processStepIds: [input.causalProcessStepId ?? null], evidenceIds: input.evidenceIds });
        if (input.supersedesId && !this.store.causes.some((c) => c.id === input.supersedesId && c.issueId === issueId)) throw new MockError("INVALID_REFERENCE", `supersedesId ${input.supersedesId} is not an assessment of this issue.`);
        const { idempotencyKey: _k, ...rest } = input;
        const isCurrent = input.state === "confirmed";
        if (isCurrent) for (const c of this.store.causes) if (c.issueId === issueId && c.isCurrent) c.isCurrent = false;
        const a: CauseAssessment = { ...rest, causalProcessStepId: input.causalProcessStepId ?? null, supersedesId: input.supersedesId ?? null, id: this.nextId("CAUSE"), issueId, assessedBy: this.actor, assessedAt: this.now(), isCurrent };
        this.store.causes.push(a);
        if (isCurrent) issue.confirmedCauseId = a.id;
        else if (input.supersedesId === issue.confirmedCauseId && input.state === "rejected") issue.confirmedCauseId = null;
        issue.version += 1;
        issue.updatedAt = a.assessedAt;
        this.addAudit(issueId, "cause_recorded", `${input.state} cause: ${input.causeType}`, null, null, a.id);
        return a;
      }),
    );
  }

  createFix(issueId: string, input: FixRevisionInput): FixRevision {
    const issue = this.issueOrThrow(issueId);
    return clone(
      this.idempotent(input.idempotencyKey, input, () => {
        this.checkRefs({ evidenceIds: input.evidenceIds, processStepIds: [input.applicability.processStepId] });
        if (input.sourceFixRevisionId && !this.store.fixes.some((f) => f.id === input.sourceFixRevisionId)) throw new MockError("INVALID_REFERENCE", `Source fix ${input.sourceFixRevisionId} not found.`);
        const version = this.store.fixes.filter((f) => f.issueId === issueId).length + 1;
        const { idempotencyKey: _k, ...rest } = input;
        const f: FixRevision = { ...rest, sourceFixRevisionId: input.sourceFixRevisionId ?? null, workInstructionRef: input.workInstructionRef ?? null, evidenceIds: input.evidenceIds ?? [], id: this.nextId("FIX"), issueId, version, state: "proposed", createdBy: this.actor, createdAt: this.now(), appliedAt: null };
        this.store.fixes.push(f);
        issue.version += 1;
        issue.updatedAt = f.createdAt;
        this.addAudit(issueId, "fix_created", `Fix v${version} proposed${f.sourceFixRevisionId ? ` from ${f.sourceFixRevisionId}` : ""}`, null, null, f.id);
        return f;
      }),
    );
  }

  recordVerification(issueId: string, input: VerificationInput): Verification {
    const issue = this.issueOrThrow(issueId);
    return clone(
      this.idempotent(input.idempotencyKey, input, () => {
        const fix = this.store.fixes.find((f) => f.id === input.fixRevisionId && f.issueId === issueId);
        if (!fix) throw new MockError("INVALID_REFERENCE", `Fix ${input.fixRevisionId} does not belong to issue ${issueId}.`);
        this.checkRefs({ evidenceIds: input.evidenceIds });
        const evidenceIds = [...input.evidenceIds, ...this.createEvidence(input.newEvidence ?? [])];
        const at = this.now();
        if (fix.state === "proposed") {
          fix.state = "applied";
          fix.appliedAt = at;
          this.addAudit(issueId, "fix_applied", `Fix v${fix.version} marked applied (verification recorded)`, null, null, fix.id);
        }
        const v: Verification = { id: this.nextId("VER"), issueId, fixRevisionId: fix.id, outcome: input.outcome, method: input.method, resultNotes: input.resultNotes, evidenceIds, verifiedBy: this.actor, verifiedAt: at };
        this.store.verifications.push(v);
        if (input.outcome === "pass") fix.state = "verified";
        issue.version += 1;
        issue.updatedAt = at;
        this.addAudit(issueId, "verification_recorded", `Verification ${input.outcome} for fix v${fix.version}`, null, null, v.id);
        return v;
      }),
    );
  }

  transition(issueId: string, command: TransitionCommand): Issue {
    const issue = this.issueOrThrow(issueId);
    return clone(
      this.idempotent(command.idempotencyKey, command, () => {
        if (command.expectedVersion !== issue.version) throw new MockError("STALE_VERSION", `Issue ${issueId} is at version ${issue.version}, not ${command.expectedVersion}. Reload before changing status.`, { currentVersion: issue.version });
        const rule = TRANSITIONS[command.action];
        if (!rule.from.includes(issue.status)) throw new MockError("INVALID_TRANSITION", `Cannot ${command.action.replace("_", " ")} an issue that is ${issue.status.replace("_", " ")}.`, { from: issue.status, allowed: rule.from });
        const from = issue.status;
        if (command.action === "close") {
          if (!command.fixRevisionId) throw new MockError("VERIFICATION_REQUIRED", "Closing requires the applied fix revision whose verification passed.");
          const fix = this.store.fixes.find((f) => f.id === command.fixRevisionId && f.issueId === issueId);
          if (!fix) throw new MockError("INVALID_REFERENCE", `Fix ${command.fixRevisionId} does not belong to this issue.`);
          const passed = this.store.verifications.some((v) => v.fixRevisionId === fix.id && v.outcome === "pass");
          if (!passed) throw new MockError("VERIFICATION_REQUIRED", `Fix v${fix.version} has no passed verification. Record a passed verification before closing.`);
          issue.currentFixRevisionId = fix.id;
        }
        if (command.action === "request_verification" && command.fixRevisionId) {
          const fix = this.store.fixes.find((f) => f.id === command.fixRevisionId && f.issueId === issueId);
          if (!fix) throw new MockError("INVALID_REFERENCE", `Fix ${command.fixRevisionId} does not belong to this issue.`);
          if (fix.state === "proposed") {
            fix.state = "applied";
            fix.appliedAt = this.now();
            this.addAudit(issueId, "fix_applied", `Fix v${fix.version} applied`, null, null, fix.id);
          }
          issue.currentFixRevisionId = fix.id;
        }
        issue.status = rule.to;
        issue.version += 1;
        issue.updatedAt = this.now();
        this.addAudit(issueId, "transition", `${command.action.replace("_", " ")}${command.reason ? `: ${command.reason}` : ""}`, from, rule.to, command.fixRevisionId ?? null);
        return issue;
      }),
    );
  }

  // ---- assembly trace (frozen TraceResult DTO; mock evaluation over the in-memory records) ----

  runTrace(request: TraceRequest): TraceResult {
    const { root, scope } = request;
    const asOf = scope.configurationAsOf;
    const active = (i: Installation) => i.installedAt <= asOf && (i.removedAt === null || i.removedAt > asOf);
    const overlaps = (i: Installation) => i.installedAt <= asOf && (i.removedAt === null || i.removedAt > scope.historyFrom);
    const all = [...this.store.entities.values()];
    const rootMatch = (e: EntityRecord) => {
      const o = e.origin;
      if (e.kind === "vehicle" || !o) return false;
      if (root.kind === "component_serial") return e.id === root.id;
      if (root.kind === "supplier_batch") return o.sourcingType === "supplier" && (o.supplierBatchCode === root.id || o.productionLotId === root.id);
      return o.sourcingType === "in_house" && (o.manufacturingLotCode === root.id || o.productionLotId === root.id);
    };
    const roots = all.filter(rootMatch);
    const paths: TraceResult["paths"] = [];
    const climb = (startId: string, pred: (i: Installation) => boolean): string | null => {
      let cur = startId;
      for (let hops = 0; hops < 6; hops++) {
        const link = this.store.installations.find((i) => i.childId === cur && pred(i));
        if (!link) return null;
        paths.push({ relationshipId: link.id, fromId: link.childId, toId: link.parentId, kind: "INSTALLED_IN", validFrom: link.installedAt, validTo: link.removedAt, evidenceIds: link.evidenceIds });
        const parent = this.store.entities.get(link.parentId);
        if (!parent) return null;
        if (parent.kind === "vehicle") return parent.id;
        cur = parent.id;
      }
      return null;
    };
    const vehicleRows = new Map<string, TraceRow>();
    const rowFor = (v: EntityRecord): TraceRow => {
      const existing = vehicleRows.get(v.id);
      if (existing) return existing;
      const shp = seed.shipments.find((x) => x.vehicleId === v.id);
      const row: TraceRow = { entityId: v.id, entityKind: "vehicle", partNumber: v.partNumber, serialNumber: v.serialNumber, buildId: v.vehicle?.buildId ?? v.id, vin: v.vehicle?.vin ?? null, locationState: v.locationState, customerId: shp?.customerId ?? null, shipmentLineIds: shp ? [shp.id] : [], currentContainment: false, historicalContainment: false, hasUnresolvedEvidence: false, engineeringReview: "not_recorded", evidenceIds: [], issueIds: [...this.store.issues.values()].filter((i) => i.entityIds.includes(v.id)).map((i) => i.id) };
      vehicleRows.set(v.id, row);
      return row;
    };
    const componentRows: TraceRow[] = [];
    let loose = 0;
    let quarantined = 0;
    for (const c of roots) {
      const rootId = root.kind === "component_serial" ? c.id : (c.origin?.productionLotId ?? root.id);
      if (root.kind !== "component_serial") paths.push({ relationshipId: `REL-${rootId}-${c.id}`, fromId: rootId, toId: c.id, kind: root.kind === "supplier_batch" ? "BATCH_HAS_COMPONENT" : "LOT_PRODUCED_COMPONENT", validFrom: null, validTo: null, evidenceIds: c.origin?.evidenceIds ?? [] });
      const cur = climb(c.id, active);
      const hist = climb(c.id, overlaps);
      if (c.locationState === "quarantine") quarantined += 1;
      else if (!cur && !hist) loose += 1;
      componentRows.push({ entityId: c.id, entityKind: c.kind === "subassembly" ? "subassembly" : "component", partNumber: c.partNumber, serialNumber: c.serialNumber, buildId: null, vin: null, locationState: c.locationState, customerId: null, shipmentLineIds: [], currentContainment: Boolean(cur), historicalContainment: Boolean(hist), hasUnresolvedEvidence: false, engineeringReview: cur ? "not_recorded" : hist ? "pending" : "not_recorded", evidenceIds: c.origin?.evidenceIds ?? [], issueIds: [...this.store.issues.values()].filter((i) => i.entityIds.includes(c.id)).map((i) => i.id) });
      if (cur) rowFor(this.store.entities.get(cur)!).currentContainment = true;
      if (hist) {
        const r = rowFor(this.store.entities.get(hist)!);
        r.historicalContainment = true;
        if (!cur) r.engineeringReview = "pending";
      }
    }
    // Unresolved: tracked part family with an unknown origin anywhere in scope.
    const issues: ReviewIssue[] = [];
    let unresolvedOnly = 0;
    for (const e of all) {
      if (e.kind === "vehicle" || e.partNumber !== scope.trackedPartNumber || e.origin?.sourcingType !== "unknown") continue;
      const v = climb(e.id, active);
      if (!v) continue;
      const r = rowFor(this.store.entities.get(v)!);
      r.hasUnresolvedEvidence = true;
      if (!r.currentContainment) unresolvedOnly += 1;
      issues.push({ id: `RI-${e.id}`, code: "UNKNOWN_ORIGIN", severity: "warning", message: `${e.id} (${e.partNumber}) has no recorded origin; cannot confirm or exclude root membership.`, entityIds: [e.id, v], evidenceIds: [] });
    }
    const vrows = [...vehicleRows.values()];
    const current = vrows.filter((r) => r.currentContainment);
    const customerIds = new Set(current.map((r) => r.customerId).filter((x): x is string => Boolean(x)));
    const counts = {
      currentOnsiteVehicleCount: current.filter((r) => r.locationState !== "shipped").length,
      currentShippedVehicleCount: current.filter((r) => r.locationState === "shipped").length,
      currentCustomerCount: customerIds.size,
      looseCandidateComponentCount: loose,
      quarantinedComponentCount: quarantined,
      historicalOnlyVehicleCount: vrows.filter((r) => r.historicalContainment && !r.currentContainment).length,
      unresolvedOnlyVehicleCount: unresolvedOnly,
    };
    const evidenceIds = new Set<string>([...componentRows.flatMap((r) => r.evidenceIds), ...paths.flatMap((p) => p.evidenceIds)]);
    return clone({
      contractVersion: "assembly-quality-v4",
      runId: this.nextId("RUN"),
      revisionId: request.revisionId,
      root,
      createdAt: this.now(),
      engineVersion: "ui-mock-0.1",
      dataHash: seed.pseudoHash(JSON.stringify(root) + asOf).slice(0, 32),
      scope,
      executionStatus: "completed",
      dataCompleteness: issues.length ? "gaps_found" : "reviewed_scope",
      counts,
      rows: [...vrows, ...componentRows],
      issues,
      evidence: [...evidenceIds].map((id) => this.store.evidence.get(id)).filter((e): e is Evidence => Boolean(e)),
      paths,
      customers: seed.customers.filter((c) => vrows.some((r) => r.customerId === c.id)).map((c) => ({ id: c.id, name: c.name })),
      ...(request.incidentId ? { incidentId: request.incidentId } : {}),
    });
  }

  // ---- similar resolutions (deterministic, explainable) ----

  findSimilarResolutions(issueId: string): SimilarResolutions {
    const issue = this.issueOrThrow(issueId);
    const family = (code: string | null) => this.store.catalog.defectCodes.find((d) => d.id === code)?.family ?? null;
    const partFamily = (pn: string | null) => (pn ? pn.split("-").slice(0, 2).join("-") : null);
    const targetCause = this.store.causes.find((c) => c.id === issue.confirmedCauseId) ?? null;
    const results: SimilarResolution[] = [];
    for (const fix of this.store.fixes) {
      if (fix.issueId === issueId) continue;
      const src = this.store.issues.get(fix.issueId);
      if (!src) continue;
      const passed = this.store.verifications.filter((v) => v.fixRevisionId === fix.id && v.outcome === "pass").sort((a, b) => (a.verifiedAt < b.verifiedAt ? 1 : -1))[0];
      const reasons: string[] = [];
      const warnings: string[] = [];
      let score = 0;
      if (issue.defectCode && issue.defectCode === src.defectCode) {
        reasons.push(`same defect code ${issue.defectCode}`);
        score += 3;
      } else if (issue.defectCode && family(issue.defectCode) && family(issue.defectCode) === family(src.defectCode)) {
        reasons.push(`same defect family "${family(issue.defectCode)}" (${src.defectCode})`);
        score += 1;
      }
      const fixPart = fix.applicability.partNumber ?? src.partNumber;
      if (issue.partNumber && fixPart === issue.partNumber) {
        reasons.push(`same part number ${issue.partNumber}`);
        score += 2;
        const fixRev = fix.applicability.partRevision ?? src.partRevision;
        if (issue.partRevision && fixRev === issue.partRevision) {
          reasons.push(`same part revision ${issue.partRevision}`);
          score += 1;
        } else if (issue.partRevision && fixRev && fixRev !== issue.partRevision) warnings.push(`part revision differs (${issue.partRevision} vs ${fixRev}): engineering review required`);
      } else if (issue.partNumber && fixPart && partFamily(fixPart) === partFamily(issue.partNumber)) {
        reasons.push(`same part family ${partFamily(issue.partNumber)} (fix applies to ${fixPart})`);
        score += 1;
        warnings.push(`part number differs (${issue.partNumber} vs ${fixPart}): confirm the affected part before reuse`);
      }
      const fixProcess = fix.applicability.processStepId ?? src.processStepId;
      if (issue.processStepId && fixProcess === issue.processStepId) {
        reasons.push(`same process step ${issue.processStepId}`);
        score += 1;
      }
      const srcCause = this.store.causes.find((c) => c.id === src.confirmedCauseId);
      if (targetCause && srcCause && targetCause.causeType === srcCause.causeType) {
        reasons.push(`same confirmed cause type ${srcCause.causeType}`);
        score += 1;
      } else if (!targetCause && srcCause) warnings.push(`prior confirmed cause was ${srcCause.causeType}; this issue has no confirmed cause yet`);
      const supplierOverlap = issue.linkedSupplierIds.filter((s) => src.linkedSupplierIds.includes(s));
      if (supplierOverlap.length) reasons.push(`context only: shared linked supplier ${supplierOverlap.join(", ")} (not a match reason for cause)`);
      if (score < 2) continue;
      if (!passed) warnings.push("no passed verification recorded for this fix: unverified suggestion");
      warnings.push(...fix.applicability.limitations);
      results.push({ sourceIssueId: src.id, sourceIssueTitle: src.title, sourceFixRevisionId: fix.id, fixSummary: fix.summary, matchReasons: reasons, applicabilityWarnings: warnings, verificationId: passed?.id ?? "NONE", verifiedAt: passed?.verifiedAt ?? fix.createdAt, evidenceIds: [...fix.evidenceIds, ...(passed?.evidenceIds ?? [])], rank: (passed ? 0 : 100) + (10 - Math.min(score, 9)) });
    }
    results.sort((a, b) => a.rank - b.rank);
    return clone({ issueId, results, queryExplanation: `Deterministic match on defect code/family, part number/revision, process step and confirmed cause type; verified fixes rank first. Evaluated over ${this.store.fixes.length} recorded fixes.` });
  }

  // ---- insights ----

  getInsights(filter: InsightsFilter): Insights {
    const cause = (i: Issue) => this.store.causes.find((c) => c.id === i.confirmedCauseId && c.state === "confirmed" && c.isCurrent) ?? null;
    let items = [...this.store.issues.values()];
    if (filter.detectedFrom) items = items.filter((i) => i.detectedAt >= filter.detectedFrom!);
    if (filter.detectedToExclusive) items = items.filter((i) => i.detectedAt < filter.detectedToExclusive!);
    if (filter.supplierId) items = items.filter((i) => i.linkedSupplierIds.includes(filter.supplierId!) || cause(i)?.responsibleSupplierId === filter.supplierId);
    if (filter.partNumber) items = items.filter((i) => i.partNumber === filter.partNumber);
    if (filter.defectCode) items = items.filter((i) => i.defectCode === filter.defectCode);
    if (filter.stationId) items = items.filter((i) => i.detectionStationId === filter.stationId || cause(i)?.causalStationId === filter.stationId);
    if (filter.processStepId) items = items.filter((i) => i.processStepId === filter.processStepId || cause(i)?.causalProcessStepId === filter.processStepId);
    if (filter.status?.length) items = items.filter((i) => filter.status!.includes(i.status));
    if (filter.severity?.length) items = items.filter((i) => filter.severity!.includes(i.severity));

    const bucket = (list: Array<{ id: string; label: string }>, pick: (i: Issue) => string | null): CountBucket[] =>
      list
        .map((b) => ({ ...b, issueIds: items.filter((i) => pick(i) === b.id).map((i) => i.id) }))
        .filter((b) => b.issueIds.length > 0)
        .map((b) => ({ id: b.id, label: b.label, issueCount: b.issueIds.length, issueIds: b.issueIds }));

    const teams = this.store.catalog.teams
      .map((t) => {
        const reported = items.filter((i) => i.reportingTeamId === t.id).map((i) => i.id);
        const assignedOpen = items.filter((i) => i.assignedTeamId === t.id && i.status !== "closed").map((i) => i.id);
        const confirmed = items.filter((i) => cause(i)?.responsibleTeamId === t.id).map((i) => i.id);
        return { teamId: t.id, teamName: t.name, reportedIssueCount: reported.length, assignedOpenCount: assignedOpen.length, confirmedCauseIssueCount: confirmed.length, reportedIssueIds: reported, assignedOpenIssueIds: assignedOpen, confirmedCauseIssueIds: confirmed };
      })
      .filter((t) => t.reportedIssueCount + t.assignedOpenCount + t.confirmedCauseIssueCount > 0);

    const suppliers = this.store.catalog.suppliers
      .map((s) => {
        const linked = items.filter((i) => i.linkedSupplierIds.includes(s.id)).map((i) => i.id);
        const confirmedIssues = items.filter((i) => cause(i)?.responsibleSupplierId === s.id);
        const units = new Set<string>();
        for (const i of confirmedIssues) for (const e of i.entityIds) if (this.store.entities.get(e)?.origin?.supplierId === s.id) units.add(e);
        const cohort = seed.supplierCohorts[s.id];
        const complete = Boolean(cohort?.complete);
        return { supplierId: s.id, supplierName: s.name, linkedIssueCount: linked.length, confirmedIssueCount: confirmedIssues.length, distinctAffectedUnitCount: units.size, inspectedUnitCount: complete ? cohort!.inspectedUnitCount : null, cohortComplete: complete, affectedUnitRate: complete && cohort!.inspectedUnitCount > 0 ? Number((units.size / cohort!.inspectedUnitCount).toFixed(4)) : null, linkedIssueIds: linked, confirmedIssueIds: confirmedIssues.map((i) => i.id) };
      })
      .filter((s) => s.linkedIssueCount + s.confirmedIssueCount > 0);

    const c = this.store.catalog;
    const causeTypeLabels = ["supplier_component", "in_house_manufacturing", "assembly_process", "design", "calibration", "handling", "unknown"].map((id) => ({ id, label: id.replace(/_/g, " ") }));
    const families = [...new Set(c.defectCodes.map((d) => d.family).filter((f): f is string => Boolean(f)))].map((f) => ({ id: f.replace(/\s+/g, "_").toUpperCase(), label: f }));
    const familyOf = (i: Issue) => {
      const f = c.defectCodes.find((d) => d.id === i.defectCode)?.family;
      return f ? f.replace(/\s+/g, "_").toUpperCase() : null;
    };
    const reusedFixCount = this.store.fixes.filter((f) => f.sourceFixRevisionId && items.some((i) => i.id === f.issueId)).length;
    const reopenedIssueCount = new Set(this.store.audit.filter((a) => a.kind === "transition" && a.toStatus === "in_progress" && a.fromStatus === "closed" && items.some((i) => i.id === a.issueId)).map((a) => a.issueId)).size;
    const notes = [
      "Counts are distinct issue ids, not defective units.",
      "Supplier rate = distinct confirmed-affected units / inspected units in a complete cohort; N/A when the cohort is missing or incomplete.",
      ...Object.values(seed.supplierCohorts).map((x) => x.note),
    ];
    if (filter.teamRole) notes.push(`teamRole=${filter.teamRole} is applied by the UI when opening a team metric; counts above stay role-separated.`);
    return clone({
      contractVersion: "assembly-quality-v4",
      filter,
      totalIssueCount: items.length,
      openIssueCount: items.filter((i) => i.status !== "closed").length,
      teams,
      suppliers,
      detectionStations: bucket(c.stations.map((s) => ({ id: s.id, label: s.name })), (i) => i.detectionStationId),
      causalProcessSteps: bucket(c.processSteps.map((p) => ({ id: p.id, label: p.name })), (i) => cause(i)?.causalProcessStepId ?? null),
      causeTypes: bucket(causeTypeLabels, (i) => cause(i)?.causeType ?? null),
      defectFamilies: bucket(families, familyOf),
      reusedFixCount,
      reopenedIssueCount,
      notes,
    });
  }
}
