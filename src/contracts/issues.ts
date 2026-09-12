/**
 * RecallRadius issue workflow contract. Contract version: assembly-quality-v4 (2026-09-12).
 *
 * Manual issue -> assignment -> cause investigation -> prior verified fix -> new fix revision ->
 * verification -> closure -> reuse and analytics. Creating an issue needs no import and no model.
 *
 * Ownership: Zubair (this file). Codey implements `IssueServices` in src/server/graph/index.ts.
 * Ali consumes the DTOs and `ISSUE_ROUTES` through a typed client. Safe to import from client code.
 */
import { z } from "zod";
import {
  CONTRACT_VERSION,
  CountSchema,
  EntityContextSchema,
  EntityRecordSchema,
  EvidenceInputSchema,
  EvidenceSchema,
  IdListSchema,
  IdSchema,
  IdempotencyKeySchema,
  LIMITS,
  LabelSchema,
  NullableRateSchema,
  PageRequestSchema,
  TextSchema,
  UtcIsoSchema,
  pageSchema,
  type EntityContext,
  type Page,
  type RequestContext,
} from "./common";

export { CONTRACT_VERSION };

// ---------------------------------------------------------------------------
// Enumerations (frozen)
// ---------------------------------------------------------------------------

export const ISSUE_STATUSES = ["open", "triaged", "in_progress", "pending_verification", "closed"] as const;
export const IssueStatusSchema = z.enum(ISSUE_STATUSES);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const ISSUE_ORIGINS = ["manual", "import", "supplier_notice"] as const;
export const IssueOriginSchema = z.enum(ISSUE_ORIGINS);
export type IssueOrigin = z.infer<typeof IssueOriginSchema>;

