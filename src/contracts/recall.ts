/**
 * RecallRadius shared contract (FROZEN 2026-09-12, foundation commit).
 *
 * Single source of truth for API/domain names, routes, quantity units, the error envelope
 * and the domain-service signatures shared by all three lanes:
 *   - Codey  (src/server/data/**, src/server/graph/**)  implements `DomainServices` and
 *            exports it from src/server/graph/index.ts.
 *   - Ali    (src/features/recall/**, src/components/recall/**) consumes the DTO types and
 *            `ROUTES` through a typed client adapter; never imports server/Neo4j types.
 *   - Zubair (src/app/**, src/server/application/**, src/server/ai/**) translates HTTP <->
 *            `DomainServices` and owns changes to this file.
 *
 * Rules (from docs/SHARED_CONTRACT.md):
 *   - All identifiers are strings. All times are UTC ISO-8601 strings ("...Z").
 *   - All quantities are finite, non-negative numbers in kilograms (`QUANTITY_UNIT`).
 *   - Collections are arrays, never Set/Map.
 *   - Changing a name here requires Zubair to publish the exact new text to both teammates
 *     and record it in every handoff. Do not rename fields, paths or routes in a lane branch.
 *
 * This file is safe to import from client code: it depends only on zod.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Versioning, units, limits
// ---------------------------------------------------------------------------

export const CONTRACT_VERSION = "2026-09-12.1" as const;

/** The only quantity unit supported by the MVP. Anything else is a review issue, never converted. */
export const QUANTITY_UNIT = "kg" as const;

/** Bounded input sizes. Routes reject anything larger with `PAYLOAD_TOO_LARGE`. */
export const LIMITS = {
  idMaxLength: 128,
  labelMaxLength: 256,
  messageMaxLength: 2_000,
  maxImportFiles: 8,
  maxImportFileChars: 200_000,
  maxImportTotalChars: 500_000,
  maxRootLots: 20,
  maxAlertTextChars: 20_000,
  maxLimitations: 20,
  maxLimitationChars: 500,
  maxJsonBodyBytes: 1_000_000,
} as const;

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

/** Stable identifier: printable, no whitespace, no leading punctuation, bounded length. */
export const IdSchema = z
  .string()
  .min(1)
  .max(LIMITS.idMaxLength)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "identifier may contain letters, digits, . _ : -");

/** UTC ISO-8601 timestamp ending in Z, e.g. 2026-09-01T00:00:00Z. */
export const UtcIsoSchema = z.iso.datetime({ offset: false, local: false });

/** Finite, non-negative kilogram quantity. */
export const KgSchema = z.number().finite().nonnegative();

export const LabelSchema = z.string().min(1).max(LIMITS.labelMaxLength);
export const MessageSchema = z.string().min(1).max(LIMITS.messageMaxLength);

export const IdListSchema = z.array(IdSchema);

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

export const ERROR_CODES = {
  /** Request body, params or query failed schema validation. */
  VALIDATION_FAILED: "VALIDATION_FAILED",
  /** Body or file content exceeds `LIMITS`. */
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  /** Route requires a workspace/actor context the server could not derive. */
  FORBIDDEN: "FORBIDDEN",
  /** Referenced preview, revision, run or lot does not exist in this workspace. */
  NOT_FOUND: "NOT_FOUND",
  /** Preview has blocking issues (`canAccept === false`) or was already consumed. */
  PREVIEW_REJECTED: "PREVIEW_REJECTED",
  /** `expectedBaseRevisionId` does not match the current accepted revision. */
  REVISION_MISMATCH: "REVISION_MISMATCH",
  /** Same action already applied (idempotent replay is reported, not re-executed). */
  DUPLICATE_ACTION: "DUPLICATE_ACTION",
  /** Root lot identity resolves to more than one accepted lot; human review required. */
  AMBIGUOUS_ROOT: "AMBIGUOUS_ROOT",
  /** Scope is malformed or outside the accepted revision's coverage. */
  SCOPE_INVALID: "SCOPE_INVALID",
  /** Two runs cannot be compared (different workspace, root, or incompatible scope). */
  INCOMPARABLE_RUNS: "INCOMPARABLE_RUNS",
  /** Graph query or model call exceeded its time/query budget. */
  TIMEOUT: "TIMEOUT",
  /** Neo4j or another required backend is unavailable/misconfigured. Never masked by a mock. */
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  /** Runtime AI provider not configured; manual entry remains available. */
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  /** Model output failed schema or evidence-span verification. */
  AI_OUTPUT_REJECTED: "AI_OUTPUT_REJECTED",
  /** Unexpected server failure. Message never includes credentials or stack traces. */
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ErrorCodeSchema = z.enum(
  Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]],
);

