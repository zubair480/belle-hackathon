type Env = Record<string, string | undefined>;
import {
  ALERT_DRAFT_FIELDS,
  AlertDraftSchema,
  DomainError,
  type AlertDraft,
  type AlertDraftField,
  type AlertEvidenceSpan,
  type AlertExtractRequest,
  type AlertExtractResult,
} from "@/contracts/recall";
import { AnthropicAlertProvider } from "./anthropic";
import { ModelAlertOutputSchema, type AlertExtractionProvider } from "./provider";
import { StubAlertProvider } from "./stub";

export type AiProviderSetting = "none" | "stub" | "anthropic";

export function configuredAiProvider(env: Env = process.env): AiProviderSetting {
  const v = (env.RECALL_AI_PROVIDER ?? "none").toLowerCase();
  return v === "stub" || v === "anthropic" ? v : "none";
}

/**
 * Resolves the single configured provider. Returns null for "none" (manual entry only).
 * A live provider without a credential throws AI_UNAVAILABLE; it never degrades to the stub.
 */
export function resolveAlertProvider(env: Env = process.env): AlertExtractionProvider | null {
  switch (configuredAiProvider(env)) {
    case "none":
      return null;
    case "stub":
      return new StubAlertProvider();
    case "anthropic": {
      const apiKey = env.RECALL_AI_API_KEY ?? "";
      if (!apiKey || apiKey.startsWith("<")) {
        throw new DomainError("AI_UNAVAILABLE", "RECALL_AI_PROVIDER=anthropic requires RECALL_AI_API_KEY. Manual entry remains available.");
      }
      const model = env.RECALL_AI_MODEL && !env.RECALL_AI_MODEL.startsWith("<") ? env.RECALL_AI_MODEL : undefined;
      return new AnthropicAlertProvider({ apiKey, model });
    }
  }
}

export function aiTimeoutMs(env: Env = process.env): number {
  const n = Number(env.RECALL_AI_TIMEOUT_MS ?? "15000");
  return Number.isFinite(n) && n > 0 ? n : 15000;
}

type Verification = { draft: AlertDraft; warnings: string[] };

/**
 * Verifies every cited span against the supplied text and strips values that lack verified
 * evidence. Nulls and ambiguity are preserved. Nothing here matches lots or touches the graph.
 */
export function verifyDraftAgainstSource(candidate: AlertDraft, request: AlertExtractRequest): Verification {
  const warnings: string[] = [];
  const validSpans: AlertEvidenceSpan[] = [];
  const supported = new Set<AlertDraftField>();

  for (const span of candidate.evidence) {
    const reason = spanProblem(span, request);
    if (reason) {
      warnings.push(`Dropped ${span.field} span (${reason}).`);
      continue;
    }
    validSpans.push(span);
    supported.add(span.field);
  }

  const draft: AlertDraft = {
    supplier: candidate.supplier,
    item: candidate.item,
    externalLotCode: candidate.externalLotCode,
    statedDateRange: candidate.statedDateRange,
    evidence: validSpans,
    unresolvedFields: [...candidate.unresolvedFields],
  };

  for (const field of ALERT_DRAFT_FIELDS) {
    const value = draft[field];
    if (value === null) {
      if (!draft.unresolvedFields.includes(field)) draft.unresolvedFields.push(field);
      continue;
    }
    if (!supported.has(field)) {
      warnings.push(`Removed ${field}: no verified evidence span.`);
      draft[field] = null as never;
      if (!draft.unresolvedFields.includes(field)) draft.unresolvedFields.push(field);
      continue;
    }
    if (field === "externalLotCode" && typeof value === "string" && !request.text.toLowerCase().includes(value.toLowerCase())) {
      warnings.push("Removed externalLotCode: code does not appear verbatim in the source.");
      draft.externalLotCode = null;
      draft.evidence = draft.evidence.filter((s) => s.field !== "externalLotCode");
      if (!draft.unresolvedFields.includes("externalLotCode")) draft.unresolvedFields.push("externalLotCode");
    }
  }

  draft.unresolvedFields = [...new Set(draft.unresolvedFields)];
  return { draft, warnings };
}

function spanProblem(span: AlertEvidenceSpan, request: AlertExtractRequest): string | null {
  if (span.sourceId !== request.sourceId) return "wrong sourceId";
  if (span.startOffset >= span.endOffset) return "empty or inverted offsets";
  if (span.endOffset > request.text.length) return "offsets outside the source";
  if (request.text.slice(span.startOffset, span.endOffset) !== span.exactText) return "text does not match offsets";
  return null;
}

/**
 * Runs the configured provider once, outside any database transaction, and returns an unconfirmed
 * draft. Confirmation (matching to a known internal lot) is a separate human action in the UI.
 */
export async function extractAlertDraft(
  provider: AlertExtractionProvider,
  request: AlertExtractRequest,
  timeoutMs: number,
): Promise<AlertExtractResult> {
  const raw = await provider.extract(request, { timeoutMs });
  const modelShape = ModelAlertOutputSchema.safeParse(raw);
  if (!modelShape.success) {
    throw new DomainError("AI_OUTPUT_REJECTED", "Provider output did not match the extraction schema.", {
      issues: modelShape.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const strict = AlertDraftSchema.safeParse(modelShape.data);
  if (!strict.success) {
    throw new DomainError("AI_OUTPUT_REJECTED", "Provider output violated the contract schema.", {
      issues: strict.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const { draft, warnings } = verifyDraftAgainstSource(strict.data, request);
  return {
    sourceId: request.sourceId,
    status: "draft",
    draft,
    provider: { name: provider.name, mode: provider.mode, model: provider.model },
    warnings,
  };
}
