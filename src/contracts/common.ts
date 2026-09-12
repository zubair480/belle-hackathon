/**
 * RecallRadius shared contract primitives. Contract version: assembly-quality-v4 (2026-09-12).
 *
 * Shared by src/contracts/issues.ts (issue workflow) and src/contracts/recall.ts (assembly trace).
 * Safe to import from client code: depends only on zod.
 *
 * Ownership: Zubair. Changing anything here requires publishing the exact new text to Codey and
 * Ali and recording it in every handoff. Do not rename fields in a lane branch.
 */
import { z } from "zod";

export const CONTRACT_VERSION = "assembly-quality-v4" as const;
export const ContractVersionSchema = z.literal(CONTRACT_VERSION);

/** Bounded input sizes. Routes reject anything larger with `PAYLOAD_TOO_LARGE`. */
export const LIMITS = {
  idMaxLength: 128,
  labelMaxLength: 256,
  textMaxLength: 4_000,
  messageMaxLength: 2_000,
  maxListLimit: 200,
  defaultListLimit: 50,
  maxIdsPerRequest: 50,
  maxImportFiles: 8,
  maxImportFileChars: 200_000,
  maxImportTotalChars: 500_000,
  maxAlertTextChars: 20_000,
  maxFreeTextChars: 20_000,
  maxLimitations: 20,
  maxLimitationChars: 500,
  maxFixSteps: 40,
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
export const IdListSchema = z.array(IdSchema).max(LIMITS.maxIdsPerRequest);

/** UTC ISO-8601 timestamp ending in Z, e.g. 2026-09-12T10:00:00Z. */
export const UtcIsoSchema = z.iso.datetime({ offset: false, local: false });

export const LabelSchema = z.string().min(1).max(LIMITS.labelMaxLength);
export const TextSchema = z.string().max(LIMITS.textMaxLength);
export const MessageSchema = z.string().min(1).max(LIMITS.messageMaxLength);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "sha256 hex");
export const CountSchema = z.number().int().nonnegative();
export const SignedCountSchema = z.number().int();
/** Nullable rate in [0,1]. Null means the denominator is unknown/incomplete; render as N/A, never 0%. */
export const NullableRateSchema = z.number().min(0).max(1).nullable();

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  /** A referenced team/supplier/station/entity/evidence/fix id does not exist in this workspace. */
  INVALID_REFERENCE: "INVALID_REFERENCE",
  /** `expectedVersion` does not match the stored issue version. */
  STALE_VERSION: "STALE_VERSION",
  /** Requested status change is not allowed from the current status. */
  INVALID_TRANSITION: "INVALID_TRANSITION",
  /** Closing requires a passed verification for the applied fix revision. */
  VERIFICATION_REQUIRED: "VERIFICATION_REQUIRED",
  /** Same command already applied (idempotency key replay is reported, not re-executed). */
  DUPLICATE_ACTION: "DUPLICATE_ACTION",
  PREVIEW_REJECTED: "PREVIEW_REJECTED",
  REVISION_MISMATCH: "REVISION_MISMATCH",
  AMBIGUOUS_ROOT: "AMBIGUOUS_ROOT",
  SCOPE_INVALID: "SCOPE_INVALID",
  INCOMPARABLE_RUNS: "INCOMPARABLE_RUNS",
  TIMEOUT: "TIMEOUT",
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  AI_OUTPUT_REJECTED: "AI_OUTPUT_REJECTED",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
export const ErrorCodeSchema = z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  SCOPE_INVALID: 400,
  INVALID_REFERENCE: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STALE_VERSION: 409,
  INVALID_TRANSITION: 409,
  VERIFICATION_REQUIRED: 409,
  DUPLICATE_ACTION: 409,
  PREVIEW_REJECTED: 409,
  REVISION_MISMATCH: 409,
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

/** Thrown by domain services (Codey), translated by routes (Zubair). Never wrap raw Neo4j errors. */
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
// Server-derived context, pagination, idempotency
// ---------------------------------------------------------------------------

/** Supplied by the server (env-configured synthetic demo identity). NOT production authentication. */
export const RequestContextSchema = z.object({ workspaceId: IdSchema, actorId: IdSchema });
export type RequestContext = z.infer<typeof RequestContextSchema>;

export const PageRequestSchema = z.object({
  cursor: z.string().max(512).nullable().default(null),
  limit: z.number().int().min(1).max(LIMITS.maxListLimit).default(LIMITS.defaultListLimit),
});
export type PageRequest = z.infer<typeof PageRequestSchema>;

export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable(), total: CountSchema.nullable() });
export type Page<T> = { items: T[]; nextCursor: string | null; total: number | null };

/**
 * Create commands carry a client-generated idempotency key (UUID or similar). Replaying the same
 * key with the same payload returns the original record; a different payload is DUPLICATE_ACTION.
 */
export const IdempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
export const IDEMPOTENCY_HEADER = "idempotency-key" as const;

// ---------------------------------------------------------------------------
// Evidence and review issues (shared by issues and traces)
// ---------------------------------------------------------------------------

export const EVIDENCE_SOURCE_KINDS = [
  "manual",
  "internal_import",
  "supplier_notice",
  "public_complaint",
  "public_recall",
  "manufacturer_communication",
  "synthetic",
] as const;
export const EvidenceSourceKindSchema = z.enum(EVIDENCE_SOURCE_KINDS);
export type EvidenceSourceKind = z.infer<typeof EvidenceSourceKindSchema>;

