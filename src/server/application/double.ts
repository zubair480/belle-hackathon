/**
 * Typed in-memory DomainServices DOUBLE for route development and API tests.
 *
 * It is NOT Codey's graph implementation and is never used as a fallback for a failing real
 * service. It answers from the shared reference fixtures (docs/research/reference_output) so the
 * import -> trace -> late evidence -> compare loop can be exercised end-to-end with the frozen
 * DTOs. Quantities come straight from the reference output; the double does not traverse a graph.
 *
 * Selected only by the explicit setting RECALL_SERVICES=double (see registry.ts).
 */
import { createHash } from "node:crypto";
import {
  DEMO,
  DomainError,
  IMPORT_FILE_NAMES,
  ISSUE_CODES,
  type AcceptImportInput,
  type CompareTracesInput,
  type DomainServices,
  type Evidence,
  type GetTraceInput,
  type ImportInput,
  type ImportPreview,
  type PreviewLateEvidenceInput,
  type RequestContext,
  type ReviewIssue,
  type RevisionInfo,
  type TraceComparison,
  type TracePath,
  type TraceRequest,
  type TraceResult,
  type TraceRow,
} from "@/contracts/recall";
import fixture1 from "../../../docs/research/reference_output/fixture_revision_1.json";
import fixture2 from "../../../docs/research/reference_output/fixture_revision_2.json";
import reference1 from "../../../docs/research/reference_output/trace_revision_1.json";
import reference2 from "../../../docs/research/reference_output/trace_revision_2.json";

type FixtureEvent = {
  id: string;
  kind: string;
  event_time: string;
  recorded_at: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  unit: string;
  evidence: string;
};
type Fixture = {
  workspace_id: string;
  revision: number;
  kinds: Record<string, string>;
  opening: Record<string, number>;
  events: FixtureEvent[];
  shipments: Array<{ id: string; lot: string; qty: number; customer: string; brand: string }>;
  disposals: Array<{ id: string; lot: string; qty: number }>;
  unknown_origins: string[];
  provisional_opening_note: string;
};
type ReferenceRun = {
  data_sha256: string;
  known_path_lots: string[];
  known_path: { onsite_kg: number; onsite_positions_kg: Record<string, number>; shipped_kg: number; shipment_line_ids: string[]; consignees: string[] };
  unresolved_only: { onsite_kg: number; onsite_positions_kg: Record<string, number>; shipped_kg: number; consignees: string[] };
  origin_gap_lots: string[];
  no_recorded_path_finished_lots: string[];
  already_disposed_kg: number;
};

type FixtureKey = "revision1" | "revision2";
const FIXTURES: Record<FixtureKey, { data: Fixture; reference: ReferenceRun }> = {
  revision1: { data: fixture1 as unknown as Fixture, reference: reference1 as ReferenceRun },
  revision2: { data: fixture2 as unknown as Fixture, reference: reference2 as ReferenceRun },
};

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const consigneeId = (name: string) => `C-${name.replace(/[^A-Za-z0-9]/g, "")}`;

export type DoubleFailure = { method: keyof DomainServices; error: Error; delayMs?: number };

export type ServiceDoubleOptions = {
  /** Reject the named method with the given error (e.g. a DomainError("TIMEOUT", ...)). */
  failures?: DoubleFailure[];
  /** Artificial latency for every call, for timeout tests. */
  delayMs?: number;
  /** Return an incomplete run (traversal budget exceeded) for these root lots. */
  incompleteForRoots?: string[];
  now?: () => string;
};

