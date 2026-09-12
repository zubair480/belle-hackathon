import type { CauseAssessment, FixRevision, Issue, Verification } from "@/contracts/issues";
import { ISSUE_EXPORT_COLUMNS, ROW_CATEGORIES, TRACE_EXPORT_COLUMNS, UI_LABELS, type RowCategory, type TraceResult, type TraceRow } from "@/contracts/recall";

/**
 * CSV writers over STORED results (never recomputed here).
 * - RFC 4180 quoting for every cell; embedded quotes doubled.
 * - Formula neutralization: cells starting with = + - @ tab or CR get a leading apostrophe so
 *   spreadsheet software treats them as text.
 * - Unknowns are preserved (null -> empty cell); attribution and hold status are explicit.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;
export const neutralizeCell = (v: string) => (FORMULA_LEAD.test(v) ? `'${v}` : v);
export function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  return `"${neutralizeCell(String(value)).replace(/"/g, '""')}"`;
}
const line = (cells: Array<string | number | boolean | null | undefined>) => cells.map(escapeCell).join(",");
const summary = (k: string, v: string | number) => line(["summary", k, v]);

export function categorize(row: TraceRow): RowCategory {
  if (row.currentContainment) return ROW_CATEGORIES.currentContainment;
  if (row.locationState === "quarantine") return ROW_CATEGORIES.quarantined;
  if (row.historicalContainment && row.entityKind === "vehicle") return ROW_CATEGORIES.historicalOnly;
  if (row.hasUnresolvedEvidence) return ROW_CATEGORIES.unresolvedScope;
  if (row.historicalContainment && row.entityKind === "component" && row.locationState === "onsite") return ROW_CATEGORIES.looseCandidate;
  return ROW_CATEGORIES.noRecordedLink;
}

function candidateAction(row: TraceRow): string {
  const c = categorize(row);
  if (c === ROW_CATEGORIES.currentContainment || c === ROW_CATEGORIES.looseCandidate) return UI_LABELS.candidateHold;
  if (c === ROW_CATEGORIES.unresolvedScope) return UI_LABELS.verifyRecord;
  return UI_LABELS[c];
}

export function traceToCsv(run: TraceResult): string {
  const lines: string[] = [line([...TRACE_EXPORT_COLUMNS])];
  const common = [run.runId, run.revisionId, run.root.kind, run.root.id, run.scope.siteId, run.scope.configurationAsOf, run.scope.historyFrom, run.executionStatus, run.dataCompleteness];
  for (const row of [...run.rows].sort((a, b) => a.entityId.localeCompare(b.entityId))) {
    lines.push(
      line([
        ...common,
        row.entityId, row.entityKind, row.partNumber, row.serialNumber, row.buildId, row.vin, row.locationState, row.customerId, row.shipmentLineIds.join("|"),
        categorize(row), row.currentContainment, row.historicalContainment, row.hasUnresolvedEvidence, row.engineeringReview, row.issueIds.join("|"), row.evidenceIds.join("|"),
        candidateAction(row), UI_LABELS.holdNotApplied,
      ]),
    );
  }
  lines.push("");
  for (const [k, v] of Object.entries(run.counts)) lines.push(summary(`counts.${k}`, v));
  lines.push(summary("openIssues", run.issues.length));
  lines.push(summary("limitations", run.scope.limitations.join(" | ")));
  lines.push(summary("notice", "Candidate investigation list, not a shipment release, hold instruction or engineering clearance."));
  return `${lines.join("\r\n")}\r\n`;
}

export type IssueExportRow = { issue: Issue; cause: CauseAssessment | null; fix: FixRevision | null; lastVerification: Verification | null };

export function issuesToCsv(rows: IssueExportRow[]): string {
  const lines: string[] = [line([...ISSUE_EXPORT_COLUMNS])];
  for (const { issue: i, cause, fix, lastVerification } of rows) {
    lines.push(
      line([
        i.id, i.status, i.version, i.title, i.severity, i.origin, i.detectedAt, i.reportingTeamId, i.assignedTeamId, i.detectionStationId, i.processStepId,
        i.entityIds.join("|"), i.partNumber, i.partRevision, i.linkedSupplierIds.join("|"), i.defectCode,
        cause?.causeType ?? null, cause?.responsibleTeamId ?? null, cause?.responsibleSupplierId ?? null,
        fix?.id ?? null, fix?.state ?? null, lastVerification?.outcome ?? null, i.evidenceIds.join("|"),
      ]),
    );
  }
  lines.push("");
  lines.push(summary("issueCount", rows.length));
  lines.push(summary("notice", "Confirmed columns reflect the current reviewed primary cause only; linked suppliers are not confirmed faults."));
  return `${lines.join("\r\n")}\r\n`;
}

export const safeFileName = (prefix: string, id: string) => `${prefix}-${id.replace(/[^A-Za-z0-9._-]/g, "_")}.csv`;
