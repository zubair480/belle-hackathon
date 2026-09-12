"use client";
/**
 * Manual issue creation. Works without CSV or AI. Unknown fields stay unknown (null/empty).
 * The idempotency key is generated once per draft so a retry after a backend error replays
 * instead of duplicating. The draft is preserved on error. Sections: what happened, where,
 * who, marked items, notes/evidence; sticky footer with a live summary.
 */
import { useMemo, useState, type FormEvent } from "react";
import type { CreateIssueCommand, Severity } from "@/contracts/issues";
import { SEVERITIES } from "@/contracts/issues";
import { newIdempotencyKey } from "../../features/recall/api/types";
import { useWorkspace, type NewIssuePrefill } from "../../features/recall/context";
import { SEVERITY_LABEL, nowLocalInput, toUtcIso } from "../../features/recall/format";
import { useMutation } from "../../features/recall/hooks";
import { SKETCH_VEHICLES, ZONES, slotForEntityId } from "../../features/recall/sketches/car3d";
import { ErrorBanner } from "./primitives";

export type NewIssueFormProps = { prefill?: NewIssuePrefill; onCreated: (issueId: string) => void; onCancel: () => void };

type EvidenceDraft = { sourceName: string; text: string };

const SEVERITY_HINT: Record<Severity, string> = { minor: "Cosmetic or convenience; vehicle can proceed", major: "Function affected; needs a fix before release", critical: "Safety or HV related; stop and escalate" };

function describeEntity(id: string): { label: string; detail: string } {
  const v = SKETCH_VEHICLES.find((x) => x.entityId === id);
  if (v) return { label: `${v.modelName} · vehicle`, detail: v.buildId };
  const hit = slotForEntityId(id);
  if (!hit) return { label: "Item", detail: id };
  return { label: hit.slot.label, detail: `${ZONES[hit.slot.zone] ?? hit.slot.zone}${hit.slot.side !== "C" ? ` · ${hit.slot.side}` : ""}` };
}

