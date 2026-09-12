"use client";
/** Investigation: hypotheses are listed separately from confirmed and rejected causes. */
import { useMemo, useState, type FormEvent } from "react";
import type { CauseAssessment, CauseAssessmentInput, CauseState, CauseType, IssueDetail } from "@/contracts/issues";
import { CAUSE_STATES, CAUSE_TYPES } from "@/contracts/issues";
import { newIdempotencyKey } from "../../features/recall/api/types";
import { useWorkspace } from "../../features/recall/context";
import { ATTRIBUTION, CAUSE_TYPE_LABEL, fmtDate } from "../../features/recall/format";
import { useMutation } from "../../features/recall/hooks";
import { CauseStateBadge, Empty, ErrorBanner } from "./primitives";

export function CausePanel({ detail, onChanged }: { detail: IssueDetail; onChanged: () => void }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const groups: Array<{ state: CauseState; title: string; hint: string }> = [
    { state: "hypothesis", title: "Cause hypotheses", hint: "Under review. Hypotheses never enter confirmed-cause analytics." },
    { state: "confirmed", title: "Confirmed cause", hint: "Reviewed attribution with evidence and an accountable reviewer. Superseded confirmations stay in history." },
    { state: "rejected", title: "Rejected causes", hint: "Kept so the reasoning is not repeated." },
  ];
  const evidenceById = new Map(detail.evidence.map((e) => [e.id, e]));
  return (
    <div className="rrx-stack">
      <div className="rrx-card-head">
        <h2>Investigation</h2>
        <button type="button" className="rrx-btn rrx-btn--primary" onClick={() => setOpen(!open)} disabled={detail.issue.status === "closed"} data-testid="record-cause">
          {open ? "Close form" : "+ Record cause assessment"}
        </button>
      </div>
      {open ? <CauseForm detail={detail} onDone={() => { setOpen(false); onChanged(); }} /> : null}
      {groups.map((g) => {
        const list = detail.causes.filter((c) => c.state === g.state).sort((a, b) => (a.assessedAt < b.assessedAt ? 1 : -1));
        return (
          <section key={g.state} className="rrx-card" data-testid={`causes-${g.state}`}>
            <div className="rrx-card-head">
              <h3>
                {g.title} <span className="rrx-muted">({list.length})</span>
              </h3>
              <span className="rrx-muted rrx-small">{g.hint}</span>
            </div>
            {list.length ? (
              list.map((c) => <CauseCard key={c.id} cause={c} evidenceById={evidenceById} />)
            ) : (
              <Empty>{g.state === "confirmed" ? "No confirmed cause yet. Detection location and linked suppliers are not causes." : "None recorded."}</Empty>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CauseCard({ cause, evidenceById }: { cause: CauseAssessment; evidenceById: Map<string, { sourceName: string }> }) {
  const ws = useWorkspace();
  const responsible =
    cause.causeType === "supplier_component" || cause.responsibleSupplierId
      ? `${cause.state === "confirmed" ? ATTRIBUTION.confirmedSupplierFault : ATTRIBUTION.suspectedSupplier}: ${ws.lookup.supplier(cause.responsibleSupplierId)}`
      : cause.responsibleTeamId
        ? `${cause.state === "confirmed" ? ATTRIBUTION.confirmedCauseTeam : "Suspected team"}: ${ws.lookup.team(cause.responsibleTeamId)}`
        : "Responsible party not identified";
  return (
    <div className="rrx-fixcard" style={{ marginBottom: 8 }} data-testid={`cause-${cause.id}`}>
      <div className="rrx-row">
        <CauseStateBadge state={cause.state} />
        <strong>{CAUSE_TYPE_LABEL[cause.causeType]}</strong>
        {cause.isCurrent ? <span className="rrx-badge rrx-badge--ok">current primary cause</span> : null}
        {cause.supersedesId ? <span className="rrx-muted rrx-small">supersedes {cause.supersedesId}</span> : null}
      </div>
      <div style={{ marginTop: 6 }}>{responsible}</div>
      {cause.causalStationId || cause.causalProcessStepId ? (
        <div className="rrx-small">
          {ATTRIBUTION.confirmedCauseStation}: {ws.lookup.station(cause.causalStationId)} / {ws.lookup.process(cause.causalProcessStepId)}
        </div>
      ) : null}
      <p style={{ margin: "6px 0" }}>{cause.rationale}</p>
      <div className="rrx-muted rrx-small">
        Assessed by {cause.assessedBy} · {fmtDate(cause.assessedAt)} · evidence: {cause.evidenceIds.length ? cause.evidenceIds.map((id) => `${id} (${evidenceById.get(id)?.sourceName ?? "unknown"})`).join(", ") : "none"}
      </div>
    </div>
  );
}

function CauseForm({ detail, onDone }: { detail: IssueDetail; onDone: () => void }) {
  const ws = useWorkspace();
  const key = useMemo(() => newIdempotencyKey("cause"), []);
  const current = detail.causes.find((c) => c.isCurrent);
  const [state, setState] = useState<CauseState>("hypothesis");
  const [causeType, setCauseType] = useState<CauseType>("unknown");
  const [teamId, setTeamId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [stationId, setStationId] = useState("");
  const [processId, setProcessId] = useState("");
  const [rationale, setRationale] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [supersede, setSupersede] = useState(Boolean(current));
  const m = useMutation((input: CauseAssessmentInput) => ws.client.recordCause(detail.issue.id, input));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await m.run({
      idempotencyKey: key,
      state,
      causeType,
      responsibleTeamId: teamId || null,
      responsibleSupplierId: supplierId || null,
      causalStationId: stationId || null,
      causalProcessStepId: processId || null,
      rationale: rationale.trim(),
      evidenceIds,
      supersedesId: supersede && current ? current.id : null,
    });
    if (r?.ok) onDone();
  };
  return (
    <form onSubmit={submit} className="rrx-card rrx-card--soft rrx-stack" aria-label="Record cause assessment">
      {m.error ? <ErrorBanner error={m.error} /> : null}
      <div className="rrx-form-grid">
        <div className="rrx-field">
          <label htmlFor="c-state">Assessment state</label>
          <select id="c-state" value={state} onChange={(e) => setState(e.target.value as CauseState)}>
            {CAUSE_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="c-type">Cause type</label>
          <select id="c-type" value={causeType} onChange={(e) => setCauseType(e.target.value as CauseType)}>
            {CAUSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CAUSE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="c-team">Responsible team (only if this is the cause)</label>
          <select id="c-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">None</option>
            {ws.catalog?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="c-sup">Responsible supplier (only if this is the cause)</label>
          <select id="c-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">None</option>
            {ws.catalog?.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="c-st">Causal station (not the detection station)</label>
          <select id="c-st" value={stationId} onChange={(e) => setStationId(e.target.value)}>
            <option value="">Unknown</option>
            {ws.catalog?.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="c-ps">Causal process step</label>
          <select id="c-ps" value={processId} onChange={(e) => setProcessId(e.target.value)}>
            <option value="">Unknown</option>
            {ws.catalog?.processSteps.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field rrx-field--full">
          <label htmlFor="c-rat">Rationale *</label>
          <textarea id="c-rat" required value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="What the evidence shows and why it supports or rejects this cause." />
        </div>
        <div className="rrx-field rrx-field--full">
          <label>Supporting evidence</label>
          <div className="rrx-row">
            {detail.evidence.map((ev) => (
              <label key={ev.id} className="rrx-chip" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={evidenceIds.includes(ev.id)} onChange={(e) => setEvidenceIds(e.target.checked ? [...evidenceIds, ev.id] : evidenceIds.filter((x) => x !== ev.id))} /> {ev.id} · {ev.sourceName}
              </label>
            ))}
            {!detail.evidence.length ? <span className="rrx-muted rrx-small">No evidence on this issue yet; add a comment with evidence first.</span> : null}
          </div>
        </div>
        {current ? (
          <div className="rrx-field rrx-field--inline rrx-field--full">
            <input id="c-sup-cur" type="checkbox" checked={supersede} onChange={(e) => setSupersede(e.target.checked)} />
            <label htmlFor="c-sup-cur">Supersedes the current primary assessment {current.id} (it stays in history)</label>
          </div>
        ) : null}
      </div>
      <div className="rrx-row" style={{ justifyContent: "flex-end" }}>
        <button type="submit" className="rrx-btn rrx-btn--primary" disabled={m.pending || !rationale.trim()}>
          {m.pending ? "Saving…" : "Save assessment"}
        </button>
      </div>
    </form>
  );
}
