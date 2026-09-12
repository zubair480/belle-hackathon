import { describe, expect, it } from "vitest";
import {
  AlertDraftSchema,
  DEMO,
  DomainError,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ImportInputSchema,
  REFERENCE_EXPECTATIONS,
  ScopeSchema,
  TraceRequestSchema,
  TraceResultSchema,
  apiFail,
  apiOk,
  apiResponseSchema,
  isDomainError,
} from "@/contracts/recall";
import referenceRun1 from "../../docs/research/reference_output/trace_revision_1.json";
import referenceRun2 from "../../docs/research/reference_output/trace_revision_2.json";

describe("frozen contract: scope and requests", () => {
  it("accepts the shared demo scope", () => {
    expect(ScopeSchema.safeParse(DEMO.scope).success).toBe(true);
  });

  it("rejects an inverted event window", () => {
    const r = ScopeSchema.safeParse({ ...DEMO.scope, eventToExclusive: "2026-08-01T00:00:00Z" });
    expect(r.success).toBe(false);
  });

  it("rejects non-UTC timestamps", () => {
    const r = ScopeSchema.safeParse({ ...DEMO.scope, eventFrom: "2026-09-01T00:00:00+02:00" });
    expect(r.success).toBe(false);
  });

  it("requires at least one root lot and bounds identifiers", () => {
    expect(TraceRequestSchema.safeParse({ revisionId: "rev-1", rootLotIds: [], scope: DEMO.scope }).success).toBe(false);
    expect(TraceRequestSchema.safeParse({ revisionId: "rev-1", rootLotIds: ["T17"], scope: DEMO.scope }).success).toBe(true);
    expect(TraceRequestSchema.safeParse({ revisionId: "rev 1", rootLotIds: ["T17"], scope: DEMO.scope }).success).toBe(false);
  });

  it("only accepts the four controlled import file names and rejects duplicates", () => {
    const ok = ImportInputSchema.safeParse({ files: [{ name: "events.csv", text: "a" }], scope: DEMO.scope });
    expect(ok.success).toBe(true);
    const bad = ImportInputSchema.safeParse({ files: [{ name: "random.csv", text: "a" }], scope: DEMO.scope });
    expect(bad.success).toBe(false);
    const dup = ImportInputSchema.safeParse({
      files: [{ name: "events.csv", text: "a" }, { name: "events.csv", text: "b" }],
      scope: DEMO.scope,
    });
    expect(dup.success).toBe(false);
  });
});

describe("frozen contract: error envelope", () => {
  it("maps every error code to an HTTP status", () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it("round-trips ok and error envelopes", () => {
    const schema = apiResponseSchema(TraceRequestSchema);
    expect(schema.safeParse(apiOk({ revisionId: "r1", rootLotIds: ["T17"], scope: DEMO.scope })).success).toBe(true);
    expect(schema.safeParse(apiFail("NOT_FOUND", "no such run")).success).toBe(true);
    expect(schema.safeParse({ ok: false, error: { code: "MADE_UP", message: "x" } }).success).toBe(false);
  });

  it("recognises DomainError across module boundaries", () => {
    const e = new DomainError("AMBIGUOUS_ROOT", "T17 matches two suppliers");
    expect(isDomainError(e)).toBe(true);
    expect(isDomainError({ name: "DomainError", code: "TIMEOUT", message: "m" })).toBe(true);
    expect(isDomainError(new Error("plain"))).toBe(false);
  });
});

describe("frozen contract: reference expectations match the Python reference output", () => {
  it("revision 1", () => {
    expect(referenceRun1.known_path.onsite_kg).toBe(REFERENCE_EXPECTATIONS.revision1.known.onsiteKg);
    expect(referenceRun1.known_path.shipped_kg).toBe(REFERENCE_EXPECTATIONS.revision1.known.shippedKg);
    expect(referenceRun1.known_path.consignees.length).toBe(REFERENCE_EXPECTATIONS.revision1.known.consigneeCount);
    expect(referenceRun1.known_path_lots).toEqual([...REFERENCE_EXPECTATIONS.revision1.knownPathLots]);
    expect(referenceRun1.unresolved_only.onsite_kg).toBe(REFERENCE_EXPECTATIONS.revision1.unresolvedOnly.onsiteKg);
    expect(referenceRun1.unresolved_only.shipped_kg).toBe(REFERENCE_EXPECTATIONS.revision1.unresolvedOnly.shippedKg);
    expect(referenceRun1.already_disposed_kg).toBe(REFERENCE_EXPECTATIONS.revision1.disposedKg);
    expect(referenceRun1.no_recorded_path_finished_lots).toEqual([...REFERENCE_EXPECTATIONS.revision1.noRecordedPathFinishedLots]);
  });

  it("revision 2 and the +30 kg onsite delta", () => {
    expect(referenceRun2.known_path.onsite_kg).toBe(REFERENCE_EXPECTATIONS.revision2.known.onsiteKg);
    expect(referenceRun2.known_path.shipped_kg).toBe(REFERENCE_EXPECTATIONS.revision2.known.shippedKg);
    expect(referenceRun2.known_path.consignees.length).toBe(REFERENCE_EXPECTATIONS.revision2.known.consigneeCount);
    expect(referenceRun2.known_path_lots).toEqual([...REFERENCE_EXPECTATIONS.revision2.knownPathLots]);
    expect(referenceRun2.known_path.onsite_kg - referenceRun1.known_path.onsite_kg).toBe(REFERENCE_EXPECTATIONS.delta.onsiteKg);
    expect(referenceRun2.known_path.shipped_kg - referenceRun1.known_path.shipped_kg).toBe(REFERENCE_EXPECTATIONS.delta.shippedKg);
  });
});

describe("frozen contract: DTO shapes", () => {
  it("validates a minimal TraceResult and rejects negative or non-finite kg", () => {
    const base = {
      runId: "run-1",
      revisionId: "rev-1",
      rootLotIds: ["T17"],
      createdAt: "2026-09-12T12:00:00Z",
      engineVersion: "graph-1",
      dataHash: "abc",
      scope: DEMO.scope,
      executionStatus: "completed",
      dataCompleteness: "gaps_found",
      known: { onsiteKg: 160, shippedKg: 120, consigneeCount: 3 },
      unresolvedOnly: { onsiteKg: 40, shippedKg: 60 },
      disposedKg: 10,
      rows: [],
      issues: [],
      evidence: [],
      paths: [],
      consignees: [],
    };
    expect(TraceResultSchema.safeParse(base).success).toBe(true);
    expect(TraceResultSchema.safeParse({ ...base, disposedKg: -1 }).success).toBe(false);
    expect(TraceResultSchema.safeParse({ ...base, known: { ...base.known, onsiteKg: Number.NaN } }).success).toBe(false);
  });

  it("AlertDraft preserves nulls and typed evidence spans", () => {
    const r = AlertDraftSchema.safeParse({
      supplier: null,
      item: "Sesame paste",
      externalLotCode: "T17",
      statedDateRange: null,
      evidence: [{ field: "externalLotCode", sourceId: "alert-1", startOffset: 10, endOffset: 13, exactText: "T17" }],
      unresolvedFields: ["supplier", "statedDateRange"],
    });
    expect(r.success).toBe(true);
    const bad = AlertDraftSchema.safeParse({ supplier: null, item: null, externalLotCode: null, statedDateRange: null, evidence: [{ field: "nope", sourceId: "a", startOffset: 0, endOffset: 1, exactText: "x" }], unresolvedFields: [] });
    expect(bad.success).toBe(false);
  });
});