export const SEVERITIES = ["minor", "major", "critical"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export const CAUSE_STATES = ["hypothesis", "confirmed", "rejected"] as const;
export const CauseStateSchema = z.enum(CAUSE_STATES);
export type CauseState = z.infer<typeof CauseStateSchema>;

/** `in_house_manufacturing` covers parts made internally; a producer link alone never confirms it. */
export const CAUSE_TYPES = [
  "supplier_component",
  "in_house_manufacturing",
  "assembly_process",
  "design",
  "calibration",
  "handling",
  "unknown",
] as const;
export const CauseTypeSchema = z.enum(CAUSE_TYPES);
export type CauseType = z.infer<typeof CauseTypeSchema>;

export const FIX_STATES = ["proposed", "applied", "verified"] as const;
export const FixStateSchema = z.enum(FIX_STATES);
export type FixState = z.infer<typeof FixStateSchema>;

/** Status transition commands. `close` requires a passed verification for the applied fix revision. */
export const TRANSITION_ACTIONS = ["triage", "start_work", "request_verification", "close", "reopen"] as const;
export const TransitionActionSchema = z.enum(TRANSITION_ACTIONS);
export type TransitionAction = z.infer<typeof TransitionActionSchema>;

/** Allowed transitions: action -> [from statuses] -> to status. Services enforce; UI may pre-check. */
export const TRANSITIONS: Record<TransitionAction, { from: readonly IssueStatus[]; to: IssueStatus }> = {
  triage: { from: ["open"], to: "triaged" },
  start_work: { from: ["open", "triaged"], to: "in_progress" },
  request_verification: { from: ["in_progress"], to: "pending_verification" },
  close: { from: ["pending_verification", "in_progress"], to: "closed" },
  reopen: { from: ["closed"], to: "in_progress" },
};

export const TEAM_ROLES = ["reporting", "assigned", "confirmed_cause"] as const;
export const TeamRoleSchema = z.enum(TEAM_ROLES);
export type TeamRole = z.infer<typeof TeamRoleSchema>;

// ---------------------------------------------------------------------------
// Reference catalogs (seeded; manual directory entry supported)
// ---------------------------------------------------------------------------

export const CatalogItemSchema = z.object({
  id: IdSchema,
  name: LabelSchema,
  active: z.boolean().default(true),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const StationSchema = CatalogItemSchema.extend({ siteId: IdSchema.nullable(), areaLabel: LabelSchema.nullable() });
export type Station = z.infer<typeof StationSchema>;

export const ProcessStepSchema = CatalogItemSchema.extend({ areaLabel: LabelSchema.nullable() });
export type ProcessStep = z.infer<typeof ProcessStepSchema>;

export const DefectCodeSchema = CatalogItemSchema.extend({ family: LabelSchema.nullable() });
export type DefectCode = z.infer<typeof DefectCodeSchema>;

export const CATALOG_KINDS = ["teams", "suppliers", "stations", "processSteps", "defectCodes"] as const;
export const CatalogKindSchema = z.enum(CATALOG_KINDS);
export type CatalogKind = z.infer<typeof CatalogKindSchema>;

export const ReferenceCatalogSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  teams: z.array(CatalogItemSchema),
  suppliers: z.array(CatalogItemSchema),
  stations: z.array(StationSchema),
  processSteps: z.array(ProcessStepSchema),
  defectCodes: z.array(DefectCodeSchema),
  sites: z.array(CatalogItemSchema),
});
export type ReferenceCatalog = z.infer<typeof ReferenceCatalogSchema>;

/** Manual directory entry. `id` optional: server generates one from the name when omitted. */
export const CatalogUpsertSchema = z.object({
  id: IdSchema.optional(),
  name: LabelSchema,
  active: z.boolean().default(true),
  siteId: IdSchema.nullable().optional(),
  areaLabel: LabelSchema.nullable().optional(),
  family: LabelSchema.nullable().optional(),
});
export type CatalogUpsert = z.infer<typeof CatalogUpsertSchema>;

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export const IssueInputSchema = z.object({
  title: LabelSchema,
  description: TextSchema,
  origin: IssueOriginSchema,
  detectedAt: UtcIsoSchema,
  reportingTeamId: IdSchema,
  assignedTeamId: IdSchema.nullable(),
  detectionStationId: IdSchema.nullable(),
  processStepId: IdSchema.nullable(),
  /** Marked component/subassembly/vehicle entity ids. Unknown context stays empty. */
  entityIds: IdListSchema,
  partNumber: LabelSchema.nullable(),
  partRevision: LabelSchema.nullable(),
  /** Linked suppliers are context, never confirmed fault. */
  linkedSupplierIds: IdListSchema,
  defectCode: IdSchema.nullable(),
  severity: SeveritySchema,
  evidenceIds: IdListSchema,
});
export type IssueInput = z.infer<typeof IssueInputSchema>;

/** Create command: input plus idempotency key (also accepted via the `Idempotency-Key` header). */
export const CreateIssueCommandSchema = IssueInputSchema.extend({
  idempotencyKey: IdempotencyKeySchema,
  /** Optional inline manual evidence created with the issue (server assigns ids and hashes). */
  newEvidence: z.array(EvidenceInputSchema).max(10).default([]),
});
export type CreateIssueCommand = z.infer<typeof CreateIssueCommandSchema>;

export const IssueSchema = IssueInputSchema.extend({
  id: IdSchema,
  version: z.number().int().positive(),
  status: IssueStatusSchema,
  createdBy: IdSchema,
  createdAt: UtcIsoSchema,
  updatedAt: UtcIsoSchema,
  /** Denormalized for lists: id of the current confirmed primary cause, if any. */
  confirmedCauseId: IdSchema.nullable(),
  /** Denormalized for lists: fix revision currently applied/verified, if any. */
  currentFixRevisionId: IdSchema.nullable(),
});
export type Issue = z.infer<typeof IssueSchema>;

/** PATCH is limited to descriptive/assignment fields; status changes go through transitions. */
export const IssueUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: LabelSchema.optional(),
  description: TextSchema.optional(),
  assignedTeamId: IdSchema.nullable().optional(),
  detectionStationId: IdSchema.nullable().optional(),
  processStepId: IdSchema.nullable().optional(),
  entityIds: IdListSchema.optional(),
  partNumber: LabelSchema.nullable().optional(),
  partRevision: LabelSchema.nullable().optional(),
  linkedSupplierIds: IdListSchema.optional(),
  defectCode: IdSchema.nullable().optional(),
  severity: SeveritySchema.optional(),
  evidenceIds: IdListSchema.optional(),
});
export type IssueUpdate = z.infer<typeof IssueUpdateSchema>;

export const IssueCommentInputSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  body: z.string().min(1).max(LIMITS.textMaxLength),
  evidenceIds: IdListSchema.default([]),
  newEvidence: z.array(EvidenceInputSchema).max(10).default([]),
});
export type IssueCommentInput = z.infer<typeof IssueCommentInputSchema>;

