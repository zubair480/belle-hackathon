"use client";
/**
 * Team / supplier / process insights. Counts are rendered exactly as the server returns them;
 * every metric carries its issue ids, so a click opens the underlying issues and their evidence.
 */
import { useState } from "react";
import type { Insights, InsightsFilter, IssueDetail, IssueStatus, Severity } from "@/contracts/issues";
import { ISSUE_STATUSES, SEVERITIES } from "@/contracts/issues";
import { useWorkspace } from "@/features/recall/context";
import { STATUS_LABEL, fmtRate } from "@/features/recall/format";
import { useAsync } from "@/features/recall/hooks";
import { Banner, Empty, ErrorBanner, Loading, StatusBadge } from "./primitives";

type Drill = { title: string; issueIds: string[] };

export function InsightsView() {
  const ws = useWorkspace();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [defectCode, setDefectCode] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [processStepId, setProcessStepId] = useState("");
  const [stationId, setStationId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState<IssueStatus | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [teamRole, setTeamRole] = useState<InsightsFilter["teamRole"] | "">("");
  const [drill, setDrill] = useState<Drill | null>(null);
  const filter: InsightsFilter = {
    detectedFrom: from ? `${from}T00:00:00Z` : undefined,
    detectedToExclusive: to ? `${to}T00:00:00Z` : undefined,
    defectCode: defectCode || undefined,
    partNumber: partNumber || undefined,
    processStepId: processStepId || undefined,
    stationId: stationId || undefined,
    supplierId: supplierId || undefined,
    status: status ? [status] : undefined,
    severity: severity ? [severity] : undefined,
    teamRole: teamRole || undefined,
  };
  const ins = useAsync(() => ws.client.getInsights(filter), [from, to, defectCode, partNumber, processStepId, stationId, supplierId, status, severity, teamRole, ws.client]);
  const Count = ({ n, title, ids }: { n: number; title: string; ids: string[] }) => (
    <button type="button" className="rrx-count-btn" disabled={!ids.length} onClick={() => setDrill({ title, issueIds: ids })} data-testid={`metric-${title.replace(/\W+/g, "-").toLowerCase()}`}>
      {n}
    </button>
  );

  return (
    <div>
      <div className="rrx-card-head">
        <div>
          <h1>Team &amp; supplier insights</h1>
          <p className="rrx-muted" style={{ marginBottom: 0 }}>
            Reported, assigned and confirmed-cause counts are separate. Detection is not cause; a linked supplier is not a fault. Rates need a complete inspection cohort.
          </p>
        </div>
      </div>
      <div className="rrx-card">
        <div className="rrx-filters">
          <div className="rrx-field"><label htmlFor="in-from">Detected from</label><input id="in-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="rrx-field"><label htmlFor="in-to">Detected before</label><input id="in-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="rrx-field"><label htmlFor="in-dc">Defect type</label><select id="in-dc" value={defectCode} onChange={(e) => setDefectCode(e.target.value)}><option value="">Any</option>{ws.catalog?.defectCodes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div className="rrx-field"><label htmlFor="in-pn">Part family / number</label><input id="in-pn" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="e.g. CP-BRKT-200" /></div>
          <div className="rrx-field"><label htmlFor="in-ps">Process area</label><select id="in-ps" value={processStepId} onChange={(e) => setProcessStepId(e.target.value)}><option value="">Any</option>{ws.catalog?.processSteps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="rrx-field"><label htmlFor="in-st">Station</label><select id="in-st" value={stationId} onChange={(e) => setStationId(e.target.value)}><option value="">Any</option>{ws.catalog?.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="rrx-field"><label htmlFor="in-role">Team role</label><select id="in-role" value={teamRole} onChange={(e) => setTeamRole(e.target.value as InsightsFilter["teamRole"] | "")}><option value="">All roles</option><option value="reporting">Reporting</option><option value="assigned">Assigned</option><option value="confirmed_cause">Confirmed cause</option></select></div>
          <div className="rrx-field"><label htmlFor="in-sup">Supplier</label><select id="in-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Any</option>{ws.catalog?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="rrx-field"><label htmlFor="in-status">Status</label><select id="in-status" value={status} onChange={(e) => setStatus(e.target.value as IssueStatus | "")}><option value="">Any</option>{ISSUE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
          <div className="rrx-field"><label htmlFor="in-sev">Severity</label><select id="in-sev" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")}><option value="">Any</option>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
        {ins.status === "loading" && !ins.data ? <Loading label="Loading insights" /> : null}
        {ins.status === "error" && ins.error ? <ErrorBanner error={ins.error} onRetry={ins.reload} /> : null}
        {ins.data ? <InsightsBody data={ins.data} Count={Count} /> : null}
      </div>
      {drill ? <Drilldown drill={drill} onClose={() => setDrill(null)} /> : null}
    </div>
  );
}

function InsightsBody({ data, Count }: { data: Insights; Count: (p: { n: number; title: string; ids: string[] }) => React.JSX.Element }) {
  const allIds = [...new Set([...data.teams.flatMap((t) => t.reportedIssueIds), ...data.suppliers.flatMap((s) => s.linkedIssueIds), ...data.detectionStations.flatMap((b) => b.issueIds)])];
  return (
    <div className="rrx-stack">
      <div className="rrx-grid-3">
        <div className="rrx-metric" role="group"><strong><Count n={data.totalIssueCount} title="All issues in filter" ids={allIds} /></strong><span>Distinct issues (filtered)</span></div>
        <div className="rrx-metric" role="group"><strong>{data.openIssueCount}</strong><span>Open (not closed)</span></div>
        <div className="rrx-metric" role="group"><strong>{data.reusedFixCount}</strong><span>Fix proposals reused from a prior fix · {data.reopenedIssueCount} reopened</span></div>
      </div>

      <section>
        <h3>Teams: reported vs assigned vs confirmed cause</h3>
        {data.teams.length ? (
          <table data-testid="team-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Reported issues</th>
                <th>Assigned open backlog</th>
                <th>Confirmed primary cause</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.teamId}>
                  <td>{t.teamName}</td>
                  <td><Count n={t.reportedIssueCount} title={`Reported by ${t.teamName}`} ids={t.reportedIssueIds} /></td>
                  <td><Count n={t.assignedOpenCount} title={`Assigned to ${t.teamName} (open)`} ids={t.assignedOpenIssueIds} /></td>
                  <td><Count n={t.confirmedCauseIssueCount} title={`Confirmed cause: ${t.teamName}`} ids={t.confirmedCauseIssueIds} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No team activity in this filter.</Empty>
        )}
        <p className="rrx-muted rrx-small">These three counts are not combined into a blame score. A team that finds a defect did not necessarily cause it.</p>
      </section>

      <section>
        <h3>Suppliers: linked vs confirmed fault</h3>
        {data.suppliers.length ? (
          <table data-testid="supplier-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Linked issues (context)</th>
                <th>Confirmed supplier-caused</th>
                <th>Distinct affected units</th>
                <th>Inspected units (cohort)</th>
                <th>Affected-unit rate</th>
              </tr>
            </thead>
            <tbody>
              {data.suppliers.map((s) => (
                <tr key={s.supplierId}>
                  <td>{s.supplierName}</td>
                  <td><Count n={s.linkedIssueCount} title={`Linked to ${s.supplierName}`} ids={s.linkedIssueIds} /></td>
                  <td><Count n={s.confirmedIssueCount} title={`Confirmed fault: ${s.supplierName}`} ids={s.confirmedIssueIds} /></td>
                  <td>{s.distinctAffectedUnitCount}</td>
                  <td>{s.inspectedUnitCount === null ? <span className="rrx-muted">unknown</span> : `${s.inspectedUnitCount}${s.cohortComplete ? "" : " (incomplete)"}`}</td>
                  <td data-testid={`rate-${s.supplierId}`}>{fmtRate(s.affectedUnitRate)}{s.affectedUnitRate === null ? <span className="rrx-muted rrx-small"> · no complete cohort</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No supplier-linked issues in this filter.</Empty>
        )}
      </section>

      <div className="rrx-grid-2">
        <Buckets title="Where defects were detected (station)" hint="Detection location, not cause." buckets={data.detectionStations} Count={Count} />
        <Buckets title="Confirmed causal process step" hint="Only confirmed primary causes." buckets={data.causalProcessSteps} Count={Count} />
        <Buckets title="Confirmed cause types" hint="Hypotheses excluded." buckets={data.causeTypes} Count={Count} />
        <Buckets title="Defect families" hint="By defect code family." buckets={data.defectFamilies} Count={Count} />
      </div>
      {data.notes.length ? (
        <div className="rrx-banner rrx-banner--info" style={{ display: "block" }}>
          {data.notes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Buckets({ title, hint, buckets, Count }: { title: string; hint: string; buckets: Insights["detectionStations"]; Count: (p: { n: number; title: string; ids: string[] }) => React.JSX.Element }) {
  const max = Math.max(1, ...buckets.map((b) => b.issueCount));
  return (
    <section className="rrx-card rrx-card--soft">
      <div className="rrx-card-head">
        <h3>{title}</h3>
        <span className="rrx-muted rrx-small">{hint}</span>
      </div>
      {buckets.length ? (
        <table>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.id}>
                <td style={{ width: "45%" }}>{b.label}</td>
                <td>
                  <div style={{ height: 8, borderRadius: 4, background: "#fff", opacity: 0.85, width: `${(b.issueCount / max) * 100}%`, minWidth: 4 }} />
                </td>
                <td style={{ width: 40, textAlign: "right" }}><Count n={b.issueCount} title={`${title}: ${b.label}`} ids={b.issueIds} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <span className="rrx-muted rrx-small">Nothing in this filter.</span>
      )}
    </section>
  );
}

function Drilldown({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const ws = useWorkspace();
  const ids = drill.issueIds.slice(0, 20);
  const details = useAsync(async () => {
    const results = await Promise.all(ids.map((id) => ws.client.getIssue(id)));
    const ok = results.filter((r): r is { ok: true; data: IssueDetail } => r.ok).map((r) => r.data);
    const failed = results.filter((r) => !r.ok).length;
    return { ok: true as const, data: { ok, failed } };
  }, [drill.issueIds.join(","), ws.client]);
  return (
    <div className="rrx-overlay" onClick={onClose} role="presentation">
      <div className="rrx-dialog" role="dialog" aria-label={drill.title} onClick={(e) => e.stopPropagation()} data-testid="drilldown">
        <div className="rrx-card-head">
          <h2>{drill.title}</h2>
          <button type="button" className="rrx-btn rrx-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="rrx-muted rrx-small">
          {drill.issueIds.length} issue id(s) behind this count{drill.issueIds.length > 20 ? "; showing the first 20" : ""}. Evidence is listed per issue.
        </p>
        {details.status === "loading" && !details.data ? <Loading label="Loading issues" /> : null}
        {details.data?.failed ? <Banner kind="error">{details.data.failed} issue(s) could not be loaded from the backend.</Banner> : null}
        {details.data?.ok.map((d) => (
          <div key={d.issue.id} className="rrx-fixcard" style={{ marginBottom: 8 }}>
            <div className="rrx-row">
              <StatusBadge status={d.issue.status} />
              <button type="button" className="rrx-count-btn" onClick={() => ws.openIssue(d.issue.id)}>
                {d.issue.title}
              </button>
              <span className="rrx-mono rrx-muted rrx-small">{d.issue.id}</span>
            </div>
            <div className="rrx-small" style={{ marginTop: 4 }}>
              Reported by {ws.lookup.team(d.issue.reportingTeamId)} · assigned {d.issue.assignedTeamId ? ws.lookup.team(d.issue.assignedTeamId) : "unassigned"} · confirmed cause:{" "}
              {(() => {
                const c = d.causes.find((x) => x.isCurrent && x.state === "confirmed");
                return c ? `${c.causeType.replace(/_/g, " ")} (${c.responsibleTeamId ? ws.lookup.team(c.responsibleTeamId) : c.responsibleSupplierId ? ws.lookup.supplier(c.responsibleSupplierId) : "no party"})` : "none";
              })()}
            </div>
            <div className="rrx-muted rrx-small">
              Evidence: {d.evidence.length ? d.evidence.map((e) => `${e.id} (${e.sourceName})`).join("; ") : "none"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
