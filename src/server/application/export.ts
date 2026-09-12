import {
  EXPORT_COLUMNS,
  QUANTITY_UNIT,
  ROW_CATEGORIES,
  UI_LABELS,
  type RowCategory,
  type TraceResult,
  type TraceRow,
} from "@/contracts/recall";

/**
 * CSV writer for a stored run. Uses only persisted run data; never recomputes quantities.
 * - RFC 4180 quoting for every cell.
 * - Formula neutralization: cells starting with = + - @ tab or CR are prefixed with a single
 *   quote so spreadsheet software treats them as text.
 * - Unknowns are preserved (null -> empty cell; unresolved flags are explicit columns).
 * - Candidate stock is labeled as candidate; holdStatus always states no hold was applied.
 */

const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function neutralizeCell(value: string): string {
  return FORMULA_LEAD.test(value) ? `'${value}` : value;
}

export function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = neutralizeCell(String(value));
  return `"${text.replace(/"/g, '""')}"`;
}

export function categorize(row: TraceRow): RowCategory {
  if (row.knownMaterialPath) return ROW_CATEGORIES.tracedPotentialImpact;
  if (row.hasUnresolvedEvidence) return ROW_CATEGORIES.unresolvedScope;
  return ROW_CATEGORIES.noRecordedPath;
}

function candidateAction(row: TraceRow): string {
  if (row.knownMaterialPath) return UI_LABELS.candidateHold;
  if (row.hasUnresolvedEvidence) return UI_LABELS.verifyRecord;
  return UI_LABELS[ROW_CATEGORIES.noRecordedPath];
}

type ExportRecord = Record<(typeof EXPORT_COLUMNS)[number], string | number | boolean | null>;

function summaryLine(key: string, value: string | number): string {
  return [escapeCell("summary"), escapeCell(key), escapeCell(value)].join(",");
}

export function traceToCsv(run: TraceResult): string {
  const lines: string[] = [];
  lines.push(EXPORT_COLUMNS.map((c) => escapeCell(c)).join(","));
  const common = {
    runId: run.runId,
    revisionId: run.revisionId,
    rootLotIds: run.rootLotIds.join("|"),
    siteId: run.scope.siteId,
    eventFrom: run.scope.eventFrom,
    eventToExclusive: run.scope.eventToExclusive,
    inventoryAsOf: run.scope.inventoryAsOf,
    executionStatus: run.executionStatus,
    dataCompleteness: run.dataCompleteness,
  };
  const sorted = [...run.rows].sort((a, b) => a.lotId.localeCompare(b.lotId));
  for (const row of sorted) {
    const record: ExportRecord = {
      ...common,
      lotId: row.lotId,
      productLabel: row.productLabel,
      brandLabel: row.brandLabel,
      category: categorize(row),
      onsiteKg: row.onsiteKg,
      shippedKg: row.shippedKg,
      unit: QUANTITY_UNIT,
      consigneeIds: row.consigneeIds.join("|"),
      shipmentLineIds: row.shipmentLineIds.join("|"),
      knownMaterialPath: row.knownMaterialPath,
      hasUnresolvedEvidence: row.hasUnresolvedEvidence,
      issueIds: row.issueIds.join("|"),
      evidenceIds: row.evidenceIds.join("|"),
      candidateAction: candidateAction(row),
      holdStatus: UI_LABELS.holdNotApplied,
    };
    lines.push(EXPORT_COLUMNS.map((c) => escapeCell(record[c])).join(","));
  }
  // Summary block of stored values, after the table so it parses cleanly.
  lines.push("");
  lines.push(summaryLine("known.onsiteKg", run.known.onsiteKg));
  lines.push(summaryLine("known.shippedKg", run.known.shippedKg));
  lines.push(summaryLine("known.consigneeCount", run.known.consigneeCount));
  lines.push(summaryLine("unresolvedOnly.onsiteKg", run.unresolvedOnly.onsiteKg));
  lines.push(summaryLine("unresolvedOnly.shippedKg", run.unresolvedOnly.shippedKg));
  lines.push(summaryLine("disposedKg", run.disposedKg));
  lines.push(summaryLine("openIssues", run.issues.length));
  lines.push(summaryLine("limitations", run.scope.limitations.join(" | ")));
  lines.push(summaryLine("notice", "Candidate investigation list, not a compliance certificate or safety clearance."));
  return `${lines.join("\r\n")}\r\n`;
}

export function exportFileName(run: TraceResult): string {
  const safe = run.runId.replace(/[^A-Za-z0-9._-]/g, "_");
  return `recallradius-trace-${safe}.csv`;
}