export const IssueCommentSchema = z.object({
  id: IdSchema,
  issueId: IdSchema,
  body: z.string().max(LIMITS.textMaxLength),
  evidenceIds: IdListSchema,
  authorId: IdSchema,
  createdAt: UtcIsoSchema,
});
export type IssueComment = z.infer<typeof IssueCommentSchema>;

// ---------------------------------------------------------------------------
// Cause assessments, fixes, verifications, transitions, audit
// ---------------------------------------------------------------------------

export const CauseAssessmentInputSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  state: CauseStateSchema,
  causeType: CauseTypeSchema,
  responsibleTeamId: IdSchema.nullable(),
  responsibleSupplierId: IdSchema.nullable(),
  causalStationId: IdSchema.nullable(),
  causalProcessStepId: IdSchema.nullable().default(null),
  rationale: z.string().min(1).max(LIMITS.textMaxLength),
  evidenceIds: IdListSchema,
  /** Previous primary assessment this one replaces; the old record is retained. */
  supersedesId: IdSchema.nullable().default(null),
});
export type CauseAssessmentInput = z.infer<typeof CauseAssessmentInputSchema>;

export const CauseAssessmentSchema = CauseAssessmentInputSchema.omit({ idempotencyKey: true }).extend({
  id: IdSchema,
  issueId: IdSchema,
  assessedBy: IdSchema,
  assessedAt: UtcIsoSchema,
  /** True for the single current primary assessment of the issue. */
  isCurrent: z.boolean(),
});
export type CauseAssessment = z.infer<typeof CauseAssessmentSchema>;

export const FixStepSchema = z.object({ order: z.number().int().positive(), instruction: z.string().min(1).max(LIMITS.textMaxLength) });
export const FixApplicabilitySchema = z.object({
  partNumber: LabelSchema.nullable(),
  partRevision: LabelSchema.nullable(),
  processStepId: IdSchema.nullable(),
  limitations: z.array(z.string().max(LIMITS.maxLimitationChars)).max(LIMITS.maxLimitations),
});

export const FixRevisionInputSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  summary: LabelSchema,
  steps: z.array(FixStepSchema).min(1).max(LIMITS.maxFixSteps),
  applicability: FixApplicabilitySchema,
  /** Reuse: the historical fix this proposal was copied from. The source is never modified. */
  sourceFixRevisionId: IdSchema.nullable().default(null),
  /** Approved work-instruction reference (placeholder names in the demo). */
  workInstructionRef: LabelSchema.nullable().default(null),
  evidenceIds: IdListSchema.default([]),
});
export type FixRevisionInput = z.infer<typeof FixRevisionInputSchema>;

export const FixRevisionSchema = FixRevisionInputSchema.omit({ idempotencyKey: true }).extend({
  id: IdSchema,
  issueId: IdSchema,
  version: z.number().int().positive(),
  state: FixStateSchema,
  createdBy: IdSchema,
  createdAt: UtcIsoSchema,
  appliedAt: UtcIsoSchema.nullable(),
});
export type FixRevision = z.infer<typeof FixRevisionSchema>;

export const VerificationInputSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  fixRevisionId: IdSchema,
  outcome: z.enum(["pass", "fail"]),
  method: LabelSchema,
  resultNotes: z.string().min(1).max(LIMITS.textMaxLength),
  evidenceIds: IdListSchema,
  newEvidence: z.array(EvidenceInputSchema).max(10).default([]),
});
export type VerificationInput = z.infer<typeof VerificationInputSchema>;

export const VerificationSchema = VerificationInputSchema.omit({ idempotencyKey: true, newEvidence: true }).extend({
  id: IdSchema,
  issueId: IdSchema,
  verifiedBy: IdSchema,
  verifiedAt: UtcIsoSchema,
});
export type Verification = z.infer<typeof VerificationSchema>;

export const TransitionCommandSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  action: TransitionActionSchema,
  expectedVersion: z.number().int().positive(),
  reason: z.string().max(LIMITS.textMaxLength).default(""),
  /** Required for `close`: the applied fix revision whose passed verification justifies closure. */
  fixRevisionId: IdSchema.nullable().default(null),
});
export type TransitionCommand = z.infer<typeof TransitionCommandSchema>;

