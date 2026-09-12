import type { AlertExtractRequest } from "@/contracts/recall";
import type { AlertExtractionProvider, ModelAlertOutput } from "./provider";

/**
 * DEVELOPMENT STUB. Deterministic regex heuristics, no model call. Selected only by the explicit
 * setting RECALL_AI_PROVIDER=stub and always labeled mode="stub" in responses. It exists so the
 * review UI can be exercised without a funded API credential; it is not a fallback for a failed
 * live provider.
 */
export class StubAlertProvider implements AlertExtractionProvider {
  readonly name = "development-stub";
  readonly mode = "stub" as const;
  readonly model = null;

  async extract(request: AlertExtractRequest): Promise<ModelAlertOutput> {
    const text = request.text;
    const out: ModelAlertOutput = {
      supplier: null,
      item: null,
      externalLotCode: null,
      statedDateRange: null,
      evidence: [],
      unresolvedFields: [],
    };
    const span = (field: ModelAlertOutput["evidence"][number]["field"], match: RegExpMatchArray, group: number) => {
      const value = match[group];
      if (value === undefined || match.index === undefined) return null;
      const start = match.index + match[0].indexOf(value);
      out.evidence.push({ field, sourceId: request.sourceId, startOffset: start, endOffset: start + value.length, exactText: value });
      return value;
    };

    const supplier = text.match(/(?:supplier|from|issued by)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.' ]{1,60}?)(?=[\n,.;]|\s+(?:has|is|announces|reports|recall)|$)/m);
    out.supplier = supplier ? span("supplier", supplier, 1) : null;

    const item = text.match(/(?:product|item|ingredient)\s*[:\-]\s*([^\n,;]{2,80})/i);
    out.item = item ? span("item", item, 1) : null;

    // Case-sensitive code group (uppercase/digits) so prose like "lot as" is not read as a code.
    const lotPattern = /\b(?:[Ll]ot|[Bb]atch)\s*(?:[Cc]ode|[Nn]o\.?|[Nn]umber|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9-]{1,30})\b/g;
    const lots = [...text.matchAll(lotPattern)].filter((m) => /\d/.test(m[1] ?? ""));
    const distinctCodes = new Set(lots.map((m) => m[1]));
    if (lots.length === 1 && lots[0]) {
      out.externalLotCode = span("externalLotCode", lots[0], 1);
    } else if (distinctCodes.size > 1) {
      out.unresolvedFields.push("externalLotCode");
    }

    const dates = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Z][a-z]+ \d{1,2},? \d{4})\b/g)];
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (first && last && first.index !== undefined && last.index !== undefined) {
      const from = first[1] ?? first[0];
      const to = last[1] ?? last[0];
      const start = first.index;
      const end = last.index + last[0].length;
      out.statedDateRange = { from, to };
      out.evidence.push({ field: "statedDateRange", sourceId: request.sourceId, startOffset: start, endOffset: end, exactText: text.slice(start, end) });
    }

    for (const field of ["supplier", "item", "externalLotCode", "statedDateRange"] as const) {
      if (out[field] === null && !out.unresolvedFields.includes(field)) out.unresolvedFields.push(field);
    }
    return out;
  }
}
