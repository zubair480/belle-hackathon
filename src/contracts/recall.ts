/**
 * RecallRadius assembly trace contract. Contract version: assembly-quality-v4 (2026-09-12).
 *
 * Supporting context for issues: from a supplier batch, an in-house manufacturing lot or a
 * component serial, through actual installations, to distinct vehicles. Quantities are counts of
 * discrete serialized entities, never mass. The earlier food/lot (kg) contract is superseded and
 * preserved only in git history (branch codex/zubair-api-integration @ 1f92bb8).
 *
 * Ownership: Zubair. Codey implements `TraceServices` in src/server/graph/index.ts.
 */
import { z } from "zod";
import {
  CONTRACT_VERSION,
  ContractVersionSchema,
  CountSchema,
  EvidenceSchema,
  IdListSchema,
  IdSchema,
  LIMITS,
  LabelSchema,
  ReviewIssueSchema,
  Sha256Schema,
  SignedCountSchema,
  UtcIsoSchema,
  type RequestContext,
} from "./common";
import type { IssueServices } from "./issues";

export * from "./common";

// ---------------------------------------------------------------------------
// Scope and roots
// ---------------------------------------------------------------------------

export const ScopeSchema = z
  .object({
    siteId: IdSchema,
    /** Current containment is evaluated with installation edges active at this instant. */
    configurationAsOf: UtcIsoSchema,
    /** Historical containment requires interval overlap with [historyFrom, configurationAsOf]. */
    historyFrom: UtcIsoSchema,
    trackedPartNumber: LabelSchema,
    limitations: z.array(z.string().min(1).max(LIMITS.maxLimitationChars)).max(LIMITS.maxLimitations),
  })
  .refine((s) => Date.parse(s.historyFrom) <= Date.parse(s.configurationAsOf), {
    message: "historyFrom must not be later than configurationAsOf",
    path: ["historyFrom"],
  });
export type Scope = z.infer<typeof ScopeSchema>;

export const ROOT_KINDS = ["supplier_batch", "manufacturing_lot", "component_serial"] as const;
export const RootSelectorSchema = z.object({ kind: z.enum(ROOT_KINDS), id: IdSchema });
export type RootSelector = z.infer<typeof RootSelectorSchema>;

// ---------------------------------------------------------------------------
// Trace request / result
// ---------------------------------------------------------------------------

export const TraceRequestSchema = z.object({
  contractVersion: ContractVersionSchema,
  revisionId: IdSchema,
  root: RootSelectorSchema,
  scope: ScopeSchema,
  /** Set by the route from `/api/incidents/:id/traces`. Persisted as a label. */
  incidentId: IdSchema.optional(),
});
export type TraceRequest = z.infer<typeof TraceRequestSchema>;