export function NewIssueForm({ prefill, onCreated, onCancel }: NewIssueFormProps) {
  const ws = useWorkspace();
  const key = useMemo(() => newIdempotencyKey("issue"), []);
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [severity, setSeverity] = useState<Severity>(prefill?.severity ?? "major");
  const [detectedAt, setDetectedAt] = useState(nowLocalInput());
  const [reportingTeamId, setReportingTeamId] = useState(prefill?.reportingTeamId ?? ws.catalog?.teams[0]?.id ?? "");
  const [assignedTeamId, setAssignedTeamId] = useState(prefill?.assignedTeamId ?? "");
  const [detectionStationId, setDetectionStationId] = useState(prefill?.detectionStationId ?? "");
  const [processStepId, setProcessStepId] = useState(prefill?.processStepId ?? "");
  const [defectCode, setDefectCode] = useState(prefill?.defectCode ?? "");
  const [partNumber, setPartNumber] = useState(prefill?.partNumber ?? "");
  const [partRevision, setPartRevision] = useState(prefill?.partRevision ?? "");
  const [entityIds, setEntityIds] = useState<string[]>(prefill?.entityIds ?? []);
  const [entityDraft, setEntityDraft] = useState("");
  const [suppliers, setSuppliers] = useState<string[]>(prefill?.linkedSupplierIds ?? []);
  const [evidence, setEvidence] = useState<EvidenceDraft[]>(prefill?.contextNote ? [{ sourceName: "Operator note", text: prefill.contextNote }] : []);
  const create = useMutation((cmd: CreateIssueCommand) => ws.client.createIssue(cmd));

  const addEntity = () => {
    const v = entityDraft.trim();
    if (v && !entityIds.includes(v)) setEntityIds([...entityIds, v]);
    setEntityDraft("");
  };
  const canSubmit = Boolean(title.trim() && reportingTeamId) && !create.pending;
  const vehicleId = entityIds.find((id) => SKETCH_VEHICLES.some((v) => v.entityId === id)) ?? entityIds.find((id) => /^DEMO-EV-/.test(id)) ?? null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const cmd: CreateIssueCommand = {
      idempotencyKey: key,
      title: title.trim(),
      description: description.trim(),
      origin: "manual",
      detectedAt: toUtcIso(detectedAt),
      reportingTeamId,
      assignedTeamId: assignedTeamId || null,
      detectionStationId: detectionStationId || null,
      processStepId: processStepId || null,
      entityIds,
      partNumber: partNumber.trim() || null,
      partRevision: partRevision.trim() || null,
      linkedSupplierIds: suppliers,
      defectCode: defectCode || null,
      severity,
      evidenceIds: [],
      newEvidence: evidence.filter((x) => x.text.trim()).map((x) => ({ sourceName: x.sourceName.trim() || "Operator note", locator: "manual-note", text: x.text.trim() })),
    };
    const r = await create.run(cmd);
    if (r?.ok) onCreated(r.data.id);
  };

  return (
    <form onSubmit={submit} className="rrx-ni" aria-label="New issue" data-testid="new-issue-form">
      <header className="rrx-ni-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>New issue</h2>
          <div className="rrx-muted rrx-small">Describe what was observed and mark the part, station or process. Unknown fields can stay empty; they remain editable. Saved as a real record, no import or model needed.</div>
        </div>
        <div className="rrx-row">
          <span className="rrx-badge rrx-badge--muted">origin: manual</span>
          <button type="button" className="rrx-btn rrx-btn--sm rrx-btn--ghost" onClick={onCancel} aria-label="Close" disabled={create.pending}>
            ×
          </button>
        </div>
      </header>

      <div className="rrx-ni-body">
        {create.error ? <ErrorBanner error={create.error} /> : null}

        <section className="rrx-ni-section">
          <h3>1 · What happened</h3>
          <div className="rrx-form-grid">
            <div className="rrx-field rrx-field--full">
              <label htmlFor="ni-title">Title *</label>
              <input id="ni-title" required maxLength={256} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Charge-port connector misaligned on DEMO-EV-005" autoFocus />
            </div>
            <div className="rrx-field rrx-field--full">
              <label htmlFor="ni-desc">Observed problem</label>
              <textarea id="ni-desc" maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was seen, measured or heard. Not the cause." />
            </div>
            <div className="rrx-field">
              <label>Severity</label>
              <div className="rrx-seg" role="radiogroup" aria-label="Severity">
                {SEVERITIES.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={severity === s} className={`rrx-seg-btn rrx-seg-btn--${s}`} onClick={() => setSeverity(s)} title={SEVERITY_HINT[s]}>
                    {SEVERITY_LABEL[s]}
                  </button>
                ))}
              </div>
              <span className="rrx-muted rrx-small">{SEVERITY_HINT[severity]}</span>
            </div>
            <div className="rrx-field">
              <label htmlFor="ni-at">Detected at (local time)</label>
              <input id="ni-at" type="datetime-local" value={detectedAt} onChange={(e) => setDetectedAt(e.target.value)} />
            </div>
            <div className="rrx-field rrx-field--full">
              <label htmlFor="ni-dc">Defect code</label>
              <select id="ni-dc" value={defectCode} onChange={(e) => setDefectCode(e.target.value)}>
                <option value="">Not classified yet</option>
                {ws.catalog?.defectCodes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.id}){d.family ? ` · ${d.family}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rrx-ni-section">
          <h3>2 · Where it was found</h3>
          <div className="rrx-form-grid">
            <div className="rrx-field">
              <label htmlFor="ni-st">Detection station</label>
              <select id="ni-st" value={detectionStationId} onChange={(e) => setDetectionStationId(e.target.value)}>
                <option value="">Unknown</option>
                {ws.catalog?.stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.areaLabel ? ` · ${s.areaLabel}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="rrx-field">
              <label htmlFor="ni-ps">Process step</label>
              <select id="ni-ps" value={processStepId} onChange={(e) => setProcessStepId(e.target.value)}>
                <option value="">Unknown</option>
                {ws.catalog?.processSteps.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <span className="rrx-muted rrx-small">Where it was found is not where it was caused. Causal station and team are recorded later as a reviewed cause.</span>
        </section>

        <section className="rrx-ni-section">
          <h3>3 · Who</h3>
          <div className="rrx-form-grid">
            <div className="rrx-field">
              <label htmlFor="ni-rep">Reporting team *</label>
              <select id="ni-rep" required value={reportingTeamId} onChange={(e) => setReportingTeamId(e.target.value)}>
                {ws.catalog?.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rrx-field">
              <label htmlFor="ni-asg">Assigned team (current owner)</label>
              <select id="ni-asg" value={assignedTeamId} onChange={(e) => setAssignedTeamId(e.target.value)}>
                <option value="">Unassigned</option>
                {ws.catalog?.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="rrx-ni-section">
          <h3>4 · Marked items and part</h3>
          <div className="rrx-ni-items" data-testid="entity-chips">
            {entityIds.length ? (
              entityIds.map((id) => {
                const d = describeEntity(id);
                return (
                  <div key={id} className="rrx-ni-item">
                    <div>
                      <div className="rrx-mono">{id}</div>
                      <div className="rrx-muted rrx-small">
                        {d.label} · {d.detail}
                      </div>
                    </div>
                    <button type="button" className="rrx-btn rrx-btn--sm rrx-btn--ghost" aria-label={`Remove ${id}`} onClick={() => setEntityIds(entityIds.filter((x) => x !== id))}>
                      ×
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="rrx-muted rrx-small">No item marked yet. Tap a part on the Vehicles sketch, or add a serial or build id below.</div>
            )}
          </div>
          <div className="rrx-row" style={{ flexWrap: "nowrap", marginTop: 8 }}>
            <input
              id="ni-ent"
              aria-label="Marked items (component, module, vehicle build id)"
              value={entityDraft}
              onChange={(e) => setEntityDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEntity();
                }
              }}
              placeholder="Add a serial or build id, e.g. CPM-0005 or DEMO-EV-005"
              className="rrx-ni-input"
            />
            <button type="button" className="rrx-btn" onClick={addEntity} disabled={!entityDraft.trim()}>
              Add
            </button>
          </div>
          <div className="rrx-form-grid" style={{ marginTop: 10 }}>
            <div className="rrx-field">
              <label htmlFor="ni-pn">Part number</label>
              <input id="ni-pn" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="e.g. CP-BRKT-200" />
            </div>
            <div className="rrx-field">
              <label htmlFor="ni-rev">Part revision</label>
              <input id="ni-rev" aria-label="Part revision" value={partRevision} onChange={(e) => setPartRevision(e.target.value)} placeholder="e.g. A" />
            </div>
            <div className="rrx-field rrx-field--full">
              <label>Linked suppliers (context only, not a fault claim)</label>
              <div className="rrx-row">
                {ws.catalog?.suppliers.map((s) => (
                  <label key={s.id} className={`rrx-chip${suppliers.includes(s.id) ? " rrx-chip--on" : ""}`} style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={suppliers.includes(s.id)} onChange={(e) => setSuppliers(e.target.checked ? [...suppliers, s.id] : suppliers.filter((x) => x !== s.id))} /> {s.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rrx-ni-section">
          <h3>5 · Notes and evidence</h3>
          {evidence.map((ev, i) => (
            <div key={i} className="rrx-ni-evidence">
              <input aria-label={`Evidence ${i + 1} source`} value={ev.sourceName} onChange={(e) => setEvidence(evidence.map((x, j) => (j === i ? { ...x, sourceName: e.target.value } : x)))} placeholder="Source (gauge photo, note, log)" />
              <textarea aria-label={`Evidence ${i + 1} text`} value={ev.text} onChange={(e) => setEvidence(evidence.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="What the evidence shows" />
              <button type="button" className="rrx-btn rrx-btn--sm rrx-btn--ghost" onClick={() => setEvidence(evidence.filter((_, j) => j !== i))} aria-label={`Remove evidence ${i + 1}`}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => setEvidence([...evidence, { sourceName: "Operator note", text: "" }])}>
            + Add note / evidence
          </button>
        </section>
      </div>

      <footer className="rrx-ni-foot">
        <div className="rrx-muted rrx-small" data-testid="ni-summary">
          {vehicleId ? <span className="rrx-mono">{vehicleId}</span> : "No vehicle marked"} · {entityIds.length} item(s) · {SEVERITY_LABEL[severity]} · {ws.lookup.team(reportingTeamId)}
          {evidence.filter((e) => e.text.trim()).length ? ` · ${evidence.filter((e) => e.text.trim()).length} note(s)` : ""}
        </div>
        <div className="rrx-row">
          <button type="button" className="rrx-btn rrx-btn--ghost" onClick={onCancel} disabled={create.pending}>
            Cancel
          </button>
          <button type="submit" className="rrx-btn rrx-btn--primary" disabled={!canSubmit} data-testid="submit-issue">
            {create.pending ? "Saving…" : "Save issue"}
          </button>
        </div>
      </footer>
    </form>
  );
}