export const AUDIT_EVENT_KINDS = [
  "created",
  "updated",
  "commented",
  "cause_recorded",
  "fix_created",
  "fix_applied",
  "verification_recorded",
  "transition",
] as const;
export const AuditEventSchema = z.object({
  id: IdSchema,
  issueId: IdSchema,
  kind: z.enum(AUDIT_EVENT_KINDS),
  actorId: IdSchema,
  at: UtcIsoSchema,
  fromStatus: IssueStatusSchema.nullable(),
  toStatus: IssueStatusSchema.nullable(),
  summary: z.string().max(LIMITS.messageMaxLength),
  subjectId: IdSchema.nullable(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// ---------------------------------------------------------------------------
// Detail, list, similar resolutions, insights
// ---------------------------------------------------------------------------

export const IssueDetailSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  issue: IssueSchema,
  /** Marked entities with production origin (supplier vs in-house vs unknown) and vehicle identity. */
  entities: z.array(EntityRecordSchema),
  /** Optional assembly context per entity (current parents/vehicles); may be empty when unknown. */
  entityContexts: z.array(EntityContextSchema),
  causes: z.array(CauseAssessmentSchema),
  fixes: z.array(FixRevisionSchema),
  verifications: z.array(VerificationSchema),
  comments: z.array(IssueCommentSchema),
  audit: z.array(AuditEventSchema),
  evidence: z.array(EvidenceSchema),
});
export type IssueDetail = z.infer<typeof IssueDetailSchema>;

export const IssueListFilterSchema = PageRequestSchema.extend({
  status: z.array(IssueStatusSchema).optional(),
  severity: z.array(SeveritySchema).optional(),
  teamId: IdSchema.optional(),
  teamRole: TeamRoleSchema.optional(),
  supplierId: IdSchema.optional(),
  defectCode: IdSchema.optional(),
  partNumber: LabelSchema.optional(),
  stationId: IdSchema.optional(),
  processStepId: IdSchema.optional(),
  entityId: IdSchema.optional(),
  detectedFrom: UtcIsoSchema.optional(),
  detectedToExclusive: UtcIsoSchema.optional(),
  text: z.string().max(LIMITS.labelMaxLength).optional(),
});
export type IssueListFilter = z.infer<typeof IssueListFilterSchema>;

export const IssuePageSchema = pageSchema(IssueSchema);
export type IssuePage = Page<Issue>;

export const SimilarResolutionSchema = z.object({
  sourceIssueId: IdSchema,
  sourceIssueTitle: LabelSchema,
  sourceFixRevisionId: IdSchema,
  fixSummary: LabelSchema,
  /** Deterministic reasons, e.g. "same defect code TORQUE_LOW", "same part family JOINT-10". */
  matchReasons: z.array(z.string().max(LIMITS.messageMaxLength)),
  /** e.g. "part revision differs (B vs C): engineering review required". */
  applicabilityWarnings: z.array(z.string().max(LIMITS.messageMaxLength)),
  verificationId: IdSchema,
  verifiedAt: UtcIsoSchema,
  evidenceIds: IdListSchema,
  /** "verified" fixes rank before "unverified" suggestions; the latter are listed but flagged. */
  rank: z.number().int().nonnegative(),
});
export type SimilarResolution = z.infer<typeof SimilarResolutionSchema>;

export const SimilarResolutionsSchema = z.object({
  issueId: IdSchema,
  results: z.array(SimilarResolutionSchema),
  queryExplanation: z.string().max(LIMITS.messageMaxLength),
});
export type SimilarResolutions = z.infer<typeof SimilarResolutionsSchema>;

export const InsightsFilterSchema = z.object({
  detectedFrom: UtcIsoSchema.optional(),
  detectedToExclusive: UtcIsoSchema.optional(),
  teamRole: TeamRoleSchema.optional(),
  supplierId: IdSchema.optional(),
  partNumber: LabelSchema.optional(),
  defectCode: IdSchema.optional(),
  stationId: IdSchema.optional(),
  processStepId: IdSchema.optional(),
  status: z.array(IssueStatusSchema).optional(),
  severity: z.array(SeveritySchema).optional(),
});
export type InsightsFilter = z.infer<typeof InsightsFilterSchema>;

/** Every count carries the issue ids behind it so the UI can drill down without recomputing. */
export const CountBucketSchema = z.object({ id: IdSchema, label: LabelSchema, issueCount: CountSchema, issueIds: IdListSchema });
export type CountBucket = z.infer<typeof CountBucketSchema>;

export const TeamInsightSchema = z.object({
  teamId: IdSchema,
  teamName: LabelSchema,
  reportedIssueCount: CountSchema,
  assignedOpenCount: CountSchema,
  confirmedCauseIssueCount: CountSchema,
  reportedIssueIds: IdListSchema,
  assignedOpenIssueIds: IdListSchema,
  confirmedCauseIssueIds: IdListSchema,
});
export type TeamInsight = z.infer<typeof TeamInsightSchema>;

/** Supplier metrics: linked vs confirmed are separate; the rate is null without a complete cohort. */
export const SupplierInsightSchema = z.object({
  supplierId: IdSchema,
  supplierName: LabelSchema,
  linkedIssueCount: CountSchema,
  confirmedIssueCount: CountSchema,
  distinctAffectedUnitCount: CountSchema,
  inspectedUnitCount: CountSchema.nullable(),
  cohortComplete: z.boolean(),
  affectedUnitRate: NullableRateSchema,
  linkedIssueIds: IdListSchema,
  confirmedIssueIds: IdListSchema,
});
export type SupplierInsight = z.infer<typeof SupplierInsightSchema>;

export const InsightsSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  filter: InsightsFilterSchema,
  totalIssueCount: CountSchema,
  openIssueCount: CountSchema,
  teams: z.array(TeamInsightSchema),
  suppliers: z.array(SupplierInsightSchema),
  /** Where defects were detected (stations). Detection is not cause. */
  detectionStations: z.array(CountBucketSchema),
  /** Confirmed causal process steps / stations. */
  causalProcessSteps: z.array(CountBucketSchema),
  causeTypes: z.array(CountBucketSchema),
  defectFamilies: z.array(CountBucketSchema),
  reusedFixCount: CountSchema,
  reopenedIssueCount: CountSchema,
  notes: z.array(z.string().max(LIMITS.messageMaxLength)),
});
export type Insights = z.infer<typeof InsightsSchema>;