export const ExecutionStatusSchema = z.enum(["completed", "incomplete"]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;
export const DataCompletenessSchema = z.enum(["reviewed_scope", "gaps_found", "unreviewed"]);
export type DataCompleteness = z.infer<typeof DataCompletenessSchema>;

export const ENGINEERING_REVIEW_STATES = ["pending", "reviewed", "not_recorded"] as const;

export const TraceRowSchema = z.object({
  entityId: IdSchema,
  entityKind: z.enum(["component", "subassembly", "vehicle"]),
  partNumber: LabelSchema,
  serialNumber: LabelSchema,
  /** For vehicles: internal build id; null VIN allowed. */
  buildId: LabelSchema.nullable(),
  vin: z.string().max(17).nullable(),
  locationState: z.enum(["onsite", "installed", "shipped", "quarantine", "unknown"]),
  customerId: IdSchema.nullable(),
  shipmentLineIds: IdListSchema,
  /** Contains root material at configurationAsOf (via recorded, active installation edges). */
  currentContainment: z.boolean(),
  /** Contained root material at some time in the history window (includes current). */
  historicalContainment: z.boolean(),
  hasUnresolvedEvidence: z.boolean(),
  engineeringReview: z.enum(ENGINEERING_REVIEW_STATES),
  evidenceIds: IdListSchema,
  issueIds: IdListSchema,
});
export type TraceRow = z.infer<typeof TraceRowSchema>;

const countFields = {
  currentOnsiteVehicleCount: CountSchema,
  currentShippedVehicleCount: CountSchema,
  currentCustomerCount: CountSchema,
  looseCandidateComponentCount: CountSchema,
  quarantinedComponentCount: CountSchema,
  /** Vehicles with historical but no current containment (e.g. suspect part replaced). */
  historicalOnlyVehicleCount: CountSchema,
  /** Vehicles in the unresolved queue with no current known containment. Not additive. */
  unresolvedOnlyVehicleCount: CountSchema,
};
export const TraceCountsSchema = z.object(countFields);
export type TraceCounts = z.infer<typeof TraceCountsSchema>;
export const TraceCountsDeltaSchema = z.object(
  Object.fromEntries(Object.keys(countFields).map((k) => [k, SignedCountSchema])) as Record<keyof typeof countFields, typeof SignedCountSchema>,
);
export type TraceCountsDelta = z.infer<typeof TraceCountsDeltaSchema>;

export const PATH_KINDS = ["BATCH_HAS_COMPONENT", "LOT_PRODUCED_COMPONENT", "INSTALLED_IN"] as const;
export const TracePathSchema = z.object({
  relationshipId: IdSchema,
  fromId: IdSchema,
  toId: IdSchema,
  kind: z.enum(PATH_KINDS),
  validFrom: UtcIsoSchema.nullable(),
  validTo: UtcIsoSchema.nullable(),
  evidenceIds: IdListSchema,
});
export type TracePath = z.infer<typeof TracePathSchema>;

export const CustomerSchema = z.object({ id: IdSchema, name: LabelSchema });

export const TraceResultSchema = z.object({
  contractVersion: ContractVersionSchema,
  runId: IdSchema,
  revisionId: IdSchema,
  root: RootSelectorSchema,
  createdAt: UtcIsoSchema,
  engineVersion: z.string().min(1).max(64),
  dataHash: z.string().min(1).max(128),
  scope: ScopeSchema,
  executionStatus: ExecutionStatusSchema,
  dataCompleteness: DataCompletenessSchema,
  counts: TraceCountsSchema,
  rows: z.array(TraceRowSchema),
  issues: z.array(ReviewIssueSchema),
  evidence: z.array(EvidenceSchema),
  paths: z.array(TracePathSchema),
  customers: z.array(CustomerSchema),
  incidentId: IdSchema.optional(),
});
export type TraceResult = z.infer<typeof TraceResultSchema>;

// ---------------------------------------------------------------------------
// Imports and revisions
// ---------------------------------------------------------------------------

export const IMPORT_FILE_KINDS = ["entities", "batches", "manufacturing_lots", "installations", "shipments"] as const;
export type ImportFileKind = (typeof IMPORT_FILE_KINDS)[number];
export const IMPORT_FILE_NAMES: Record<ImportFileKind, string> = {
  entities: "entities.csv",
  batches: "batches.csv",
  manufacturing_lots: "manufacturing_lots.csv",
  installations: "installations.csv",
  shipments: "shipments.csv",
};
export const ImportFileNameSchema = z.enum(Object.values(IMPORT_FILE_NAMES) as [string, ...string[]]);
export const ImportFileSchema = z.object({ name: ImportFileNameSchema, text: z.string().max(LIMITS.maxImportFileChars) });
export type ImportFile = z.infer<typeof ImportFileSchema>;

export const ImportInputSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    files: z.array(ImportFileSchema).min(1).max(LIMITS.maxImportFiles),
    scope: ScopeSchema,
    baseRevisionId: IdSchema.optional(),
  })
  .refine((i) => i.files.reduce((n, f) => n + f.text.length, 0) <= LIMITS.maxImportTotalChars, {
    message: `total import text exceeds ${LIMITS.maxImportTotalChars} characters`,
    path: ["files"],
  })
  .refine((i) => new Set(i.files.map((f) => f.name)).size === i.files.length, { message: "duplicate file names", path: ["files"] });
export type ImportInput = z.infer<typeof ImportInputSchema>;

