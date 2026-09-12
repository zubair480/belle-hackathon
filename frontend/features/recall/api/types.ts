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

/** `NETWORK` is client-side only: the request never produced a valid envelope. */
export type ClientErrorCode = ErrorCode | "NETWORK";
export type ClientError = { code: ClientErrorCode; message: string; details?: unknown };
export type ClientResult<T> = { ok: true; data: T } | { ok: false; error: ClientError };

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