type RevisionRecord = RevisionInfo & { fixture: FixtureKey; sequence: number; sourceHashes: string[] };
type PreviewRecord = ImportPreview & { fixture: FixtureKey; consumed: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createServiceDouble(options: ServiceDoubleOptions = {}): DomainServices & {
  /** Test/dev helper: returns internal counters. */
  _state(): { revisions: number; previews: number; runs: number };
} {
  const now = options.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
  const revisions = new Map<string, RevisionRecord>();
  const previews = new Map<string, PreviewRecord>();
  const runs = new Map<string, TraceResult>();
  const counters = new Map<string, number>();
  const nextId = (prefix: string) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${n}`;
  };

  async function gate(method: keyof DomainServices): Promise<void> {
    if (options.delayMs) await sleep(options.delayMs);
    const failure = options.failures?.find((f) => f.method === method);
    if (failure) {
      if (failure.delayMs) await sleep(failure.delayMs);
      throw failure.error;
    }
  }

  function assertWorkspace(ctx: RequestContext): void {
    if (ctx.workspaceId !== DEMO.workspaceId) {
      throw new DomainError("FORBIDDEN", "Workspace is not the synthetic demo workspace.");
    }
  }

  function latestRevision(): RevisionRecord | null {
    let latest: RevisionRecord | null = null;
    for (const r of revisions.values()) if (!latest || r.sequence > latest.sequence) latest = r;
    return latest;
  }

  function fixtureIssues(key: FixtureKey): ReviewIssue[] {
    const { data } = FIXTURES[key];
    const issues: ReviewIssue[] = [];
    for (const lot of data.unknown_origins) {
      const descendants = data.events.filter((e) => lot in e.inputs).flatMap((e) => Object.keys(e.outputs));
      issues.push({
        id: `ISSUE-MISSING-ORIGIN-${lot}`,
        code: ISSUE_CODES.MISSING_ORIGIN,
        severity: "warning",
        message: `Lot ${lot} has no recorded origin. Its known descendants (${descendants.join(", ")}) are review candidates, not cleared lots.`,
        lotIds: [lot, ...descendants],
        evidenceIds: [`OPENING-${lot}`],
      });
      issues.push({
        id: `ISSUE-PROVISIONAL-${lot}`,
        code: ISSUE_CODES.PROVISIONAL_OPENING,
        severity: "warning",
        message: data.provisional_opening_note,
        lotIds: [lot],
        evidenceIds: [`OPENING-${lot}`],
      });
    }
    return issues;
  }

  function buildEvidence(key: FixtureKey): Evidence[] {
    const { data } = FIXTURES[key];
    const evidence: Evidence[] = [];
    for (const e of data.events) {
      const text = JSON.stringify(e);
      evidence.push({ id: e.evidence, sourceName: IMPORT_FILE_NAMES.events, sourceHash: sha256(text), locator: `event:${e.id}`, text });
    }
    for (const s of data.shipments) {
      const text = JSON.stringify(s);
      evidence.push({ id: `SHIP-${s.id}`, sourceName: IMPORT_FILE_NAMES.shipments, sourceHash: sha256(text), locator: `line:${s.id}`, text });
    }
    for (const [lot, qty] of Object.entries(data.opening)) {
      const text = JSON.stringify({ lot, opening_kg: qty, provisional: data.unknown_origins.includes(lot) });
      evidence.push({ id: `OPENING-${lot}`, sourceName: IMPORT_FILE_NAMES.lots, sourceHash: sha256(text), locator: `lot:${lot}`, text });
    }
    for (const d of data.disposals) {
      const text = JSON.stringify(d);
      evidence.push({ id: `DISPOSAL-${d.id}`, sourceName: IMPORT_FILE_NAMES.movements, sourceHash: sha256(text), locator: `movement:${d.id}`, text });
    }
    return evidence;
  }

  /** Closing stock per lot from the fixture ledger (double only; the real engine is Codey's). */
  function closingStock(data: Fixture): Record<string, number> {
    const balance: Record<string, number> = { ...data.opening };
    for (const lot of Object.keys(data.kinds)) balance[lot] ??= 0;
    for (const e of data.events) {
      for (const [lot, q] of Object.entries(e.inputs)) balance[lot] = (balance[lot] ?? 0) - q;
      for (const [lot, q] of Object.entries(e.outputs)) balance[lot] = (balance[lot] ?? 0) + q;
    }
    for (const s of data.shipments) balance[s.lot] = (balance[s.lot] ?? 0) - s.qty;
    for (const d of data.disposals) balance[d.lot] = (balance[d.lot] ?? 0) - d.qty;
    return balance;
  }

  function buildRun(revision: RevisionRecord, request: TraceRequest, runId: string): TraceResult {
    const { data, reference } = FIXTURES[revision.fixture];
    const known = new Set(reference.known_path_lots);
    const unresolved = new Set(reference.origin_gap_lots);
    const stock = closingStock(data);
    const issues = fixtureIssues(revision.fixture);
    const evidence = buildEvidence(revision.fixture);

    const paths: TracePath[] = [];
    for (const e of data.events) {
      for (const input of Object.keys(e.inputs)) {
        if (!known.has(input) && !unresolved.has(input)) continue;
        for (const output of Object.keys(e.outputs)) {
          paths.push({ inputLotId: input, eventId: e.id, outputLotId: output, evidenceIds: [e.evidence] });
        }
      }
    }

    const cohort = new Set<string>([...known, ...unresolved]);
    for (const [lot, kind] of Object.entries(data.kinds)) if (kind === "finished") cohort.add(lot);

    const rows: TraceRow[] = [...cohort].sort().map((lotId) => {
      const lines = data.shipments.filter((s) => s.lot === lotId);
      const producedBy = data.events.filter((e) => lotId in e.outputs).map((e) => e.evidence);
      const rowIssues = issues.filter((i) => i.lotIds.includes(lotId)).map((i) => i.id);
      const openingEvidence = lotId in data.opening ? [`OPENING-${lotId}`] : [];
      return {
        lotId,
        productLabel: `${data.kinds[lotId] ?? "unknown"} lot ${lotId}`,
        brandLabel: lines[0]?.brand ?? null,
        onsiteKg: Math.max(0, stock[lotId] ?? 0),
        shippedKg: lines.reduce((n, l) => n + l.qty, 0),
        shipmentLineIds: lines.map((l) => l.id),
        consigneeIds: [...new Set(lines.map((l) => consigneeId(l.customer)))],
        knownMaterialPath: known.has(lotId),
        hasUnresolvedEvidence: unresolved.has(lotId),
        evidenceIds: [...openingEvidence, ...producedBy, ...lines.map((l) => `SHIP-${l.id}`)],
        issueIds: rowIssues,
      };
    });

    const consigneeNames = new Set<string>();
    for (const s of data.shipments) if (known.has(s.lot) || unresolved.has(s.lot)) consigneeNames.add(s.customer);

    const incomplete = request.rootLotIds.some((r) => options.incompleteForRoots?.includes(r));
    if (incomplete) {
      issues.push({
        id: "ISSUE-TRAVERSAL-BUDGET",
        code: ISSUE_CODES.TRAVERSAL_BUDGET_EXCEEDED,
        severity: "blocking",
        message: "Traversal budget exceeded; results below are partial and must not be read as complete.",
        lotIds: request.rootLotIds,
        evidenceIds: [],
      });
    }

    return {
      runId,
      revisionId: revision.revisionId,
      rootLotIds: [...request.rootLotIds],
      createdAt: now(),
      engineVersion: "service-double-1",
      dataHash: revision.dataHash,
      scope: structuredClone(request.scope),
      executionStatus: incomplete ? "incomplete" : "completed",
      dataCompleteness: reference.origin_gap_lots.length > 0 ? "gaps_found" : "reviewed_scope",
      known: {
        onsiteKg: reference.known_path.onsite_kg,
        shippedKg: reference.known_path.shipped_kg,
        consigneeCount: reference.known_path.consignees.length,
      },
      unresolvedOnly: { onsiteKg: reference.unresolved_only.onsite_kg, shippedKg: reference.unresolved_only.shipped_kg },
      disposedKg: reference.already_disposed_kg,
      rows,
      issues,
      evidence,
      paths,
      consignees: [...consigneeNames].sort().map((name) => ({ id: consigneeId(name), name })),
      ...(request.incidentId ? { incidentId: request.incidentId } : {}),
    };
  }

  const services: DomainServices = {
    async previewImport(ctx, input: ImportInput): Promise<ImportPreview> {
      await gate("previewImport");
      assertWorkspace(ctx);
      const expected = Object.values(IMPORT_FILE_NAMES);
      const received = input.files.map((f) => f.name);
      const missing = expected.filter((n) => !received.includes(n));
      const sourceHashes = input.files.map((f) => sha256(f.text));
      const issues: ReviewIssue[] = [];
      if (input.baseRevisionId && !revisions.has(input.baseRevisionId)) {
        throw new DomainError("NOT_FOUND", `Base revision ${input.baseRevisionId} does not exist.`);
      }
      for (const name of missing) {
        const blocking = name === IMPORT_FILE_NAMES.events || name === IMPORT_FILE_NAMES.lots;
        issues.push({
          id: `ISSUE-COVERAGE-${name}`,
          code: ISSUE_CODES.COVERAGE_GAP,
          severity: blocking ? "blocking" : "warning",
          message: `${name} was expected but not received.`,
          lotIds: [],
          evidenceIds: [],
        });
      }
      for (const f of input.files) {
        if (/CONFLICTING-RECORD/.test(f.text)) {
          issues.push({
            id: `ISSUE-CONFLICT-${f.name}`,
            code: ISSUE_CODES.CONFLICTING_EVENT_ID,
            severity: "blocking",
            message: `${f.name} reuses an event ID with different content.`,
            lotIds: [],
            evidenceIds: [],
          });
        }
      }
      const duplicateOf = [...revisions.values()].find(
        (r) => r.sourceHashes.length === sourceHashes.length && r.sourceHashes.every((h) => sourceHashes.includes(h)),
      );
      if (duplicateOf) {
        issues.push({
          id: `ISSUE-ALREADY-IMPORTED-${duplicateOf.revisionId}`,
          code: ISSUE_CODES.ALREADY_IMPORTED,
          severity: "warning",
          message: `Identical source files were already accepted as ${duplicateOf.revisionId}.`,
          lotIds: [],
          evidenceIds: [],
        });
      }
      issues.push(...fixtureIssues("revision1"));
      const preview: PreviewRecord = {
        previewId: nextId("preview"),
        baseRevisionId: input.baseRevisionId ?? null,
        canAccept: !issues.some((i) => i.severity === "blocking"),
        issues,
        sourceHashes,
        coverage: { expected, received, missing },
        fixture: "revision1",
        consumed: false,
      };
      previews.set(preview.previewId, preview);
      const { fixture: _f, consumed: _c, ...dto } = preview;
      return structuredClone(dto);
    },

    async previewLateEvidence(ctx, input: PreviewLateEvidenceInput): Promise<ImportPreview> {
      await gate("previewLateEvidence");
      assertWorkspace(ctx);
      const base = revisions.get(input.baseRevisionId);
      if (!base) throw new DomainError("NOT_FOUND", `Revision ${input.baseRevisionId} does not exist.`);
      if (base.fixture !== "revision1") {
        throw new DomainError("PREVIEW_REJECTED", "The prepared late evidence has already been applied to this revision.");
      }
      const late = FIXTURES.revision2.data.events.find((e) => e.id === DEMO.lateEvidenceEventId);
      const lateText = JSON.stringify(late);
      const preview: PreviewRecord = {
        previewId: nextId("preview"),
        baseRevisionId: base.revisionId,
        canAccept: true,
        issues: [
          {
            id: "ISSUE-LATE-SUPERSEDES-PROVISIONAL",
            code: ISSUE_CODES.PROVISIONAL_OPENING,
            severity: "warning",
            message: `Late batch sheet ${DEMO.lateEvidenceEventId} (event 2026-09-05, recorded 2026-09-12) consumes WIP101 10 kg and CLEAN-R 10 kg to produce R-UNK 20 kg. It supersedes R-UNK's provisional 20 kg opening balance instead of adding to it.`,
            lotIds: ["R-UNK", "WIP101", "CLEAN-R"],
            evidenceIds: [late?.evidence ?? "SYNTHETIC-LATE-BATCH-SHEET"],
          },
        ],
        sourceHashes: [sha256(lateText)],
        coverage: { expected: [IMPORT_FILE_NAMES.events], received: [IMPORT_FILE_NAMES.events], missing: [] },
        fixture: "revision2",
        consumed: false,
      };
      previews.set(preview.previewId, preview);
      const { fixture: _f, consumed: _c, ...dto } = preview;
      return structuredClone(dto);
    },

    async acceptImport(ctx, input: AcceptImportInput): Promise<RevisionInfo> {
      await gate("acceptImport");
      assertWorkspace(ctx);
      const preview = previews.get(input.previewId);
      if (!preview) throw new DomainError("NOT_FOUND", `Preview ${input.previewId} does not exist.`);
      if (preview.consumed) {
        throw new DomainError("DUPLICATE_ACTION", `Preview ${input.previewId} was already accepted.`);
      }
      if (!preview.canAccept) {
        throw new DomainError("PREVIEW_REJECTED", "Preview has blocking issues and cannot be accepted.", {
          blocking: preview.issues.filter((i) => i.severity === "blocking").map((i) => i.id),
        });
      }
      const latest = latestRevision();
      if (preview.baseRevisionId !== null) {
        if (input.expectedBaseRevisionId !== preview.baseRevisionId || latest?.revisionId !== preview.baseRevisionId) {
          throw new DomainError("REVISION_MISMATCH", "Expected base revision does not match the current accepted revision.", {
            expected: input.expectedBaseRevisionId ?? null,
            current: latest?.revisionId ?? null,
          });
        }
      } else if (input.expectedBaseRevisionId !== undefined) {
        throw new DomainError("REVISION_MISMATCH", "This preview has no base revision.");
      }
      const already = preview.issues.find((i) => i.code === ISSUE_CODES.ALREADY_IMPORTED);
      if (already) {
        throw new DomainError("DUPLICATE_ACTION", already.message, { existingRevisionId: already.id.replace("ISSUE-ALREADY-IMPORTED-", "") });
      }
      preview.consumed = true;
      const record: RevisionRecord = {
        revisionId: nextId("rev"),
        acceptedAt: now(),
        dataHash: FIXTURES[preview.fixture].reference.data_sha256,
        fixture: preview.fixture,
        sequence: revisions.size + 1,
        sourceHashes: preview.sourceHashes,
      };
      revisions.set(record.revisionId, record);
      return { revisionId: record.revisionId, acceptedAt: record.acceptedAt, dataHash: record.dataHash };
    },

    async runTrace(ctx, request: TraceRequest): Promise<TraceResult> {
      await gate("runTrace");
      assertWorkspace(ctx);
      const revision = revisions.get(request.revisionId);
      if (!revision) throw new DomainError("NOT_FOUND", `Revision ${request.revisionId} does not exist.`);
      if (request.scope.siteId !== DEMO.siteId) {
        throw new DomainError("SCOPE_INVALID", `Site ${request.scope.siteId} is outside the accepted revision's coverage.`);
      }
      const { data } = FIXTURES[revision.fixture];
      for (const root of request.rootLotIds) {
        if (root === "AMBIGUOUS") {
          throw new DomainError("AMBIGUOUS_ROOT", "Root lot code matches more than one accepted supplier lot; review required.", {
            candidates: ["T17@SupplierA", "T17@SupplierB"],
          });
        }
        if (!(root in data.kinds)) throw new DomainError("NOT_FOUND", `Root lot ${root} is not in the accepted revision.`);
      }
      const run = buildRun(revision, request, nextId("run"));
      runs.set(run.runId, Object.freeze(structuredClone(run)));
      return structuredClone(run);
    },

    async getTrace(ctx, input: GetTraceInput): Promise<TraceResult> {
      await gate("getTrace");
      assertWorkspace(ctx);
      const run = runs.get(input.runId);
      if (!run) throw new DomainError("NOT_FOUND", `Run ${input.runId} does not exist.`);
      return structuredClone(run);
    },

    async compareTraces(ctx, input: CompareTracesInput): Promise<TraceComparison> {
      await gate("compareTraces");
      assertWorkspace(ctx);
      const earlier = runs.get(input.earlierRunId);
      const later = runs.get(input.laterRunId);
      if (!earlier || !later) throw new DomainError("NOT_FOUND", "One or both runs do not exist.");
      const reasons: string[] = [];
      const sameRoots = JSON.stringify([...earlier.rootLotIds].sort()) === JSON.stringify([...later.rootLotIds].sort());
      if (!sameRoots) reasons.push("Different root lots.");
      const scopeKeys = ["siteId", "eventFrom", "eventToExclusive", "inventoryAsOf"] as const;
      const scopeChanged = scopeKeys.filter((k) => earlier.scope[k] !== later.scope[k]);
      if (scopeChanged.length) reasons.push(`Scope changed: ${scopeChanged.join(", ")}.`);
      if (earlier.executionStatus !== "completed" || later.executionStatus !== "completed") {
        reasons.push("At least one run is incomplete.");
      }
      const comparable = reasons.length === 0;
      if (comparable) {
        reasons.push(
          earlier.revisionId === later.revisionId
            ? "Same data revision; identical scope."
            : `Data revision changed ${earlier.revisionId} -> ${later.revisionId}; scope unchanged.`,
        );
      }
      const knownLots = (r: TraceResult) => new Set(r.rows.filter((x) => x.knownMaterialPath).map((x) => x.lotId));
      const earlierKnown = knownLots(earlier);
      const earlierConsignees = new Set(earlier.consignees.filter((c) => earlier.rows.some((r) => r.knownMaterialPath && r.consigneeIds.includes(c.id))).map((c) => c.id));
      const laterConsignees = new Set(later.consignees.filter((c) => later.rows.some((r) => r.knownMaterialPath && r.consigneeIds.includes(c.id))).map((c) => c.id));
      const laterIssueIds = new Set(later.issues.map((i) => i.id));
      return {
        earlierRunId: earlier.runId,
        laterRunId: later.runId,
        comparable,
        reasons,
        delta: comparable
          ? {
              onsiteKg: later.known.onsiteKg - earlier.known.onsiteKg,
              shippedKg: later.known.shippedKg - earlier.known.shippedKg,
              consigneeCount: later.known.consigneeCount - earlier.known.consigneeCount,
            }
          : null,
        addedLotIds: [...knownLots(later)].filter((l) => !earlierKnown.has(l)).sort(),
        addedConsigneeIds: [...laterConsignees].filter((c) => !earlierConsignees.has(c)).sort(),
        resolvedIssueIds: earlier.issues.map((i) => i.id).filter((id) => !laterIssueIds.has(id)),
      };
    },
  };

  return Object.assign(services, {
    _state: () => ({ revisions: revisions.size, previews: previews.size, runs: runs.size }),
  });
}
