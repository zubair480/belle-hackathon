/**
 * Optional AI features. Every result is a proposal: the model never confirms causes, approves
 * fixes, closes issues, blames teams/suppliers or touches the database. Calls happen outside any
 * database transaction. Output is discarded unless it validates against the strict contract
 * schema and every evidence span / citation is verified against the supplied material.
 */
import { z } from "zod";
import { DomainError } from "@/contracts/common";
import {
  ISSUE_DRAFT_FIELDS,
  IssueDraftSchema,
  ResolutionExplanationSchema,
  type IssueDraft,
  type IssueDraftRequest,
  type IssueDraftResult,
  type ResolutionExplanation,
  type SimilarResolutions,
} from "@/contracts/issues";
import { ALERT_DRAFT_FIELDS, AlertDraftSchema, type AlertDraft, type AlertExtractRequest, type AlertExtractResult } from "@/contracts/recall";
import { UNTRUSTED_PREAMBLE, wrapSource, type StructuredOutputProvider } from "./provider";

// ---------------------------------------------------------------------------
// Model-facing schemas (loose) and prompts
// ---------------------------------------------------------------------------

const spanSchema = <F extends readonly [string, ...string[]]>(fields: F) =>
  z.object({ field: z.enum(fields), sourceId: z.string(), startOffset: z.number().int(), endOffset: z.number().int(), exactText: z.string() });

export const ModelIssueDraftSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  partNumber: z.string().nullable(),
  partRevision: z.string().nullable(),
  defectCode: z.string().nullable(),
  entityIds: z.array(z.string()),
  detectionStationId: z.string().nullable(),
  severity: z.enum(["minor", "major", "critical"]).nullable(),
  evidence: z.array(spanSchema(ISSUE_DRAFT_FIELDS)),
  unresolvedFields: z.array(z.enum(ISSUE_DRAFT_FIELDS)),
});

export const ModelAlertDraftSchema = z.object({
  supplier: z.string().nullable(),
  partNumber: z.string().nullable(),
  batchCode: z.string().nullable(),
  statedDateRange: z.object({ from: z.string(), to: z.string() }).nullable(),
  evidence: z.array(spanSchema(ALERT_DRAFT_FIELDS)),
  unresolvedFields: z.array(z.enum(ALERT_DRAFT_FIELDS)),
});

export const ModelExplanationSchema = z.object({ explanation: z.string(), citedIds: z.array(z.string()) });

const ISSUE_DRAFT_SYSTEM = `You turn an operator's free-text assembly problem report into an editable issue draft for an EV vehicle assembly plant.
${UNTRUSTED_PREAMBLE}
Rules: title (short, from the text), description (the report text as written), partNumber and partRevision exactly as written, defectCode as the defect phrase written in the text (the user will map it to a catalog code), entityIds as vehicle build ids / serial codes exactly as written, detectionStationId as written, severity only when the text states or clearly implies it.
For EVERY non-null field and every entity id, add one evidence span with 0-based character offsets into the source text (startOffset inclusive, endOffset exclusive) and exactText equal to the exact substring. List every null or ambiguous field in unresolvedFields. Never decide causes, blame or fixes.`;

const ALERT_DRAFT_SYSTEM = `You extract supplier alert fields for an EV assembly plant's quality reviewer.
${UNTRUSTED_PREAMBLE}
Rules: supplier (issuing organisation as written), partNumber (as written), batchCode (the supplier's batch/lot code exactly as written; never invent or normalise), statedDateRange ({from,to} as written; single date -> both). For EVERY non-null field add one evidence span with 0-based offsets and exactText equal to the exact substring. List null/ambiguous fields in unresolvedFields.`;

const EXPLAIN_SYSTEM = `You explain, for an engineer, why already-retrieved verified resolutions may or may not apply to the current issue.
${UNTRUSTED_PREAMBLE}
You may only reference ids that appear in the retrieved records. Put every id you mention in citedIds. State applicability warnings plainly. Do not invent fixes, confirm root causes, assign blame, or say the issue is resolved. Keep it under 180 words.`;

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

type Span = { field: string; sourceId: string; startOffset: number; endOffset: number; exactText: string };

