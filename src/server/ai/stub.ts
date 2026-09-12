import type { z } from "zod";
import type { ProviderCallOptions, StructuredOutputProvider, StructuredRequest } from "./provider";

/**
 * DEVELOPMENT STUB. Deterministic regex heuristics, no model call. Selected only by the explicit
 * setting RECALL_AI_PROVIDER=stub and always labeled mode="stub" in responses. It exists so the
 * review UI can be exercised without a funded API credential; it is never a fallback for a
 * failed live provider.
 */
export class StubProvider implements StructuredOutputProvider {
  readonly name = "development-stub";
  readonly mode = "stub" as const;
  readonly model = null;

  async generate<T extends z.ZodTypeAny>(request: StructuredRequest<T>, _options: ProviderCallOptions): Promise<unknown> {
    const { sourceId, text } = unwrap(request.user);
    switch (request.task) {
      case "issue_draft":
        return issueDraft(sourceId, text);
      case "alert_draft":
        return alertDraft(sourceId, text);
      case "explain_resolutions":
        return explain(request.user);
    }
  }
}

function unwrap(user: string): { sourceId: string; text: string } {
  const m = user.match(/<source sourceId="([^"]+)">([\s\S]*)<\/source>/);
  return m ? { sourceId: m[1] ?? "source", text: m[2] ?? "" } : { sourceId: "source", text: user };
}

type Span = { field: string; sourceId: string; startOffset: number; endOffset: number; exactText: string };

function spanFor(field: string, sourceId: string, text: string, match: RegExpMatchArray, group: number): { value: string; span: Span } | null {
  const value = match[group];
  if (value === undefined || match.index === undefined) return null;
  const start = match.index + match[0].indexOf(value);
  return { value, span: { field, sourceId, startOffset: start, endOffset: start + value.length, exactText: text.slice(start, start + value.length) } };
}

const SEVERITY_WORDS: Array<[RegExp, "minor" | "major" | "critical"]> = [
  [/\b(critical|safety|fire|cannot charge|blocked)\b/i, "critical"],
  [/\b(major|misaligned|out of tolerance|failed|does not fit)\b/i, "major"],
  [/\b(minor|cosmetic|scratch)\b/i, "minor"],
];

function issueDraft(sourceId: string, text: string) {
  const evidence: Span[] = [];
  const unresolved: string[] = [];
  const pick = (field: string, re: RegExp, group = 1): string | null => {
    const m = text.match(re);
    const r = m ? spanFor(field, sourceId, text, m, group) : null;
    if (!r) {
      unresolved.push(field);
      return null;
    }
    evidence.push(r.span);
    return r.value;
  };
  const title = pick("title", /^([^\n.]{8,120})/);
  const partNumber = pick("partNumber", /\b(?:part|p\/n|pn)\s*[:#]?\s*([A-Z]{2,}-[A-Z0-9-]{2,})\b/i);
  const partRevision = pick("partRevision", /\b(?:rev(?:ision)?)\.?\s*[:#]?\s*([A-Z0-9]{1,4})\b/i);
  const detectionStationId = pick("detectionStationId", /\b(?:station|at)\s*[:#]?\s*(ST-[A-Z0-9-]+)\b/);
  const defectMatch = text.match(/\b(misalign\w*|out of tolerance|torque\w*|dropout|connector defect|leak\w*|crack\w*)\b/i);
  let defectCode: string | null = null;
  if (defectMatch) {
    const r = spanFor("defectCode", sourceId, text, defectMatch, 1);
    if (r) {
      evidence.push(r.span);
      defectCode = r.value;
    }
  } else unresolved.push("defectCode");
  const entityIds: string[] = [];
  for (const m of text.matchAll(/\b((?:DEMO-EV|CONN|BRKT|CPM|R|J|E)-?\d{3,4})\b/g)) {
    const r = spanFor("entityIds", sourceId, text, m, 1);
    if (r && !entityIds.includes(r.value)) {
      entityIds.push(r.value);
      evidence.push(r.span);
    }
  }
  if (entityIds.length === 0) unresolved.push("entityIds");
  let severity: "minor" | "major" | "critical" | null = null;
  for (const [re, sev] of SEVERITY_WORDS) {
    const m = text.match(re);
    if (m) {
      const r = spanFor("severity", sourceId, text, m, 1);
      if (r) {
        evidence.push(r.span);
        severity = sev;
        break;
      }
    }
  }
  if (!severity) unresolved.push("severity");
  const description = text.length > 0 ? text.slice(0, 4000) : null;
  if (description) evidence.push({ field: "description", sourceId, startOffset: 0, endOffset: description.length, exactText: description });
  return { title, description, partNumber, partRevision, defectCode, entityIds, detectionStationId, severity, evidence, unresolvedFields: unresolved };
}

function alertDraft(sourceId: string, text: string) {
  const evidence: Span[] = [];
  const unresolved: string[] = [];
  const pick = (field: string, re: RegExp): string | null => {
    const m = text.match(re);
    const r = m ? spanFor(field, sourceId, text, m, 1) : null;
    if (!r) {
      unresolved.push(field);
      return null;
    }
    evidence.push(r.span);
    return r.value;
  };
  const supplier = pick("supplier", /(?:supplier|from|issued by)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.' ]{1,60}?)(?=[\n,.;]|\s+(?:has|is|announces|reports|recall)|$)/m);
  const partNumber = pick("partNumber", /\b(?:part|p\/n|pn)\s*[:#]?\s*([A-Z]{2,}-[A-Z0-9-]{2,})\b/i);
  const lots = [...text.matchAll(/\b(?:[Ll]ot|[Bb]atch)\s*(?:[Cc]ode|[Nn]o\.?|[Nn]umber|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9-]{1,30})\b/g)].filter((m) => /\d/.test(m[1] ?? ""));
  let batchCode: string | null = null;
  const distinct = new Set(lots.map((m) => m[1]));
  if (lots.length === 1 && lots[0]) {
    const r = spanFor("batchCode", sourceId, text, lots[0], 1);
    if (r) {
      evidence.push(r.span);
      batchCode = r.value;
    }
  } else if (distinct.size > 1) unresolved.push("batchCode");
  else unresolved.push("batchCode");
  const dates = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)];
  let statedDateRange: { from: string; to: string } | null = null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first && last && first.index !== undefined && last.index !== undefined) {
    const start = first.index;
    const end = last.index + last[0].length;
    statedDateRange = { from: first[1] ?? first[0], to: last[1] ?? last[0] };
    evidence.push({ field: "statedDateRange", sourceId, startOffset: start, endOffset: end, exactText: text.slice(start, end) });
  } else unresolved.push("statedDateRange");
  return { supplier, partNumber, batchCode, statedDateRange, evidence, unresolvedFields: unresolved };
}

function explain(user: string) {
  const ids = [...new Set([...user.matchAll(/\b(FIX-[A-Z0-9-]+|ISS-[A-Z0-9-]+|VERIFY-[A-Z0-9-]+)\b/g)].map((m) => m[1]))].filter((x): x is string => Boolean(x));
  const fixIds = ids.filter((i) => i.startsWith("FIX-"));
  const explanation =
    fixIds.length === 0
      ? "No verified resolution was retrieved for this issue. Manual investigation is required."
      : `Development stub: ${fixIds.length} retrieved verified fix(es) (${fixIds.join(", ")}) match on the reviewed criteria listed by the retrieval query. Applicability warnings must be reviewed by engineering before reuse; reuse creates a new proposal that needs its own verification.`;
  return { explanation, citedIds: ids.slice(0, 20) };
}