// ---------------------------------------------------------------------------
// Optional AI (Zubair): free-text -> editable issue draft with evidence spans
// ---------------------------------------------------------------------------

export const IssueDraftRequestSchema = z.object({
  sourceId: IdSchema,
  text: z.string().min(1).max(LIMITS.maxFreeTextChars),
});
export type IssueDraftRequest = z.infer<typeof IssueDraftRequestSchema>;

export const ISSUE_DRAFT_FIELDS = ["title", "description", "partNumber", "partRevision", "defectCode", "entityIds", "detectionStationId", "severity"] as const;
export const IssueDraftFieldSchema = z.enum(ISSUE_DRAFT_FIELDS);
export const IssueDraftSpanSchema = z.object({
  field: IssueDraftFieldSchema,
  sourceId: IdSchema,
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  exactText: z.string().min(1),
});
export const IssueDraftSchema = z.object({
  title: LabelSchema.nullable(),
  description: TextSchema.nullable(),
  partNumber: LabelSchema.nullable(),
  partRevision: LabelSchema.nullable(),
  /** Free-text candidate; the UI maps it to a catalog defect code with the user. */
  defectCode: LabelSchema.nullable(),
  /** Candidate serial/build codes as written; the UI matches them to known entities. */
  entityIds: z.array(LabelSchema).max(10),
  detectionStationId: LabelSchema.nullable(),
  severity: SeveritySchema.nullable(),
  evidence: z.array(IssueDraftSpanSchema),
  unresolvedFields: z.array(IssueDraftFieldSchema),
});
export type IssueDraft = z.infer<typeof IssueDraftSchema>;

export const IssueDraftResultSchema = z.object({
  sourceId: IdSchema,
  status: z.literal("draft"),
  draft: IssueDraftSchema,
  provider: z.object({ name: z.string().min(1).max(64), mode: z.enum(["live", "stub"]), model: z.string().max(128).nullable() }),
  warnings: z.array(z.string().max(LIMITS.messageMaxLength)),
});
export type IssueDraftResult = z.infer<typeof IssueDraftResultSchema>;

/** Model explanation of already-retrieved resolutions; may cite only ids present in `citedIds`. */
export const ResolutionExplanationSchema = z.object({
  issueId: IdSchema,
  status: z.literal("proposal"),
  explanation: z.string().max(LIMITS.textMaxLength),
  citedIds: IdListSchema,
  provider: z.object({ name: z.string().min(1).max(64), mode: z.enum(["live", "stub"]), model: z.string().max(128).nullable() }),
  warnings: z.array(z.string().max(LIMITS.messageMaxLength)),
});
export type ResolutionExplanation = z.infer<typeof ResolutionExplanationSchema>;

