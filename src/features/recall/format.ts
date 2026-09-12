/** Display helpers and the truthful label vocabulary used across the workspace. */
import { UI_LABELS } from "@/contracts/recall";
import type { SourcingType } from "@/contracts/common";
import type { CauseState, CauseType, FixState, IssueStatus, ReferenceCatalog, Severity } from "@/contracts/issues";

export const SOURCING_LABEL: Record<SourcingType, string> = {
  supplier: UI_LABELS.sourcingSupplier,
  in_house: UI_LABELS.sourcingInHouse,
  unknown: UI_LABELS.sourcingUnknown,
};

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  triaged: "Triaged",
  in_progress: "In progress",
  pending_verification: "Pending verification",
  closed: "Closed",
};

export const SEVERITY_LABEL: Record<Severity, string> = { minor: "Minor", major: "Major", critical: "Critical" };

export const CAUSE_STATE_LABEL: Record<CauseState, string> = { hypothesis: "Hypothesis", confirmed: "Confirmed", rejected: "Rejected" };

export const CAUSE_TYPE_LABEL: Record<CauseType, string> = {
  supplier_component: "Supplier component",
  in_house_manufacturing: "In-house manufacturing",
  assembly_process: "Assembly process",
  design: "Design",
  calibration: "Calibration",
  handling: "Handling",
  unknown: "Unknown",
};

export const FIX_STATE_LABEL: Record<FixState, string> = { proposed: "Proposed", applied: "Applied (awaiting verification)", verified: "Verified" };

export const ATTRIBUTION = {
  reportedBy: "Reported by",
  assignedTo: "Currently assigned to",
  detectedAt: "Detected at station",
  processOwner: "Process owner (step where found)",
  confirmedCauseTeam: "Confirmed causal team",
  confirmedCauseStation: "Confirmed causal station/process",
  linkedSupplier: "Linked supplier (context)",
  suspectedSupplier: "Suspected supplier cause (hypothesis)",
  confirmedSupplierFault: "Confirmed supplier fault",
  proposedFromPrior: "Proposed from a verified prior resolution",
} as const;

export function statusBadgeClass(status: IssueStatus): string {
  switch (status) {
    case "closed":
      return "rrx-badge rrx-badge--ok";
    case "pending_verification":
      return "rrx-badge rrx-badge--warning";
    case "open":
      return "rrx-badge rrx-badge--blocking";
    default:
      return "rrx-badge rrx-badge--accent";
  }
}

export function severityBadgeClass(severity: Severity): string {
  return severity === "critical" ? "rrx-badge rrx-badge--blocking" : severity === "major" ? "rrx-badge rrx-badge--warning" : "rrx-badge rrx-badge--muted";
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(/:\d{2}(\.\d+)?Z$/, " UTC");
}

export function toUtcIso(localDateTime: string): string {
  const d = new Date(localDateTime);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtRate(rate: number | null): string {
  return rate === null ? "N/A" : `${(rate * 100).toFixed(1)}%`;
}

export type CatalogLookup = {
  team: (id: string | null | undefined) => string;
  supplier: (id: string | null | undefined) => string;
  station: (id: string | null | undefined) => string;
  process: (id: string | null | undefined) => string;
  defect: (id: string | null | undefined) => string;
};

export function makeLookup(catalog: ReferenceCatalog | null): CatalogLookup {
  const find = (list: Array<{ id: string; name: string }> | undefined, id: string | null | undefined, fallback = "—") => {
    if (!id) return fallback;
    return list?.find((x) => x.id === id)?.name ?? id;
  };
  return {
    team: (id) => find(catalog?.teams, id, "Unassigned"),
    supplier: (id) => find(catalog?.suppliers, id),
    station: (id) => find(catalog?.stations, id),
    process: (id) => find(catalog?.processSteps, id),
    defect: (id) => find(catalog?.defectCodes, id),
  };
}

export function errorHint(code: string): string {
  switch (code) {
    case "STALE_VERSION":
      return "Someone changed this issue since you loaded it. Reload to see the latest version; your input is kept.";
    case "VERIFICATION_REQUIRED":
      return "Closure needs a passed verification of the applied fix. Record a verification first.";
    case "INVALID_TRANSITION":
      return "That status change is not allowed from the current status.";
    case "DUPLICATE_ACTION":
      return "This action was already submitted with different content. Start a new draft.";
    case "NETWORK":
    case "BACKEND_UNAVAILABLE":
    case "TIMEOUT":
      return "The backend is unavailable. Nothing was saved. Your draft is kept; retry when the service is back.";
    case "NOT_FOUND":
      return "The record is not in the backend workspace.";
    case "INVALID_REFERENCE":
      return "A referenced team, supplier, station, entity or evidence id is unknown to the server.";
    case "VALIDATION_FAILED":
      return "The server rejected the input. Check required fields.";
    default:
      return "";
  }
}
