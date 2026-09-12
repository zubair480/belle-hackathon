/**
 * Typed client surface consumed by the RecallRadius UI (Ali's lane).
 * Every method maps 1:1 to a frozen route in src/contracts/issues.ts and returns the
 * ApiResponse envelope re-typed as `ClientResult`. Nothing here imports server code.
 */
import type { ErrorCode } from "@/contracts/common";
import type {
  CauseAssessment,
  CauseAssessmentInput,
  CreateIssueCommand,
  FixRevision,
  FixRevisionInput,
  Insights,
  InsightsFilter,
  Issue,
  IssueComment,
  IssueCommentInput,
  IssueDetail,
  IssueListFilter,
  IssuePage,
  IssueUpdate,
  ReferenceCatalog,
  SimilarResolutions,
  TransitionCommand,
  Verification,
  VerificationInput,
} from "@/contracts/issues";
import type { EntityContext } from "@/contracts/common";
import type { TraceRequest, TraceResult } from "@/contracts/recall";
import type { AgentChatRequest, AgentChatResponse } from "../../../agent/types";
import type { WorkspaceGraph } from "../graph/model";
import type { CatalogItem, CatalogKind, CatalogUpsert } from "@/contracts/issues";

/** `NETWORK` is client-side only: the request never produced a valid envelope. */
export type ClientErrorCode = ErrorCode | "NETWORK";
export type ClientError = { code: ClientErrorCode; message: string; details?: unknown };
export type ClientResult<T> = { ok: true; data: T } | { ok: false; error: ClientError };

/** GET /api/health as reported by the server: which domain services are wired and whether Neo4j is configured. */
export type BackendHealth = { ok: boolean; contractVersion: string; servicesMode: string; servicesRegistered: boolean; neo4jConfigured: boolean; aiProvider: string; workspaceId: string | null };
/** Platform design dataset (part slots, wires, circuits, connectors) as served by the backend; `source` says where it was read from. */
export type PlatformDesign = { platform: string; revision: string; source: "neo4j" | "bundled"; counts: { slots: number; wires: number; circuits: number; connectors: number }; slotIds: string[]; wireIds: string[]; circuitIds: string[] };

export type ClientMode = "mock" | "live";

export interface RecallClient {
  readonly mode: ClientMode;
  /** Human-readable label shown in the top bar (e.g. "Sample data (mock mode)"). */
  readonly modeLabel: string;
  getCatalog(): Promise<ClientResult<ReferenceCatalog>>;
  getEntityContext(entityId: string, configurationAsOf?: string): Promise<ClientResult<EntityContext>>;
  createIssue(command: CreateIssueCommand): Promise<ClientResult<Issue>>;
  listIssues(filter: Partial<IssueListFilter>): Promise<ClientResult<IssuePage>>;
  getIssue(issueId: string): Promise<ClientResult<IssueDetail>>;
  updateIssue(issueId: string, update: IssueUpdate): Promise<ClientResult<Issue>>;
  addComment(issueId: string, input: IssueCommentInput): Promise<ClientResult<IssueComment>>;
  recordCause(issueId: string, input: CauseAssessmentInput): Promise<ClientResult<CauseAssessment>>;
  createFix(issueId: string, input: FixRevisionInput): Promise<ClientResult<FixRevision>>;
  recordVerification(issueId: string, input: VerificationInput): Promise<ClientResult<Verification>>;
  transition(issueId: string, command: TransitionCommand): Promise<ClientResult<Issue>>;
  findSimilarResolutions(issueId: string): Promise<ClientResult<SimilarResolutions>>;
  getInsights(filter: InsightsFilter): Promise<ClientResult<Insights>>;
  /** Assembly trace (frozen trace contract): which vehicles/customers contain parts from a batch, lot or serial. */
  runTrace(incidentId: string, request: TraceRequest): Promise<ClientResult<TraceResult>>;
  /** Server-side agent turn (live mode only; the mock runs the stub planner in the browser). */
  agentChat(request: AgentChatRequest): Promise<ClientResult<AgentChatResponse>>;
  /** Backend wiring as the server reports it (graph / double) so the UI can label the data source truthfully. */
  getHealth(): Promise<ClientResult<BackendHealth>>;
  /** Design dataset as stored in the graph (live) or bundled (mock). Never silently swapped. */
  getPlatformDesign(): Promise<ClientResult<PlatformDesign>>;
  /** Recorded relationships (suppliers, lots, parts, vehicles, customers, issues, causes, fixes) for the Graph view and the assistant. */
  getGraph(): Promise<ClientResult<WorkspaceGraph>>;
  /** Manual catalog entry (e.g. a new supplier) through the frozen catalogUpsert route. */
  upsertCatalogItem(kind: CatalogKind, item: CatalogUpsert): Promise<ClientResult<CatalogItem>>;
}

export const clientFail = (code: ClientErrorCode, message: string, details?: unknown): ClientResult<never> => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});
export const clientOk = <T>(data: T): ClientResult<T> => ({ ok: true, data });

/** Client-generated idempotency key (UUID when available; fallback stays within the contract regex). */
export function newIdempotencyKey(prefix = "ui"): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid = g.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${uuid}`;
}