/** Bounded server tools exposed to the in-app agent. Read-only; no Cypher, no writes. */
export const AGENT_TOOLS = ["find_similar_resolutions", "get_entity_context", "get_issue_insights"] as const;
export const AgentToolSchema = z.enum(AGENT_TOOLS);
export type AgentTool = z.infer<typeof AgentToolSchema>;
export const AgentToolRequestSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("find_similar_resolutions"), issueId: IdSchema }),
  z.object({ tool: z.literal("get_entity_context"), entityId: IdSchema, configurationAsOf: UtcIsoSchema.optional() }),
  z.object({ tool: z.literal("get_issue_insights"), filter: InsightsFilterSchema.default({}) }),
]);
export type AgentToolRequest = z.infer<typeof AgentToolRequestSchema>;

// ---------------------------------------------------------------------------
// Routes (owned by Zubair)
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;
export const ISSUE_ROUTES = {
  catalog: { method: "GET", path: "/api/catalog" },
  catalogUpsert: { method: "POST", path: (kind: CatalogKind) => `/api/catalog/${kind}` },
  entityContext: { method: "GET", path: (entityId: string) => `/api/entities/${enc(entityId)}` },
  issueCreate: { method: "POST", path: "/api/issues" },
  issueList: { method: "GET", path: "/api/issues" },
  issuesExport: { method: "GET", path: "/api/issues/export" },
  issueGet: { method: "GET", path: (id: string) => `/api/issues/${enc(id)}` },
  issueUpdate: { method: "PATCH", path: (id: string) => `/api/issues/${enc(id)}` },
  issueComment: { method: "POST", path: (id: string) => `/api/issues/${enc(id)}/comments` },
  issueCause: { method: "POST", path: (id: string) => `/api/issues/${enc(id)}/causes` },
  issueFix: { method: "POST", path: (id: string) => `/api/issues/${enc(id)}/fixes` },
  issueVerification: { method: "POST", path: (id: string) => `/api/issues/${enc(id)}/verifications` },
  issueTransition: { method: "POST", path: (id: string) => `/api/issues/${enc(id)}/transitions` },
  issueSimilar: { method: "GET", path: (id: string) => `/api/issues/${enc(id)}/similar-resolutions` },
  insights: { method: "GET", path: "/api/insights" },
  agentDraftIssue: { method: "POST", path: "/api/agent/draft-issue" },
  agentExplainResolutions: { method: "POST", path: (id: string) => `/api/agent/issues/${enc(id)}/explain-resolutions` },
  agentTool: { method: "POST", path: "/api/agent/tools" },
} as const;

/**
 * Route I/O summary (inside ApiResponse):
 *   catalog                 -                         -> ReferenceCatalog
 *   catalogUpsert           CatalogUpsert             -> CatalogItem | Station | ProcessStep | DefectCode (201)
 *   entityContext           ?configurationAsOf=       -> EntityContext
 *   issueCreate             CreateIssueCommand        -> Issue (201; replay of same key+payload returns 200)
 *   issueList               IssueListFilter as query  -> IssuePage
 *   issuesExport            IssueListFilter as query  -> text/csv (ApiResponse JSON only on error)
 *   issueGet                -                         -> IssueDetail
 *   issueUpdate             IssueUpdate               -> Issue
 *   issueComment            IssueCommentInput         -> IssueComment (201)
 *   issueCause              CauseAssessmentInput      -> CauseAssessment (201)
 *   issueFix                FixRevisionInput          -> FixRevision (201)
 *   issueVerification       VerificationInput         -> Verification (201)
 *   issueTransition         TransitionCommand         -> Issue
 *   issueSimilar            -                         -> SimilarResolutions
 *   insights                InsightsFilter as query   -> Insights
 *   agentDraftIssue         IssueDraftRequest         -> IssueDraftResult
 *   agentExplainResolutions -                         -> ResolutionExplanation
 *   agentTool               AgentToolRequest          -> tool-specific DTO
 */

// ---------------------------------------------------------------------------
// Domain services (implemented by Codey, consumed by Zubair)
// ---------------------------------------------------------------------------