function spanProblem(span: Span, sourceId: string, text: string): string | null {
  if (span.sourceId !== sourceId) return "wrong sourceId";
  if (span.startOffset >= span.endOffset) return "empty or inverted offsets";
  if (span.endOffset > text.length) return "offsets outside the source";
  if (text.slice(span.startOffset, span.endOffset) !== span.exactText) return "text does not match offsets";
  return null;
}

function keepVerifiedSpans<S extends Span>(spans: S[], sourceId: string, text: string, warnings: string[]): { kept: S[]; supported: Set<string> } {
  const kept: S[] = [];
  const supported = new Set<string>();
  for (const s of spans) {
    const problem = spanProblem(s, sourceId, text);
    if (problem) {
      warnings.push(`Dropped ${s.field} span (${problem}).`);
      continue;
    }
    kept.push(s);
    supported.add(s.field);
  }
  return { kept, supported };
}

async function callAndParse<M extends z.ZodTypeAny, C extends z.ZodTypeAny>(
  provider: StructuredOutputProvider,
  task: "issue_draft" | "alert_draft" | "explain_resolutions",
  system: string,
  user: string,
  modelSchema: M,
  contractSchema: C,
  timeoutMs: number,
): Promise<z.infer<C>> {
  const raw = await provider.generate({ task, system, user, schema: modelSchema }, { timeoutMs });
  const loose = modelSchema.safeParse(raw);
  if (!loose.success) {
    throw new DomainError("AI_OUTPUT_REJECTED", "Provider output did not match the extraction schema.", {
      issues: loose.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const strict = contractSchema.safeParse(loose.data);
  if (!strict.success) {
    throw new DomainError("AI_OUTPUT_REJECTED", "Provider output violated the contract schema.", {
      issues: strict.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return strict.data as z.infer<C>;
}

const providerInfo = (p: StructuredOutputProvider) => ({ name: p.name, mode: p.mode, model: p.model });

// ---------------------------------------------------------------------------
// Feature: free text -> editable issue draft
// ---------------------------------------------------------------------------

export function verifyIssueDraft(candidate: IssueDraft, request: IssueDraftRequest): { draft: IssueDraft; warnings: string[] } {
  const warnings: string[] = [];
  const { kept, supported } = keepVerifiedSpans(candidate.evidence, request.sourceId, request.text, warnings);
  const draft: IssueDraft = { ...candidate, evidence: kept, unresolvedFields: [...candidate.unresolvedFields] };
  for (const field of ISSUE_DRAFT_FIELDS) {
    if (field === "entityIds") {
      const verifiedIds = new Set(kept.filter((s) => s.field === "entityIds").map((s) => s.exactText));
      const dropped = draft.entityIds.filter((id) => !verifiedIds.has(id));
      if (dropped.length) warnings.push(`Removed entity ids without verified spans: ${dropped.join(", ")}.`);
      draft.entityIds = draft.entityIds.filter((id) => verifiedIds.has(id));
      if (draft.entityIds.length === 0 && !draft.unresolvedFields.includes("entityIds")) draft.unresolvedFields.push("entityIds");
      continue;
    }
    if (draft[field] === null) {
      if (!draft.unresolvedFields.includes(field)) draft.unresolvedFields.push(field);
      continue;
    }
    if (!supported.has(field)) {
      warnings.push(`Removed ${field}: no verified evidence span.`);
      (draft as Record<string, unknown>)[field] = null;
      if (!draft.unresolvedFields.includes(field)) draft.unresolvedFields.push(field);
    }
  }
  draft.unresolvedFields = [...new Set(draft.unresolvedFields)];
  return { draft, warnings };
}

export async function draftIssueFromText(provider: StructuredOutputProvider, request: IssueDraftRequest, timeoutMs: number): Promise<IssueDraftResult> {
  const candidate = await callAndParse(provider, "issue_draft", ISSUE_DRAFT_SYSTEM, wrapSource(request.sourceId, request.text), ModelIssueDraftSchema, IssueDraftSchema, timeoutMs);
  const { draft, warnings } = verifyIssueDraft(candidate, request);
  return { sourceId: request.sourceId, status: "draft", draft, provider: providerInfo(provider), warnings };
}

// ---------------------------------------------------------------------------
// Feature: supplier alert -> unconfirmed component alert draft
// ---------------------------------------------------------------------------

export function verifyAlertDraft(candidate: AlertDraft, request: AlertExtractRequest): { draft: AlertDraft; warnings: string[] } {
  const warnings: string[] = [];
  const { kept, supported } = keepVerifiedSpans(candidate.evidence, request.sourceId, request.text, warnings);
  const draft: AlertDraft = { ...candidate, evidence: kept, unresolvedFields: [...candidate.unresolvedFields] };
  for (const field of ALERT_DRAFT_FIELDS) {
    if (draft[field] === null) {
      if (!draft.unresolvedFields.includes(field)) draft.unresolvedFields.push(field);
      continue;
    }
    if (!supported.has(field)) {
      warnings.push(`Removed ${field}: no verified evidence span.`);
      (draft as Record<string, unknown>)[field] = null;
      if (!draft.unresolvedFields.includes(field)) draft.unresolvedFields.push(field);
      continue;
    }
    if (field === "batchCode" && typeof draft.batchCode === "string" && !request.text.toLowerCase().includes(draft.batchCode.toLowerCase())) {
      warnings.push("Removed batchCode: code does not appear verbatim in the source.");
      draft.batchCode = null;
      draft.evidence = draft.evidence.filter((s) => s.field !== "batchCode");
      if (!draft.unresolvedFields.includes("batchCode")) draft.unresolvedFields.push("batchCode");
    }
  }
  draft.unresolvedFields = [...new Set(draft.unresolvedFields)];
  return { draft, warnings };
}

export async function extractAlertDraft(provider: StructuredOutputProvider, request: AlertExtractRequest, timeoutMs: number): Promise<AlertExtractResult> {
  const candidate = await callAndParse(provider, "alert_draft", ALERT_DRAFT_SYSTEM, wrapSource(request.sourceId, request.text), ModelAlertDraftSchema, AlertDraftSchema, timeoutMs);
  const { draft, warnings } = verifyAlertDraft(candidate, request);
  return { sourceId: request.sourceId, status: "draft", draft, provider: providerInfo(provider), warnings };
}

// ---------------------------------------------------------------------------
// Feature: explain retrieved resolutions (citations restricted to retrieved ids)
// ---------------------------------------------------------------------------

export async function explainResolutions(
  provider: StructuredOutputProvider,
  issueId: string,
  retrieved: SimilarResolutions,
  timeoutMs: number,
): Promise<ResolutionExplanation> {
  const allowed = new Set<string>();
  for (const r of retrieved.results) {
    allowed.add(r.sourceIssueId);
    allowed.add(r.sourceFixRevisionId);
    allowed.add(r.verificationId);
    for (const e of r.evidenceIds) allowed.add(e);
  }
  const user = wrapSource(issueId, JSON.stringify({ issueId, queryExplanation: retrieved.queryExplanation, results: retrieved.results }));
  const candidate = await callAndParse(provider, "explain_resolutions", EXPLAIN_SYSTEM, user, ModelExplanationSchema, ResolutionExplanationSchema.pick({ explanation: true, citedIds: true }), timeoutMs);
  const warnings: string[] = [];
  const citedIds = candidate.citedIds.filter((id) => allowed.has(id));
  const invented = candidate.citedIds.filter((id) => !allowed.has(id));
  if (invented.length) warnings.push(`Dropped citations not present in retrieved records: ${invented.join(", ")}.`);
  const mentioned = [...allowed].filter((id) => candidate.explanation.includes(id));
  for (const id of mentioned) if (!citedIds.includes(id)) citedIds.push(id);
  const unknownMentions = [...candidate.explanation.matchAll(/\b(FIX-[A-Z0-9-]+|ISS-[A-Z0-9-]+|VERIFY-[A-Z0-9-]+)\b/g)].map((m) => m[1] ?? "").filter((id) => id.length > 0 && !allowed.has(id));
  if (unknownMentions.length) {
    throw new DomainError("AI_OUTPUT_REJECTED", "Explanation referenced ids that were not retrieved.", { unknownMentions: [...new Set(unknownMentions)] });
  }
  return { issueId, status: "proposal", explanation: candidate.explanation, citedIds, provider: providerInfo(provider), warnings };
}