/**
 * Provenance is first-class: public records (NHTSA complaints/recalls) keep their source id, URL
 * and retrieval date and are never joined to synthetic factory entities as actual occurrences.
 */
export const EvidenceSchema = z.object({
  id: IdSchema,
  sourceName: LabelSchema,
  sourceHash: Sha256Schema,
  locator: LabelSchema,
  text: z.string().max(LIMITS.maxImportFileChars),
  sourceKind: EvidenceSourceKindSchema,
  sourceRecordId: z.string().max(LIMITS.labelMaxLength).nullable(),
  sourceUrl: z.string().url().max(2048).nullable(),
  retrievedAt: UtcIsoSchema.nullable(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** Manual evidence attached by a user (server fills hash, kind=manual, nulls). */
export const EvidenceInputSchema = z.object({
  sourceName: LabelSchema,
  locator: LabelSchema.default("manual-note"),
  text: z.string().min(1).max(LIMITS.textMaxLength),
});
export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;

export const IssueSeveritySchema = z.enum(["warning", "blocking"]);
export const ReviewIssueSchema = z.object({
  id: IdSchema,
  code: z.string().min(1).max(64),
  severity: IssueSeveritySchema,
  message: MessageSchema,
  entityIds: IdListSchema,
  evidenceIds: IdListSchema,
});
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

// ---------------------------------------------------------------------------
// Entities and production origin (shared vocabulary)
// ---------------------------------------------------------------------------

export const ENTITY_KINDS = ["component", "subassembly", "vehicle"] as const;
export const EntityKindSchema = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const SOURCING_TYPES = ["supplier", "in_house", "unknown"] as const;
export const SourcingTypeSchema = z.enum(SOURCING_TYPES);
export type SourcingType = z.infer<typeof SourcingTypeSchema>;

/**
 * Origin is recorded per physical instance (batch/lot level), never assumed per part number.
 * Supplier origin fills supplierId/supplierBatchCode. In-house origin fills siteId,
 * manufacturingLotCode, workOrderId, manufacturingTeamId, processStepId. Unknown keeps nulls.
 * A manufacturing team named here is a producer, never an implied cause.
 */
export const ProductionOriginSchema = z.object({
  id: IdSchema,
  sourcingType: SourcingTypeSchema,
  producerOrganizationId: IdSchema.nullable(),
  partNumber: LabelSchema,
  partRevision: LabelSchema.nullable(),
  productionLotId: IdSchema.nullable(),
  supplierId: IdSchema.nullable(),
  supplierBatchCode: LabelSchema.nullable(),
  siteId: IdSchema.nullable(),
  manufacturingLotCode: LabelSchema.nullable(),
  workOrderId: IdSchema.nullable(),
  manufacturingTeamId: IdSchema.nullable(),
  processStepId: IdSchema.nullable(),
  evidenceIds: IdListSchema,
});
export type ProductionOrigin = z.infer<typeof ProductionOriginSchema>;

/** A vehicle is identified by its internal build id; VIN is null until assigned. */
export const VehicleIdentitySchema = z.object({
  entityId: IdSchema,
  buildId: LabelSchema,
  vin: z.string().min(11).max(17).nullable(),
});
export type VehicleIdentity = z.infer<typeof VehicleIdentitySchema>;

export const LOCATION_STATES = ["onsite", "installed", "shipped", "quarantine", "unknown"] as const;
export const LocationStateSchema = z.enum(LOCATION_STATES);
export type LocationState = z.infer<typeof LocationStateSchema>;

/** One physical serialized entity (component, subassembly or vehicle). Displayed codes != ids. */
export const EntityRecordSchema = z.object({
  id: IdSchema,
  kind: EntityKindSchema,
  partNumber: LabelSchema,
  partRevision: LabelSchema.nullable(),
  serialNumber: LabelSchema,
  displayCode: LabelSchema,
  issuerId: IdSchema.nullable(),
  locationState: LocationStateSchema,
  origin: ProductionOriginSchema.nullable(),
  vehicle: VehicleIdentitySchema.nullable(),
});
export type EntityRecord = z.infer<typeof EntityRecordSchema>;

/** Actual physical containment: half-open interval [installedAt, removedAt). */
export const InstallationSchema = z.object({
  id: IdSchema,
  childId: IdSchema,
  parentId: IdSchema,
  slotId: LabelSchema,
  installedAt: UtcIsoSchema,
  removedAt: UtcIsoSchema.nullable(),
  recordedAt: UtcIsoSchema,
  evidenceIds: IdListSchema,
});
export type Installation = z.infer<typeof InstallationSchema>;

/** Assembly context for one entity: its origin, where it sits now, and which vehicle(s) it reached. */
export const EntityContextSchema = z.object({
  entity: EntityRecordSchema,
  /** Parent chain at the requested configuration time, innermost first. */
  currentParents: z.array(EntityRecordSchema),
  /** Children currently installed (subassemblies/vehicles). */
  currentChildren: z.array(EntityRecordSchema),
  /** All installation intervals touching this entity, including removed ones. */
  installations: z.array(InstallationSchema),
  /** Distinct vehicles this entity is or was installed in. */
  currentVehicleIds: IdListSchema,
  historicalVehicleIds: IdListSchema,
  evidence: z.array(EvidenceSchema),
  limitations: z.array(z.string().max(LIMITS.maxLimitationChars)),
});
export type EntityContext = z.infer<typeof EntityContextSchema>;
