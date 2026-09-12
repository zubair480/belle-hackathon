"use client";
import { useState } from "react";
import type { IssueListFilter, IssueStatus, Severity } from "@/contracts/issues";
import { ISSUE_STATUSES, SEVERITIES } from "@/contracts/issues";
import { useWorkspace } from "@/features/recall/context";
import { STATUS_LABEL, fmtDate } from "@/features/recall/format";
import { useAsync } from "@/features/recall/hooks";
import { Empty, ErrorBanner, Loading, SeverityBadge, StatusBadge } from "./primitives";

export type IssueBoardProps = { mode?: "issues" | "resolutions" };

export function IssueBoard({ mode = "issues" }: IssueBoardProps) {
  const ws = useWorkspace();
  const [status, setStatus] = useState<IssueStatus | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [teamId, setTeamId] = useState("");
  const [teamRole, setTeamRole] = useState<IssueListFilter["teamRole"]>("assigned");
  const [text, setText] = useState("");
  const filter: Partial<IssueListFilter> = {
    status: mode === "resolutions" ? ["closed", "pending_verification"] : status ? [status] : undefined,
    severity: severity ? [severity] : undefined,
    teamId: teamId || undefined,
    teamRole: teamId ? teamRole : undefined,
    text: text || undefined,
    limit: 100,
  };
  const page = useAsync(() => ws.client.listIssues(filter), [mode, status, severity, teamId, teamRole, text, ws.client]);

  return (
    <div>
      <div className="rrx-card-head">
        <div>
          <h1>{mode === "resolutions" ? "Resolutions" : "Issues"}</h1>
          <p className="rrx-muted" style={{ marginBottom: 0 }}>
            {mode === "resolutions"
              ? "Issues with an applied or verified fix. A resolution is reusable only after its own verification passed."
              : "Manual reports from the line. No import or model call is needed to open an issue."}
          </p>
        </div>
        <button type="button" className="rrx-btn rrx-btn--primary" onClick={() => ws.openNewIssue()} data-testid="new-issue">
          + New issue
        </button>
      </div>
      <div className="rrx-card">
        <div className="rrx-filters">
          {mode === "issues" ? (
            <div className="rrx-field">
              <label htmlFor="f-status">Status</label>
              <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value as IssueStatus | "")}>
                <option value="">Any</option>
                {ISSUE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="rrx-field">
            <label htmlFor="f-sev">Severity</label>
            <select id="f-sev" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")}>
              <option value="">Any</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="rrx-field">
            <label htmlFor="f-team">Team</label>
            <select id="f-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Any</option>
              {ws.catalog?.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="rrx-field">
            <label htmlFor="f-role">Team role</label>
            <select id="f-role" value={teamRole} onChange={(e) => setTeamRole(e.target.value as IssueListFilter["teamRole"])} disabled={!teamId}>
              <option value="reporting">Reported by</option>
              <option value="assigned">Assigned to</option>
              <option value="confirmed_cause">Confirmed cause</option>
            </select>
          </div>
          <div className="rrx-field">
            <label htmlFor="f-text">Search</label>
            <input id="f-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Title, id or text" />
          </div>
        </div>
        {page.status === "loading" && !page.data ? <Loading label="Loading issues" /> : null}
        {page.status === "error" && page.error ? <ErrorBanner error={page.error} onRetry={page.reload} /> : null}
        {page.data ? (
          page.data.items.length ? (
            <div className="rrx-scroll">
              <table data-testid="issue-table">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Reported by</th>
                    <th>Assigned to</th>
                    <th>Detected at</th>
                    <th>Affected</th>
                    <th>{mode === "resolutions" ? "Fix" : "Detected"}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.items.map((i) => (
                    <tr key={i.id} className="rrx-row--click" onClick={() => ws.openIssue(i.id, mode === "resolutions" ? "resolution" : undefined)} data-testid={`issue-row-${i.id}`}>
                      <td>
                        <div>{i.title}</div>
                        <div className="rrx-mono rrx-muted rrx-small">{i.id}</div>
                      </td>
                      <td>
                        <StatusBadge status={i.status} />
                      </td>
                      <td>
                        <SeverityBadge severity={i.severity} />
                      </td>
                      <td>{ws.lookup.team(i.reportingTeamId)}</td>
                      <td>{i.assignedTeamId ? ws.lookup.team(i.assignedTeamId) : <span className="rrx-muted">Unassigned</span>}</td>
                      <td>{ws.lookup.station(i.detectionStationId)}</td>
                      <td className="rrx-mono rrx-small">{i.entityIds.join(", ") || "—"}</td>
                      <td className="rrx-small">{mode === "resolutions" ? (i.currentFixRevisionId ? <span className="rrx-mono">{i.currentFixRevisionId}</span> : <span className="rrx-muted">no fix applied</span>) : fmtDate(i.detectedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No issues match these filters.</Empty>
          )
        ) : null}
        {page.data ? (
          <p className="rrx-muted rrx-small" style={{ marginTop: 8, marginBottom: 0 }}>
            {page.data.total !== null ? `${page.data.total} issue(s)` : `${page.data.items.length} shown`} · distinct issue ids, not defective units
          </p>
        ) : null}
      </div>
    </div>
  );
}