/** HTTP status used by Zubair's routes for each code. Codey/Ali do not need to map these. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  SCOPE_INVALID: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PREVIEW_REJECTED: 409,
  REVISION_MISMATCH: 409,
  DUPLICATE_ACTION: 409,
  AMBIGUOUS_ROOT: 409,
  PAYLOAD_TOO_LARGE: 413,
  INCOMPARABLE_RUNS: 422,
  AI_OUTPUT_REJECTED: 422,
  INTERNAL: 500,
  BACKEND_UNAVAILABLE: 503,
  AI_UNAVAILABLE: 503,
  TIMEOUT: 504,
};

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().max(LIMITS.messageMaxLength),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export const apiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
  ]);

export const apiOk = <T>(data: T): ApiResponse<T> => ({ ok: true, data });
export const apiFail = (code: ErrorCode, message: string, details?: unknown): ApiResponse<never> => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});

/**
 * Thrown by domain services (Codey) and translated by routes (Zubair) into `ApiResponse` errors.
 * Services must not throw raw Neo4j errors across the boundary; wrap them with a code and a
 * credential-free message.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export const isDomainError = (e: unknown): e is DomainError =>
  e instanceof DomainError ||
  (typeof e === "object" && e !== null && (e as { name?: unknown }).name === "DomainError" && "code" in e);

// ---------------------------------------------------------------------------
// Server-derived request context
// ---------------------------------------------------------------------------

/**
 * Supplied by the server (env-configured synthetic demo identity), never by the browser.
 * This is NOT production authentication; see README "Demo identity".
 */
export const RequestContextSchema = z.object({
  workspaceId: IdSchema,
  actorId: IdSchema,
});
export type RequestContext = z.infer<typeof RequestContextSchema>;

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

export const ScopeSchema = z
  .object({
    siteId: IdSchema,
    /** Inclusive start of the material-event window. */
    eventFrom: UtcIsoSchema,
    /** Exclusive end of the material-event window. */
    eventToExclusive: UtcIsoSchema,
    /** Inventory cutoff: positions are evaluated as of this instant. */
    inventoryAsOf: UtcIsoSchema,
    /** Explicit, human-readable scope limitations (e.g. "no cross-contact assessment"). */
    limitations: z.array(z.string().min(1).max(LIMITS.maxLimitationChars)).max(LIMITS.maxLimitations),
  })
  .refine((s) => Date.parse(s.eventFrom) < Date.parse(s.eventToExclusive), {
    message: "eventFrom must be earlier than eventToExclusive",
    path: ["eventToExclusive"],
  })
  .refine((s) => Date.parse(s.inventoryAsOf) >= Date.parse(s.eventFrom), {
    message: "inventoryAsOf must not precede eventFrom",
    path: ["inventoryAsOf"],
  });
export type Scope = z.infer<typeof ScopeSchema>;

// ---------------------------------------------------------------------------
// Review issues and evidence
// ---------------------------------------------------------------------------

export const IssueSeveritySchema = z.enum(["warning", "blocking"]);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

/**
 * Frozen issue codes. Codey may emit any of these; Ali renders `message` and may group by `code`.
 * Add new codes only through Zubair.
 */