export const ImportPreviewSchema = z.object({
  previewId: IdSchema,
  baseRevisionId: IdSchema.nullable(),
  canAccept: z.boolean(),
  issues: z.array(ReviewIssueSchema),
  sourceHashes: z.array(Sha256Schema),
  coverage: z.object({ expected: z.array(z.string()), received: z.array(z.string()), missing: z.array(z.string()) }),
});
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const AcceptImportRequestSchema = z.object({ expectedBaseRevisionId: IdSchema.optional() });
export type AcceptImportRequest = z.infer<typeof AcceptImportRequestSchema>;

export const RevisionInfoSchema = z.object({
  contractVersion: ContractVersionSchema,
  revisionId: IdSchema,
  acceptedAt: UtcIsoSchema,
  dataHash: z.string().min(1).max(128),
});
export type RevisionInfo = z.infer<typeof RevisionInfoSchema>;

export const LateEvidencePreviewRequestSchema = z.object({ baseRevisionId: IdSchema });
export type LateEvidencePreviewRequest = z.infer<typeof LateEvidencePreviewRequestSchema>;

export const TraceComparisonSchema = z.object({
  earlierRunId: IdSchema,
  laterRunId: IdSchema,
  comparable: z.boolean(),
  /** Data-revision changes and scope/root/cutoff changes are named separately. */
  reasons: z.array(z.string().max(LIMITS.messageMaxLength)),
  delta: TraceCountsDeltaSchema.nullable(),
  addedCurrentVehicleIds: IdListSchema,
  removedCurrentVehicleIds: IdListSchema,
  addedCurrentCustomerIds: IdListSchema,
  resolvedIssueIds: IdListSchema,
});
export type TraceComparison = z.infer<typeof TraceComparisonSchema>;

export const REVIEW_ISSUE_CODES = {
  UNKNOWN_ORIGIN: "UNKNOWN_ORIGIN",
  ENGINEERING_REVIEW_PENDING: "ENGINEERING_REVIEW_PENDING",
  CONFLICTING_INSTALLATION: "CONFLICTING_INSTALLATION",
  SLOT_OVERLAP: "SLOT_OVERLAP",
  MISSING_REFERENCE: "MISSING_REFERENCE",
  DUPLICATE_ROW: "DUPLICATE_ROW",
  COVERAGE_GAP: "COVERAGE_GAP",
  ALREADY_IMPORTED: "ALREADY_IMPORTED",
  AMBIGUOUS_IDENTITY: "AMBIGUOUS_IDENTITY",
  TRAVERSAL_BUDGET_EXCEEDED: "TRAVERSAL_BUDGET_EXCEEDED",
  SCHEMA_ERROR: "SCHEMA_ERROR",
} as const;

// ---------------------------------------------------------------------------
// Component alert extraction (optional AI; unconfirmed draft)
// ---------------------------------------------------------------------------

export const AlertExtractRequestSchema = z.object({ sourceId: IdSchema, text: z.string().min(1).max(LIMITS.maxAlertTextChars) });
export type AlertExtractRequest = z.infer<typeof AlertExtractRequestSchema>;

export const ALERT_DRAFT_FIELDS = ["supplier", "partNumber", "batchCode", "statedDateRange"] as const;
export type AlertDraftField = (typeof ALERT_DRAFT_FIELDS)[number];
export const AlertEvidenceSpanSchema = z.object({
  field: z.enum(ALERT_DRAFT_FIELDS),
  sourceId: IdSchema,
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  exactText: z.string().min(1),
});
export type AlertEvidenceSpan = z.infer<typeof AlertEvidenceSpanSchema>;
export const AlertDraftSchema = z.object({
  supplier: LabelSchema.nullable(),
  partNumber: LabelSchema.nullable(),
  /** The supplier's batch/lot code as written. Never an internal id. */
  batchCode: LabelSchema.nullable(),
  statedDateRange: z.object({ from: z.string(), to: z.string() }).nullable(),
  evidence: z.array(AlertEvidenceSpanSchema),
  unresolvedFields: z.array(z.enum(ALERT_DRAFT_FIELDS)),
});
export type AlertDraft = z.infer<typeof AlertDraftSchema>;
export const AlertExtractResultSchema = z.object({
  sourceId: IdSchema,
  status: z.literal("draft"),
  draft: AlertDraftSchema,
  provider: z.object({ name: z.string().min(1).max(64), mode: z.enum(["live", "stub"]), model: z.string().max(128).nullable() }),
  warnings: z.array(z.string().max(LIMITS.messageMaxLength)),
});
export type AlertExtractResult = z.infer<typeof AlertExtractResultSchema>;

