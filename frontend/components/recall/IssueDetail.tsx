"use client";
/**
 * Issue detail. Always fetches the stored record on open (and after every mutation) so what is
 * shown is what the server saved. Distinct labels for reporter, current owner, detection station,
 * process owner and confirmed cause.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { IssueCommentInput, IssueDetail as IssueDetailDto, IssueUpdate } from "@/contracts/issues";
import { newIdempotencyKey } from "../../features/recall/api/types";
import { useWorkspace } from "../../features/recall/context";
import { ATTRIBUTION, fmtDate } from "../../features/recall/format";
import { useAsync, useMutation } from "../../features/recall/hooks";
import { AssemblyContext } from "./AssemblyContext";
import { CausePanel } from "./CausePanel";
import { Banner, Empty, ErrorBanner, Loading, SeverityBadge, SourcingBadge, StatusBadge } from "./primitives";
import { ResolutionPanel } from "./ResolutionPanel";

export type IssueDetailTab = "overview" | "investigation" | "resolution" | "assembly" | "history";
const TABS: Array<{ id: IssueDetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "investigation", label: "Investigation" },
  { id: "resolution", label: "Resolution" },
  { id: "assembly", label: "Assembly context" },
  { id: "history", label: "History" },
];

export function IssueDetailView({ issueId, initialTab = "overview", onBack }: { issueId: string; initialTab?: IssueDetailTab; onBack: () => void }) {
  const ws = useWorkspace();
  const [tab, setTab] = useState<IssueDetailTab>(initialTab);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const detail = useAsync(() => ws.client.getIssue(issueId), [issueId, ws.client]);
  useEffect(() => setTab(initialTab), [issueId, initialTab]);
  const refresh = (note?: string) => {
    if (note) setSavedNote(note);
    detail.reload();
  };
  useEffect(() => {
    if (!savedNote) return;
    const t = setTimeout(() => setSavedNote(null), 3500);
    return () => clearTimeout(t);
  }, [savedNote]);

  if (!detail.data) {
    if (detail.status === "error" && detail.error) return <ErrorBanner error={detail.error} onRetry={detail.reload} />;
    return <Loading label={`Loading issue ${issueId} from the backend`} />;
  }
  const d = detail.data;
  const issue = d.issue;
  const confirmed = d.causes.find((c) => c.isCurrent && c.state === "confirmed") ?? null;
  const supplierHypotheses = d.causes.filter((c) => c.state === "hypothesis" && c.responsibleSupplierId);
  const originOf = (id: string) => d.entities.find((e) => e.id === id)?.origin?.sourcingType;

  return (
    <div className="rrx-stack" data-testid="issue-detail">
      <div className="rrx-row">
        <button type="button" className="rrx-btn rrx-btn--sm rrx-btn--ghost" onClick={onBack}>
          ← Issues
        </button>
        <span className="rrx-mono rrx-muted">{issue.id}</span>
        <span className="rrx-muted rrx-small">saved v{issue.version} · updated {fmtDate(issue.updatedAt)}</span>
        {detail.status === "loading" ? <span className="rrx-muted rrx-small"><span className="rrx-spinner" />refreshing</span> : null}
        {savedNote ? <span className="rrx-badge rrx-badge--ok" role="status">{savedNote}</span> : null}
      </div>
      {detail.status === "error" && detail.error ? <ErrorBanner error={detail.error} onRetry={detail.reload} /> : null}
      <div className="rrx-card">
        <div className="rrx-card-head">
          <h1 style={{ marginBottom: 0 }}>{issue.title}</h1>
          <div className="rrx-row">
            <StatusBadge status={issue.status} />
            <SeverityBadge severity={issue.severity} />
            <span className="rrx-badge rrx-badge--muted">origin: {issue.origin}</span>
          </div>
        </div>
        <div className="rrx-attr" data-testid="attribution">
          <div>
            <span className="rrx-label">{ATTRIBUTION.reportedBy}</span>
            {ws.lookup.team(issue.reportingTeamId)}
            <div className="rrx-muted rrx-small">by {issue.createdBy}</div>
          </div>
          <div>
            <span className="rrx-label">{ATTRIBUTION.assignedTo}</span>
            {issue.assignedTeamId ? ws.lookup.team(issue.assignedTeamId) : <span className="rrx-muted">Unassigned</span>}
          </div>
          <div>
            <span className="rrx-label">{ATTRIBUTION.detectedAt}</span>
            {ws.lookup.station(issue.detectionStationId)}
            <div className="rrx-muted rrx-small">{ATTRIBUTION.processOwner}: {ws.lookup.process(issue.processStepId)}</div>
          </div>
          <div>
            <span className="rrx-label">{ATTRIBUTION.confirmedCauseTeam}</span>
            {confirmed ? (
              <>
                {confirmed.responsibleTeamId ? ws.lookup.team(confirmed.responsibleTeamId) : confirmed.responsibleSupplierId ? `${ATTRIBUTION.confirmedSupplierFault}: ${ws.lookup.supplier(confirmed.responsibleSupplierId)}` : "Confirmed, no party"}
                <div className="rrx-muted rrx-small">
                  {ATTRIBUTION.confirmedCauseStation}: {ws.lookup.station(confirmed.causalStationId)} / {ws.lookup.process(confirmed.causalProcessStepId)}
                </div>
              </>
            ) : (
              <span className="rrx-muted">Not confirmed</span>
            )}
          </div>
        </div>
        <div className="rrx-row" style={{ marginTop: 10 }}>
          <span className="rrx-label">{ATTRIBUTION.linkedSupplier}:</span>
          {issue.linkedSupplierIds.length ? issue.linkedSupplierIds.map((s) => <span key={s} className="rrx-badge">{ws.lookup.supplier(s)}</span>) : <span className="rrx-muted">none</span>}
          {supplierHypotheses.length ? <span className="rrx-badge rrx-badge--warning">{ATTRIBUTION.suspectedSupplier}: {supplierHypotheses.map((c) => ws.lookup.supplier(c.responsibleSupplierId)).join(", ")}</span> : null}
          {confirmed?.responsibleSupplierId ? <span className="rrx-badge rrx-badge--blocking">{ATTRIBUTION.confirmedSupplierFault}: {ws.lookup.supplier(confirmed.responsibleSupplierId)}</span> : <span className="rrx-muted rrx-small">no confirmed supplier fault</span>}
        </div>
        <div className="rrx-row" style={{ marginTop: 8 }}>
          <span className="rrx-label">Marked items:</span>
          {issue.entityIds.length ? (
            issue.entityIds.map((id) => (
              <button key={id} type="button" className="rrx-chip" onClick={() => ws.openEntity(id)} title="Show on sketch">
                <SourcingBadge sourcing={originOf(id)} compact /> <span className="rrx-mono">{id}</span>
              </button>
            ))
          ) : (
            <span className="rrx-muted">none marked</span>
          )}
          {issue.partNumber ? <span className="rrx-muted rrx-small">part {issue.partNumber}{issue.partRevision ? ` rev ${issue.partRevision}` : ""}</span> : null}
          {issue.defectCode ? <span className="rrx-badge rrx-badge--muted">{ws.lookup.defect(issue.defectCode)}</span> : null}
        </div>
      </div>

      <div className="rrx-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <Overview d={d} onChanged={refresh} /> : null}
      {tab === "investigation" ? <CausePanel detail={d} onChanged={() => refresh("Assessment saved")} /> : null}
      {tab === "resolution" ? <ResolutionPanel detail={d} onChanged={() => refresh("Saved")} /> : null}
      {tab === "assembly" ? <AssemblyContext detail={d} /> : null}
      {tab === "history" ? <History d={d} /> : null}
    </div>
  );
}

function Overview({ d, onChanged }: { d: IssueDetailDto; onChanged: (note?: string) => void }) {
  const ws = useWorkspace();
  const issue = d.issue;
  const [assigned, setAssigned] = useState(issue.assignedTeamId ?? "");
  const [description, setDescription] = useState(issue.description);
  useEffect(() => {
    setAssigned(issue.assignedTeamId ?? "");
    setDescription(issue.description);
  }, [issue.assignedTeamId, issue.description, issue.version]);
  const update = useMutation((u: IssueUpdate) => ws.client.updateIssue(issue.id, u));
  const dirty = assigned !== (issue.assignedTeamId ?? "") || description !== issue.description;
  const save = async () => {
    const r = await update.run({ expectedVersion: issue.version, assignedTeamId: assigned || null, description });
    if (r?.ok) onChanged("Issue saved");
  };
  return (
    <div className="rrx-split">
      <div className="rrx-stack">
        <section className="rrx-card">
          <div className="rrx-card-head">
            <h3>Observed problem and assignment</h3>
            {issue.status !== "closed" ? (
              <button type="button" className="rrx-btn rrx-btn--primary rrx-btn--sm" disabled={!dirty || update.pending} onClick={save} data-testid="save-issue">
                {update.pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </button>
            ) : null}
          </div>
          {update.error ? <ErrorBanner error={update.error} onRetry={update.error.code === "STALE_VERSION" ? () => onChanged() : undefined} retryLabel="Reload latest" /> : null}
          <div className="rrx-form-grid">
            <div className="rrx-field rrx-field--full">
              <label htmlFor="ov-desc">Observed problem</label>
              <textarea id="ov-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={issue.status === "closed"} />
            </div>
            <div className="rrx-field">
              <label htmlFor="ov-asg">{ATTRIBUTION.assignedTo}</label>
              <select id="ov-asg" value={assigned} onChange={(e) => setAssigned(e.target.value)} disabled={issue.status === "closed"} data-testid="assign-select">
                <option value="">Unassigned</option>
                {ws.catalog?.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rrx-field">
              <label>Detected</label>
              <div>{fmtDate(issue.detectedAt)}</div>
            </div>
          </div>
        </section>
        <Comments d={d} onChanged={onChanged} />
      </div>
      <div className="rrx-stack">
        <section className="rrx-card">
          <h3>Affected items</h3>
          {d.entities.length ? (
            <table>
              <thead>
                <tr>
                  <th>Serial / build</th>
                  <th>Part</th>
                  <th>Origin</th>
                </tr>
              </thead>
              <tbody>
                {d.entities.map((e) => (
                  <tr key={e.id}>
                    <td className="rrx-mono">
                      {e.id}
                      {e.vehicle ? <div className="rrx-muted rrx-small">{e.vehicle.vin ? `VIN ${e.vehicle.vin}` : "VIN not assigned"}</div> : null}
                    </td>
                    <td>
                      {e.partNumber}
                      {e.partRevision ? ` rev ${e.partRevision}` : ""}
                      <div className="rrx-muted rrx-small">{e.kind}</div>
                    </td>
                    <td>
                      <SourcingBadge sourcing={e.origin?.sourcingType} compact />
                      <div className="rrx-muted rrx-small">{e.origin?.sourcingType === "supplier" ? `${ws.lookup.supplier(e.origin.supplierId)} · ${e.origin.supplierBatchCode}` : e.origin?.sourcingType === "in_house" ? `${e.origin.manufacturingLotCode} · ${e.origin.workOrderId}` : e.kind === "vehicle" ? "Assembled here · no origin record" : "no origin record"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No serial or build marked. The issue is still valid; mark items when known.</Empty>
          )}
          {issue.entityIds.filter((id) => !d.entities.some((e) => e.id === id)).length ? <Banner kind="warning">Marked ids not found in the backend: {issue.entityIds.filter((id) => !d.entities.some((e) => e.id === id)).join(", ")}</Banner> : null}
        </section>
        <section className="rrx-card">
          <h3>Evidence</h3>
          {d.evidence.length ? (
            d.evidence.map((ev) => (
              <div key={ev.id} className="rrx-fixcard" style={{ marginBottom: 6 }}>
                <div className="rrx-row">
                  <span className="rrx-mono">{ev.id}</span>
                  <span className={`rrx-badge ${ev.sourceKind.startsWith("public") ? "rrx-badge--warning" : ev.sourceKind === "synthetic" ? "rrx-badge--muted" : "rrx-badge--accent"}`}>
                    {ev.sourceKind.startsWith("public") ? "Public evidence (external)" : ev.sourceKind === "synthetic" ? "Internal record" : ev.sourceKind.replace("_", " ")}
                  </span>
                  <span className="rrx-muted rrx-small">{ev.sourceName}</span>
                </div>
                <div className="rrx-small" style={{ marginTop: 4 }}>{ev.text}</div>
                {ev.sourceUrl ? (
                  <div className="rrx-muted rrx-small">
                    Source record {ev.sourceRecordId} · retrieved {fmtDate(ev.retrievedAt)} ·{" "}
                    <a href={ev.sourceUrl} target="_blank" rel="noreferrer">
                      source
                    </a>{" "}
                    · external record; not linked to any vehicle here as an occurrence
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <Empty>No evidence attached yet.</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function Comments({ d, onChanged }: { d: IssueDetailDto; onChanged: (note?: string) => void }) {
  const ws = useWorkspace();
  const [body, setBody] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const key = useMemo(() => newIdempotencyKey("cmt"), [d.comments.length]);
  const m = useMutation((input: IssueCommentInput) => ws.client.addComment(d.issue.id, input));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await m.run({ idempotencyKey: key, body: body.trim(), evidenceIds: [], newEvidence: evidenceText.trim() ? [{ sourceName: "Comment evidence", locator: "manual-note", text: evidenceText.trim() }] : [] });
    if (r?.ok) {
      setBody("");
      setEvidenceText("");
      onChanged("Comment saved");
    }
  };
  return (
    <section className="rrx-card">
      <h3>Comments and annotations</h3>
      {d.comments.length ? (
        <ul className="rrx-timeline">
          {d.comments.map((c) => (
            <li key={c.id} data-testid={`comment-${c.id}`}>
              <div>{c.body}</div>
              <div className="rrx-muted rrx-small">
                {c.authorId} · {fmtDate(c.createdAt)}
                {c.evidenceIds.length ? ` · evidence ${c.evidenceIds.join(", ")}` : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rrx-muted rrx-small">No comments yet.</p>
      )}
      <form onSubmit={submit} className="rrx-stack" aria-label="Add comment">
        {m.error ? <ErrorBanner error={m.error} /> : null}
        <div className="rrx-field">
          <label htmlFor="cm-body">Add a comment</label>
          <textarea id="cm-body" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 56 }} placeholder="Observation, measurement or annotation" />
        </div>
        <div className="rrx-field">
          <label htmlFor="cm-ev">Attach evidence note (optional)</label>
          <input id="cm-ev" value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} placeholder="e.g. photo reference, gauge reading" />
        </div>
        <div className="rrx-row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="rrx-btn" disabled={m.pending || !body.trim()} data-testid="save-comment">
            {m.pending ? "Saving…" : "Save comment"}
          </button>
        </div>
      </form>
    </section>
  );
}

function History({ d }: { d: IssueDetailDto }) {
  return (
    <section className="rrx-card">
      <h3>Audit history</h3>
      {d.audit.length ? (
        <ul className="rrx-timeline" data-testid="audit">
          {[...d.audit].reverse().map((a) => (
            <li key={a.id}>
              <div>
                <span className="rrx-badge rrx-badge--muted">{a.kind.replace("_", " ")}</span> {a.summary}
                {a.fromStatus || a.toStatus ? <span className="rrx-muted"> ({a.fromStatus ?? "—"} → {a.toStatus ?? "—"})</span> : null}
              </div>
              <div className="rrx-muted rrx-small">
                {a.actorId} · {fmtDate(a.at)}
                {a.subjectId ? ` · ${a.subjectId}` : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No audit events.</Empty>
      )}
    </section>
  );
}