export const ISSUE_CODES = {
  MISSING_ORIGIN: "MISSING_ORIGIN",
  PROVISIONAL_OPENING: "PROVISIONAL_OPENING",
  INCOMPLETE_EVENT: "INCOMPLETE_EVENT",
  CONFLICTING_EVENT_ID: "CONFLICTING_EVENT_ID",
  DUPLICATE_ROW: "DUPLICATE_ROW",
  UNSUPPORTED_UNIT: "UNSUPPORTED_UNIT",
  INVALID_QUANTITY: "INVALID_QUANTITY",
  MISSING_REFERENCE: "MISSING_REFERENCE",
  IMPOSSIBLE_CHRONOLOGY: "IMPOSSIBLE_CHRONOLOGY",
  MATERIAL_CYCLE: "MATERIAL_CYCLE",
  NEGATIVE_CLOSING_STOCK: "NEGATIVE_CLOSING_STOCK",
  MASS_IMBALANCE: "MASS_IMBALANCE",
  COVERAGE_GAP: "COVERAGE_GAP",
  AMBIGUOUS_IDENTITY: "AMBIGUOUS_IDENTITY",
  ALREADY_IMPORTED: "ALREADY_IMPORTED",
  NO_RECORDED_PATH: "NO_RECORDED_PATH",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
  TRAVERSAL_BUDGET_EXCEEDED: "TRAVERSAL_BUDGET_EXCEEDED",
  SCHEMA_ERROR: "SCHEMA_ERROR",
} as const;
export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

export const ReviewIssueSchema = z.object({
  id: IdSchema,
  code: z.string().min(1).max(64),
  severity: IssueSeveritySchema,
  message: MessageSchema,
  lotIds: IdListSchema,
  evidenceIds: IdListSchema,
});
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