// ---------------------------------------------------------------------------
// Routes and export
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;
export const ROUTES = {
  importPreview: { method: "POST", path: "/api/imports/preview" },
  importAccept: { method: "POST", path: (previewId: string) => `/api/imports/${enc(previewId)}/accept` },
  lateEvidencePreview: { method: "POST", path: "/api/demo/late-evidence/preview" },
  alertExtract: { method: "POST", path: "/api/alerts/extract" },
  traceCreate: { method: "POST", path: (incidentId: string) => `/api/incidents/${enc(incidentId)}/traces` },
  traceGet: { method: "GET", path: (runId: string) => `/api/traces/${enc(runId)}` },
  traceCompare: { method: "GET", path: (earlier: string, later: string) => `/api/traces/${enc(earlier)}/compare?other=${enc(later)}` },
  traceExport: { method: "GET", path: (runId: string) => `/api/traces/${enc(runId)}/export` },
  health: { method: "GET", path: "/api/health" },
} as const;

export const TRACE_EXPORT_COLUMNS = [
  "runId", "revisionId", "rootKind", "rootId", "siteId", "configurationAsOf", "historyFrom", "executionStatus", "dataCompleteness",
  "entityId", "entityKind", "partNumber", "serialNumber", "buildId", "vin", "locationState", "customerId", "shipmentLineIds",
  "category", "currentContainment", "historicalContainment", "hasUnresolvedEvidence", "engineeringReview", "issueIds", "evidenceIds",
  "candidateAction", "holdStatus",
] as const;

export const ISSUE_EXPORT_COLUMNS = [
  "issueId", "status", "version", "title", "severity", "origin", "detectedAt", "reportingTeamId", "assignedTeamId", "detectionStationId",
  "processStepId", "entityIds", "partNumber", "partRevision", "linkedSupplierIds", "defectCode", "confirmedCauseType",
  "confirmedResponsibleTeamId", "confirmedResponsibleSupplierId", "currentFixRevisionId", "currentFixState", "lastVerificationOutcome",
  "evidenceIds",
] as const;

export const ROW_CATEGORIES = {
  currentContainment: "current_containment",
  historicalOnly: "historical_only_review",
  unresolvedScope: "unresolved_scope",
  looseCandidate: "loose_candidate_component",
  quarantined: "quarantined_component",
  noRecordedLink: "no_recorded_link",
} as const;
export type RowCategory = (typeof ROW_CATEGORIES)[keyof typeof ROW_CATEGORIES];

export const UI_LABELS = {
  [ROW_CATEGORIES.currentContainment]: "Current containment",
  [ROW_CATEGORIES.historicalOnly]: "Historical exposure, engineering review",
  [ROW_CATEGORIES.unresolvedScope]: "Unresolved scope",
  [ROW_CATEGORIES.looseCandidate]: "Loose candidate component",
  [ROW_CATEGORIES.quarantined]: "Already quarantined",
  [ROW_CATEGORIES.noRecordedLink]: "No recorded link",
  sourcingSupplier: "Bought from supplier",
  sourcingInHouse: "Made in-house",
  sourcingUnknown: "Unknown origin",
  candidateHold: "QA review: consider hold",
  verifyRecord: "Verify missing record",
  holdNotApplied: "Candidate only; no hold or shipment release applied",
} as const;

// ---------------------------------------------------------------------------
// Trace services (implemented by Codey)
// ---------------------------------------------------------------------------

export const AcceptImportInputSchema = z.object({ previewId: IdSchema, expectedBaseRevisionId: IdSchema.optional() });
export type AcceptImportInput = z.infer<typeof AcceptImportInputSchema>;
export const GetTraceInputSchema = z.object({ runId: IdSchema });
export type GetTraceInput = z.infer<typeof GetTraceInputSchema>;
export const CompareTracesInputSchema = z.object({ earlierRunId: IdSchema, laterRunId: IdSchema });
export type CompareTracesInput = z.infer<typeof CompareTracesInputSchema>;

