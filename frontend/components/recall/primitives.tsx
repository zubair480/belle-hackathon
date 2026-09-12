"use client";
import type { ReactNode } from "react";
import type { EntityKind, SourcingType } from "@/contracts/common";
import type { CauseState, FixState, IssueStatus, Severity } from "@/contracts/issues";
import type { ClientError } from "../../features/recall/api/types";
import { CAUSE_STATE_LABEL, FIX_STATE_LABEL, SEVERITY_LABEL, SOURCING_LABEL, STATUS_LABEL, errorHint, severityBadgeClass, statusBadgeClass } from "../../features/recall/format";

export function StatusBadge({ status }: { status: IssueStatus }) {
  return <span className={statusBadgeClass(status)}>{STATUS_LABEL[status]}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={severityBadgeClass(severity)}>{SEVERITY_LABEL[severity]}</span>;
}

/**
 * Origin label. Vehicles carry no origin record by design (they are assembled builds; origin is
 * recorded per installed part), so `kind: "vehicle"` renders a neutral badge instead of the
 * "Unknown origin" styling that would read as a supplier gap.
 */
export function SourcingBadge({ sourcing, compact = false, kind }: { sourcing: SourcingType | null | undefined; compact?: boolean; kind?: EntityKind | null }) {
  if (kind === "vehicle" && !sourcing) {
    return (
      <span className="rrx-badge rrx-badge--muted" title="Vehicle build: no origin record applies; provenance lives on the installed parts" data-testid="vehicle-origin-badge">
        {compact ? "Build" : "Vehicle build · no origin record"}
      </span>
    );
  }
  const s: SourcingType = sourcing ?? "unknown";
  return (
    <span className={`rrx-badge rrx-badge--${s}`} title={SOURCING_LABEL[s]}>
      <span className="rrx-dot" />
      {compact ? (s === "supplier" ? "Supplier" : s === "in_house" ? "In-house" : "Unknown") : SOURCING_LABEL[s]}
    </span>
  );
}

export function FixStateBadge({ state }: { state: FixState }) {
  const cls = state === "verified" ? "rrx-badge rrx-badge--ok" : state === "applied" ? "rrx-badge rrx-badge--warning" : "rrx-badge rrx-badge--accent";
  return <span className={cls}>{FIX_STATE_LABEL[state]}</span>;
}

export function CauseStateBadge({ state }: { state: CauseState }) {
  const cls = state === "confirmed" ? "rrx-badge rrx-badge--ok" : state === "rejected" ? "rrx-badge rrx-badge--muted" : "rrx-badge rrx-badge--warning";
  return <span className={cls}>{CAUSE_STATE_LABEL[state]}</span>;
}

export function Banner({ kind = "warning", children, action }: { kind?: "warning" | "error" | "info" | "ok"; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`rrx-banner rrx-banner--${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span style={{ flex: 1 }}>{children}</span>
      {action}
    </div>
  );
}

export function ErrorBanner({ error, onRetry, retryLabel = "Retry" }: { error: ClientError; onRetry?: () => void; retryLabel?: string }) {
  const hint = errorHint(error.code);
  return (
    <Banner
      kind="error"
      action={
        onRetry ? (
          <button type="button" className="rrx-btn rrx-btn--sm" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : undefined
      }
    >
      <strong>{error.code}</strong>: {error.message}
      {hint ? <span className="rrx-muted"> {hint}</span> : null}
    </Banner>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="rrx-muted" role="status" aria-live="polite">
      <span className="rrx-spinner" />
      {label}…
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rrx-empty">{children}</div>;
}

export function KV({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="rrx-kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