export const EvidenceSchema = z.object({
  id: IdSchema,
  /** Original submitted file/source name, e.g. "events.csv" or "SYNTHETIC-BATCH-SHEET-E1". */
  sourceName: z.string().min(1).max(LIMITS.labelMaxLength),
  /** SHA-256 hex of the original submitted text. */
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/, "sha256 hex"),
  /** Stable row/span locator inside the source, e.g. "row:12" or "chars:120-180". */
  locator: z.string().min(1).max(LIMITS.labelMaxLength),
  /** The original row or span text, verbatim. */
  text: z.string().max(LIMITS.maxImportFileChars),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ---------------------------------------------------------------------------
// Trace request / result
// ---------------------------------------------------------------------------

export const TraceRequestSchema = z.object({
  revisionId: IdSchema,
  rootLotIds: z.array(IdSchema).min(1).max(LIMITS.maxRootLots),
  scope: ScopeSchema,
  /**
   * Set by the route from `/api/incidents/:id/traces`. Persisted with the run as a label.
   * Optional so service tests can call `runTrace` directly.
   */
  incidentId: IdSchema.optional(),
});
export type TraceRequest = z.infer<typeof TraceRequestSchema>;

export const ExecutionStatusSchema = z.enum(["completed", "incomplete"]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const DataCompletenessSchema = z.enum(["reviewed_scope", "gaps_found", "unreviewed"]);
export type DataCompleteness = z.infer<typeof DataCompletenessSchema>;

export const TraceRowSchema = z.object({
  lotId: IdSchema,
  productLabel: LabelSchema,
  brandLabel: LabelSchema.nullable(),
  /** Distinct inventory positions at `scope.inventoryAsOf`, summed once per position. */
  onsiteKg: KgSchema,
  /** Distinct outbound shipment lines, summed once per line. */
  shippedKg: KgSchema,
  shipmentLineIds: IdListSchema,
  consigneeIds: IdListSchema,
  /** Reachable from a root via input lot -> material event -> output lot. */
  knownMaterialPath: z.boolean(),
  /** Has a missing origin / unresolved record somewhere in its ancestry. Independent of the flag above. */
  hasUnresolvedEvidence: z.boolean(),
  evidenceIds: IdListSchema,
  issueIds: IdListSchema,
});
export type TraceRow = z.infer<typeof TraceRowSchema>;

export const TracePathSchema = z.object({
  inputLotId: IdSchema,
  eventId: IdSchema,
  outputLotId: IdSchema,
  evidenceIds: IdListSchema,
});
export type TracePath = z.infer<typeof TracePathSchema>;

export const ConsigneeSchema = z.object({ id: IdSchema, name: LabelSchema });
export type Consignee = z.infer<typeof ConsigneeSchema>;

export const QuantitySummarySchema = z.object({
  onsiteKg: KgSchema,
  shippedKg: KgSchema,
  consigneeCount: z.number().int().nonnegative(),
});
export type QuantitySummary = z.infer<typeof QuantitySummarySchema>;

export const TraceResultSchema = z.object({
  runId: IdSchema,
  revisionId: IdSchema,
  rootLotIds: z.array(IdSchema).min(1),
  createdAt: UtcIsoSchema,
  engineVersion: z.string().min(1).max(64),
  /** Hash of the accepted revision data the run used. */
  dataHash: z.string().min(1).max(128),
  scope: ScopeSchema,
  /** Did the engine finish? A timeout or budget overrun yields "incomplete", never an empty "completed". */
  executionStatus: ExecutionStatusSchema,
  /** Is the reviewed input complete? Independent of `executionStatus`. */
  dataCompleteness: DataCompletenessSchema,
  /** All lots with a known material path (including those that ALSO carry unresolved evidence). */
  known: QuantitySummarySchema,
  /** Lots with unresolved evidence and NO known path (excludes known-path lots to avoid double counting). */
  unresolvedOnly: z.object({ onsiteKg: KgSchema, shippedKg: KgSchema }),
  /** Already disposed quantity among known-path lots. Reported separately, never inside onsite. */
  disposedKg: KgSchema,
  rows: z.array(TraceRowSchema),
  issues: z.array(ReviewIssueSchema),
  evidence: z.array(EvidenceSchema),
  paths: z.array(TracePathSchema),
  consignees: z.array(ConsigneeSchema),
  incidentId: IdSchema.optional(),
});
export type TraceResult = z.infer<typeof TraceResultSchema>;

// ---------------------------------------------------------------------------
// Imports and revisions
// ---------------------------------------------------------------------------

/** The four controlled input formats. `ImportFile.name` must be one of `IMPORT_FILE_NAMES`. */
export const IMPORT_FILE_KINDS = ["lots", "events", "shipments", "movements"] as const;
export type ImportFileKind = (typeof IMPORT_FILE_KINDS)[number];
export const IMPORT_FILE_NAMES: Record<ImportFileKind, string> = {
  lots: "lots.csv",
  events: "events.csv",
  shipments: "shipments.csv",
  movements: "movements.csv",
};
export const ImportFileNameSchema = z.enum(
  Object.values(IMPORT_FILE_NAMES) as [string, ...string[]],
);

export const ImportFileSchema = z.object({
  name: ImportFileNameSchema,
  text: z.string().max(LIMITS.maxImportFileChars),
});
export type ImportFile = z.infer<typeof ImportFileSchema>;

export const ImportInputSchema = z
  .object({
    files: z.array(ImportFileSchema).min(1).max(LIMITS.maxImportFiles),
    scope: ScopeSchema,
    baseRevisionId: IdSchema.optional(),
  })
  .refine(
    (i) => i.files.reduce((n, f) => n + f.text.length, 0) <= LIMITS.maxImportTotalChars,
    { message: `total import text exceeds ${LIMITS.maxImportTotalChars} characters`, path: ["files"] },
  )
  .refine((i) => new Set(i.files.map((f) => f.name)).size === i.files.length, {
    message: "duplicate file names in one import",
    path: ["files"],
  });
export type ImportInput = z.infer<typeof ImportInputSchema>;

export const ImportCoverageSchema = z.object({
  expected: z.array(z.string()),
  received: z.array(z.string()),
  missing: z.array(z.string()),
});
export type ImportCoverage = z.infer<typeof ImportCoverageSchema>;

export const ImportPreviewSchema = z.object({
  previewId: IdSchema,
  baseRevisionId: IdSchema.nullable(),
  /** False when any blocking issue exists. Acceptance of such a preview returns PREVIEW_REJECTED. */
  canAccept: z.boolean(),
  issues: z.array(ReviewIssueSchema),
  sourceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  coverage: ImportCoverageSchema,
});
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const AcceptImportRequestSchema = z.object({
  /** Required when the preview was built on a base revision; must equal the current accepted revision. */
  expectedBaseRevisionId: IdSchema.optional(),
});
export type AcceptImportRequest = z.infer<typeof AcceptImportRequestSchema>;

export const RevisionInfoSchema = z.object({
  revisionId: IdSchema,
  acceptedAt: UtcIsoSchema,
  dataHash: z.string().min(1).max(128),
});
export type RevisionInfo = z.infer<typeof RevisionInfoSchema>;

export const LateEvidencePreviewRequestSchema = z.object({
  baseRevisionId: IdSchema,
});
export type LateEvidencePreviewRequest = z.infer<typeof LateEvidencePreviewRequestSchema>;

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export const TraceComparisonSchema = z.object({
  earlierRunId: IdSchema,
  laterRunId: IdSchema,
  comparable: z.boolean(),
  /** Why the runs are or are not comparable (data change vs scope change are labeled separately). */
  reasons: z.array(z.string().max(LIMITS.messageMaxLength)),
  /** later.known - earlier.known; null when not comparable. */
  delta: z
    .object({ onsiteKg: z.number().finite(), shippedKg: z.number().finite(), consigneeCount: z.number().int() })
    .nullable(),
  addedLotIds: IdListSchema,
  addedConsigneeIds: IdListSchema,
  resolvedIssueIds: IdListSchema,
});
export type TraceComparison = z.infer<typeof TraceComparisonSchema>;

// ---------------------------------------------------------------------------
// Runtime AI: supplier-alert extraction (optional flow, Zubair)
// ---------------------------------------------------------------------------

export const AlertExtractRequestSchema = z.object({
  /** Caller-chosen id for the pasted text; echoed on every evidence span. */
  sourceId: IdSchema,
  text: z.string().min(1).max(LIMITS.maxAlertTextChars),
});
export type AlertExtractRequest = z.infer<typeof AlertExtractRequestSchema>;

export const ALERT_DRAFT_FIELDS = ["supplier", "item", "externalLotCode", "statedDateRange"] as const;
export type AlertDraftField = (typeof ALERT_DRAFT_FIELDS)[number];

export const AlertEvidenceSpanSchema = z.object({
  field: z.enum(ALERT_DRAFT_FIELDS),
  sourceId: IdSchema,
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  /** Must equal text.slice(startOffset, endOffset) of the supplied source; verified server-side. */
  exactText: z.string().min(1),
});
export type AlertEvidenceSpan = z.infer<typeof AlertEvidenceSpanSchema>;

export const AlertDraftSchema = z.object({
  supplier: z.string().max(LIMITS.labelMaxLength).nullable(),
  item: z.string().max(LIMITS.labelMaxLength).nullable(),
  /** The external lot code as written by the supplier. Never an internal lot id. */
  externalLotCode: z.string().max(LIMITS.labelMaxLength).nullable(),
  statedDateRange: z.object({ from: z.string(), to: z.string() }).nullable(),
  evidence: z.array(AlertEvidenceSpanSchema),
  /** Fields the model could not fill or found ambiguous. Nulls are preserved, never guessed. */
  unresolvedFields: z.array(z.enum(ALERT_DRAFT_FIELDS)),
});
export type AlertDraft = z.infer<typeof AlertDraftSchema>;

export const AiProviderModeSchema = z.enum(["live", "stub"]);
export type AiProviderMode = z.infer<typeof AiProviderModeSchema>;

/** Route output. Always `status: "draft"`; confirmation is a human UI action that picks a known lot. */
export const AlertExtractResultSchema = z.object({
  sourceId: IdSchema,
  status: z.literal("draft"),
  draft: AlertDraftSchema,
  provider: z.object({
    name: z.string().min(1).max(64),
    mode: AiProviderModeSchema,
    model: z.string().max(128).nullable(),
  }),
  /** Non-fatal notes, e.g. "1 evidence span dropped: text mismatch". */
  warnings: z.array(z.string().max(LIMITS.messageMaxLength)),
});
export type AlertExtractResult = z.infer<typeof AlertExtractResultSchema>;

export const AlertReviewStateSchema = z.enum(["draft", "confirmed", "rejected"]);
export type AlertReviewState = z.infer<typeof AlertReviewStateSchema>;

/** Client-side confirmation record: the reviewer matched the draft to a known internal lot. */
export type AlertConfirmation = {
  sourceId: string;
  state: AlertReviewState;
  matchedLotId: string | null;
  reviewerId: string;
  decidedAt: string;
};

// ---------------------------------------------------------------------------
// Routes (owned by Zubair)
// ---------------------------------------------------------------------------

export const ROUTES = {
  importPreview: { method: "POST", path: "/api/imports/preview" },
  importAccept: { method: "POST", path: (previewId: string) => `/api/imports/${encodeURIComponent(previewId)}/accept` },
  lateEvidencePreview: { method: "POST", path: "/api/demo/late-evidence/preview" },
  alertExtract: { method: "POST", path: "/api/alerts/extract" },
  traceCreate: { method: "POST", path: (incidentId: string) => `/api/incidents/${encodeURIComponent(incidentId)}/traces` },
  traceGet: { method: "GET", path: (runId: string) => `/api/traces/${encodeURIComponent(runId)}` },
  traceCompare: {
    method: "GET",
    path: (earlierRunId: string, laterRunId: string) =>
      `/api/traces/${encodeURIComponent(earlierRunId)}/compare?other=${encodeURIComponent(laterRunId)}`,
  },
  traceExport: { method: "GET", path: (runId: string) => `/api/traces/${encodeURIComponent(runId)}/export` },
  /** Non-contract convenience: reports which services/providers are wired (no secrets). */
  health: { method: "GET", path: "/api/health" },
} as const;

/**
 * Route I/O summary (inside ApiResponse unless noted):
 *   importPreview        ImportInput                       -> ImportPreview
 *   importAccept         AcceptImportRequest               -> RevisionInfo
 *   lateEvidencePreview  LateEvidencePreviewRequest        -> ImportPreview
 *   alertExtract         AlertExtractRequest               -> AlertExtractResult
 *   traceCreate          TraceRequest (incidentId from path) -> TraceResult
 *   traceGet             -                                 -> TraceResult
 *   traceCompare         ?other=laterRunId                 -> TraceComparison
 *   traceExport          -                                 -> text/csv (ApiResponse JSON only on error)
 */

/** CSV export columns, in order. Frozen so Ali's copy and Zubair's writer agree. */
export const EXPORT_COLUMNS = [
  "runId",
  "revisionId",
  "rootLotIds",
  "siteId",
  "eventFrom",
  "eventToExclusive",
  "inventoryAsOf",
  "executionStatus",
  "dataCompleteness",
  "lotId",
  "productLabel",
  "brandLabel",
  "category",
  "onsiteKg",
  "shippedKg",
  "unit",
  "consigneeIds",
  "shipmentLineIds",
  "knownMaterialPath",
  "hasUnresolvedEvidence",
  "issueIds",
  "evidenceIds",
  "candidateAction",
  "holdStatus",
] as const;

/** Row categories used in the export and the UI. Never "safe". */
export const ROW_CATEGORIES = {
  tracedPotentialImpact: "traced_potential_impact",
  unresolvedScope: "unresolved_scope",
  noRecordedPath: "no_recorded_material_path",
} as const;
export type RowCategory = (typeof ROW_CATEGORIES)[keyof typeof ROW_CATEGORIES];

export const UI_LABELS = {
  [ROW_CATEGORIES.tracedPotentialImpact]: "Traced potential impact",
  [ROW_CATEGORIES.unresolvedScope]: "Unresolved scope",
  [ROW_CATEGORIES.noRecordedPath]: "No recorded material path",
  candidateHold: "QA review: consider hold",
  verifyRecord: "Verify missing production record",
  holdNotApplied: "Candidate only; no warehouse hold applied",
} as const;

// ---------------------------------------------------------------------------
// Domain services (implemented by Codey, consumed by Zubair)
// ---------------------------------------------------------------------------

export const PreviewLateEvidenceInputSchema = LateEvidencePreviewRequestSchema;
export type PreviewLateEvidenceInput = z.infer<typeof PreviewLateEvidenceInputSchema>;

export const AcceptImportInputSchema = z.object({
  previewId: IdSchema,
  expectedBaseRevisionId: IdSchema.optional(),
});
export type AcceptImportInput = z.infer<typeof AcceptImportInputSchema>;

export const GetTraceInputSchema = z.object({ runId: IdSchema });
export type GetTraceInput = z.infer<typeof GetTraceInputSchema>;

export const CompareTracesInputSchema = z.object({
  earlierRunId: IdSchema,
  laterRunId: IdSchema,
});
export type CompareTracesInput = z.infer<typeof CompareTracesInputSchema>;

/**
 * Codey exports an object satisfying this interface from `src/server/graph/index.ts`
 * (e.g. `export const graphServices: DomainServices = {...}` plus `export default graphServices`).
 *
 * Every method: context first, returns the domain DTO directly (no HTTP envelope), rejects with
 * `DomainError` for expected failures. `runTrace` persists the immutable result BEFORE returning.
 * Never call an AI model inside a retryable Neo4j transaction.
 */
export interface DomainServices {
  previewImport(ctx: RequestContext, input: ImportInput): Promise<ImportPreview>;
  previewLateEvidence(ctx: RequestContext, input: PreviewLateEvidenceInput): Promise<ImportPreview>;
  acceptImport(ctx: RequestContext, input: AcceptImportInput): Promise<RevisionInfo>;
  runTrace(ctx: RequestContext, request: TraceRequest): Promise<TraceResult>;
  getTrace(ctx: RequestContext, input: GetTraceInput): Promise<TraceResult>;
  compareTraces(ctx: RequestContext, input: CompareTracesInput): Promise<TraceComparison>;
}

// ---------------------------------------------------------------------------
// Synthetic demo constants (identical in every lane; from docs/research/reference_case.py)
// ---------------------------------------------------------------------------

export const DEMO = {
  workspaceId: "synthetic-co-packer",
  siteId: "S1",
  rootLotId: "T17",
  incidentId: "INC-T17",
  /** Prepared late-evidence event id from the reference fixture. */
  lateEvidenceEventId: "E-LATE",
  provisionalLotId: "R-UNK",
  scope: {
    siteId: "S1",
    eventFrom: "2026-09-01T00:00:00Z",
    eventToExclusive: "2026-09-11T00:00:00Z",
    inventoryAsOf: "2026-09-10T23:59:59Z",
    limitations: [
      "All fixture lots, one site, September 1-10, 2026",
      "No cross-contact assessment; material genealogy only",
      "Absence of a recorded path is not a safety clearance",
    ],
  } satisfies Scope,
} as const;

/** Expected outcomes from docs/research/reference_output (Python reference, 22 checks). */
export const REFERENCE_EXPECTATIONS = {
  revision1: {
    known: { onsiteKg: 160, shippedKg: 120, consigneeCount: 3 },
    knownFinishedLots: ["F-A", "F-B", "F-C"],
    knownPathLots: ["B101", "F-A", "F-B", "F-C", "R101", "T17", "WASTE101", "WIP101"],
    unresolvedOnly: { onsiteKg: 40, shippedKg: 60 },
    unresolvedOnlyLots: ["F-E", "R-UNK"],
    disposedKg: 10,
    noRecordedPathFinishedLots: ["F-D"],
    shipmentLineIds: ["SL-A", "SL-B", "SL-C"],
  },
  revision2: {
    known: { onsiteKg: 190, shippedKg: 180, consigneeCount: 4 },
    knownFinishedLots: ["F-A", "F-B", "F-C", "F-E"],
    knownPathLots: ["B101", "F-A", "F-B", "F-C", "F-E", "R-UNK", "R101", "T17", "WASTE101", "WIP101"],
    unresolvedOnly: { onsiteKg: 0, shippedKg: 0 },
    unresolvedOnlyLots: [],
    disposedKg: 10,
    noRecordedPathFinishedLots: ["F-D"],
    shipmentLineIds: ["SL-A", "SL-B", "SL-C", "SL-E"],
  },
  /** Revision 2 consumes 10 kg WIP101 and adds 40 kg F-E: onsite delta is +30, not +40. */
  delta: { onsiteKg: 30, shippedKg: 60, consigneeCount: 1 },
} as const;