export interface TraceServices {
  previewImport(ctx: RequestContext, input: ImportInput): Promise<ImportPreview>;
  previewLateEvidence(ctx: RequestContext, input: LateEvidencePreviewRequest): Promise<ImportPreview>;
  acceptImport(ctx: RequestContext, input: AcceptImportInput): Promise<RevisionInfo>;
  runTrace(ctx: RequestContext, request: TraceRequest): Promise<TraceResult>;
  getTrace(ctx: RequestContext, input: GetTraceInput): Promise<TraceResult>;
  compareTraces(ctx: RequestContext, input: CompareTracesInput): Promise<TraceComparison>;
}

/**
 * Codey exports one object satisfying both interfaces from src/server/graph/index.ts:
 *   export const graphServices: DomainServices = { ...issueServices, ...traceServices };
 */
export type DomainServices = IssueServices & TraceServices;

// ---------------------------------------------------------------------------
// Demo constants and regression oracle
// ---------------------------------------------------------------------------

/** EV demo trace roots (fictional). */
export const EV_TRACE_DEMO = {
  incidentId: "INC-CHARGEPORT-005",
  supplierBatchRoot: { kind: "supplier_batch", id: "LOT-SUP-01" } satisfies RootSelector,
  manufacturingLotRoot: { kind: "manufacturing_lot", id: "LOT-MFG-01" } satisfies RootSelector,
  scope: {
    siteId: "PLANT-1",
    configurationAsOf: "2026-09-12T12:00:00Z",
    historyFrom: "2026-09-01T00:00:00Z",
    trackedPartNumber: "CP-CONN-100",
    limitations: ["Synthetic EV fixture; one charge-port path, not a full vehicle BOM", "Removal is not engineering clearance"],
  } satisfies Scope,
} as const;

/**
 * Legacy robotics regression oracle (docs/reference/assembly). Root supplier batch B17, part ENC-42.
 * Field names below map the reference's robot counts onto v4 vehicle counts for regression only;
 * these ids are NOT EV factory data and must never be shown as such.
 */
export const ASSEMBLY_REGRESSION = {
  workspaceId: "synthetic-robot-assembler",
  root: { kind: "supplier_batch", id: "B17" } satisfies RootSelector,
  scope: {
    siteId: "S1",
    configurationAsOf: "2026-09-10T23:59:59Z",
    historyFrom: "2026-09-01T00:00:00Z",
    trackedPartNumber: "ENC-42",
    limitations: ["Legacy robotics regression fixture", "Removal is not engineering clearance"],
  } satisfies Scope,
  revision1: {
    counts: { currentOnsiteVehicleCount: 1, currentShippedVehicleCount: 2, currentCustomerCount: 2, looseCandidateComponentCount: 1, quarantinedComponentCount: 1, historicalOnlyVehicleCount: 1, unresolvedOnlyVehicleCount: 1 } satisfies TraceCounts,
    currentVehicleIds: ["R001", "R002", "R003"],
    currentCustomerIds: ["CUST-A", "CUST-B"],
    historicalOnlyVehicleIds: ["R006"],
    unresolvedOnlyVehicleIds: ["R005"],
    noRecordedLinkVehicleIds: ["R004"],
  },
  revision2: {
    counts: { currentOnsiteVehicleCount: 1, currentShippedVehicleCount: 3, currentCustomerCount: 3, looseCandidateComponentCount: 1, quarantinedComponentCount: 1, historicalOnlyVehicleCount: 1, unresolvedOnlyVehicleCount: 0 } satisfies TraceCounts,
    currentVehicleIds: ["R001", "R002", "R003", "R005"],
    currentCustomerIds: ["CUST-A", "CUST-B", "CUST-C"],
    historicalOnlyVehicleIds: ["R006"],
    unresolvedOnlyVehicleIds: [],
    noRecordedLinkVehicleIds: ["R004"],
  },
  delta: { currentOnsiteVehicleCount: 0, currentShippedVehicleCount: 1, currentCustomerCount: 1, looseCandidateComponentCount: 0, quarantinedComponentCount: 0, historicalOnlyVehicleCount: 0, unresolvedOnlyVehicleCount: -1 } satisfies TraceCountsDelta,
} as const;