export interface IssueServices {
  getCatalog(ctx: RequestContext): Promise<ReferenceCatalog>;
  upsertCatalogItem(ctx: RequestContext, input: { kind: CatalogKind; item: CatalogUpsert }): Promise<CatalogItem | Station | ProcessStep | DefectCode>;
  getEntityContext(ctx: RequestContext, input: { entityId: string; configurationAsOf: string | null }): Promise<EntityContext>;
  createIssue(ctx: RequestContext, command: CreateIssueCommand): Promise<{ issue: Issue; replayed: boolean }>;
  listIssues(ctx: RequestContext, filter: IssueListFilter): Promise<IssuePage>;
  getIssue(ctx: RequestContext, input: { issueId: string }): Promise<IssueDetail>;
  updateIssue(ctx: RequestContext, input: { issueId: string; update: IssueUpdate }): Promise<Issue>;
  addIssueComment(ctx: RequestContext, input: { issueId: string; comment: IssueCommentInput }): Promise<IssueComment>;
  recordCauseAssessment(ctx: RequestContext, input: { issueId: string; assessment: CauseAssessmentInput }): Promise<CauseAssessment>;
  createFixRevision(ctx: RequestContext, input: { issueId: string; fix: FixRevisionInput }): Promise<FixRevision>;
  recordVerification(ctx: RequestContext, input: { issueId: string; verification: VerificationInput }): Promise<Verification>;
  transitionIssue(ctx: RequestContext, input: { issueId: string; command: TransitionCommand }): Promise<Issue>;
  findSimilarResolutions(ctx: RequestContext, input: { issueId: string }): Promise<SimilarResolutions>;
  getInsights(ctx: RequestContext, filter: InsightsFilter): Promise<Insights>;
}

// ---------------------------------------------------------------------------
// Synthetic EV demo constants and regression expectations (identical in every lane)
// ---------------------------------------------------------------------------

/** EV demo identifiers (fictional; see docs/EV_ASSEMBLY_SCOPE.md). Codey's fixture must use these. */
export const EV_DEMO = {
  workspaceId: "synthetic-ev-assembler",
  siteId: "PLANT-1",
  teams: {
    finalInspection: "TEAM-FINAL-INSPECTION",
    inHouseManufacturing: "TEAM-INHOUSE-MFG",
    assembly: "TEAM-ASSEMBLY",
    supplierQuality: "TEAM-SUPPLIER-QUALITY",
    incomingQuality: "TEAM-INCOMING-QA",
  },
  suppliers: { connector: "SUP-CONNECTOR" },
  stations: { finalInspection: "ST-FINAL-INSPECTION", chargePortAssembly: "ST-CHARGEPORT-ASSEMBLY", bracketCell: "ST-BRACKET-CELL" },
  processSteps: { chargePortInstall: "chargeport-install", bracketForming: "bracket-forming", finalInspection: "final-inspection" },
  defectCodes: { misalignment: "CONNECTOR_MISALIGNED", bracketDimension: "BRACKET_OUT_OF_TOLERANCE" },
  parts: { connector: "CP-CONN-100", bracket: "CP-BRKT-200", module: "CP-MOD-300", vehicle: "EV-PLATFORM-1" },
  supplierLotCode: "DEMO-SUP-LOT-01",
  manufacturingLotCode: "DEMO-MFG-LOT-01",
  workOrderId: "WO-DEMO-0001",
  entities: { connector: "CONN-0005", bracket: "BRKT-0005", module: "CPM-0005", vehicle: "DEMO-EV-005" },
  vehicleBuildId: "DEMO-EV-005",
  priorVerifiedFixId: "FIX-BRKT-PRIOR-V1",
  priorIssueId: "ISS-BRKT-PRIOR",
} as const;

/** Arithmetic regression oracle from docs/reference/quality (robot-era ids; not EV factory data). */
export const QUALITY_REGRESSION_EXPECTATIONS = {
  "SUP-A": { confirmedIssueCount: 4, distinctAffectedUnitCount: 3, inspectedUnitCount: 20, affectedUnitRate: 0.15 },
  "SUP-B": { confirmedIssueCount: 2, distinctAffectedUnitCount: 2, inspectedUnitCount: 10, affectedUnitRate: 0.2 },
  similarFixForManualDemo: "FIX-ASM-01-V1",
  closedAssemblyIssueReportingTeam: "TEAM-FINAL-TEST",
  closedAssemblyIssueCausingTeam: "TEAM-MECHANICAL",
} as const;
