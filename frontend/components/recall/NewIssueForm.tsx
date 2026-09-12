"use client";
/**
 * Manual issue creation. Works without CSV or AI. Unknown fields stay unknown (null/empty).
 * The idempotency key is generated once per draft so a retry after a backend error replays
 * instead of duplicating. The draft is preserved on error.
 */
import { useMemo, useState, type FormEvent } from "react";
import type { CreateIssueCommand, Severity } from "@/contracts/issues";
import { SEVERITIES } from "@/contracts/issues";
import { newIdempotencyKey } from "../../features/recall/api/types";
import { useWorkspace, type NewIssuePrefill } from "../../features/recall/context";
import { nowLocalInput, toUtcIso } from "../../features/recall/format";
import { useMutation } from "../../features/recall/hooks";
import { Banner, ErrorBanner } from "./primitives";

export type NewIssueFormProps = { prefill?: NewIssuePrefill; onCreated: (issueId: string) => void; onCancel: () => void };

type EvidenceDraft = { sourceName: string; text: string };

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

  /** INVALID_REFERENCE details from the server, e.g. { invalid: ["entity:BATT-0005"] } (sketch-only ids have no backend record). */
  const invalidRefs = useMemo(() => {
    if (create.error?.code !== "INVALID_REFERENCE") return [];
    const d = create.error.details as { invalid?: unknown } | undefined;
    return Array.isArray(d?.invalid) ? d.invalid.filter((x): x is string => typeof x === "string") : [];
  }, [create.error]);
  const invalidEntityIds = invalidRefs.filter((x) => x.startsWith("entity:")).map((x) => x.slice("entity:".length));

  const addEntity = () => {
    const v = entityDraft.trim();
    if (v && !entityIds.includes(v)) setEntityIds([...entityIds, v]);
    setEntityDraft("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (create.pending) return;
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
    <form onSubmit={submit} className="rrx-stack" aria-label="New issue" data-testid="new-issue-form">
      <div className="rrx-card-head">
        <div>
          <h2>New issue</h2>
          <p className="rrx-muted" style={{ marginBottom: 0 }}>
            Describe what was observed and mark the part, station or process. Leave unknown fields empty; they stay editable later.
          </p>
        </div>
        <span className="rrx-badge rrx-badge--muted">origin: manual</span>
      </div>
      {create.error ? <ErrorBanner error={create.error} /> : null}
      {invalidRefs.length ? (
        <Banner
          kind="warning"
          action={
            invalidEntityIds.length ? (
              <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => setEntityIds(entityIds.filter((id) => !invalidEntityIds.includes(id)))} data-testid="remove-unknown-ids">
                Remove unknown ids
              </button>
            ) : undefined
          }
        >
          The server has no record for: <span className="rrx-mono">{invalidRefs.join(", ")}</span>. Sketch-only slots (for example BATT-0005) are drawn from the platform design and are not backend entities; remove them or keep the note in the description. Nothing was saved.
        </Banner>
      ) : null}
      <div className="rrx-form-grid">
        <div className="rrx-field rrx-field--full">
          <label htmlFor="ni-title">Title *</label>
          <input id="ni-title" required maxLength={256} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Charge-port connector misaligned on DEMO-EV-005" />
        </div>
        <div className="rrx-field rrx-field--full">
          <label htmlFor="ni-desc">Observed problem</label>
          <textarea id="ni-desc" maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was seen, measured or heard. Not the cause." />
        </div>
        <div className="rrx-field">
          <label htmlFor="ni-sev">Severity</label>
          <select id="ni-sev" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="ni-at">Detected at (local time)</label>
          <input id="ni-at" type="datetime-local" value={detectedAt} onChange={(e) => setDetectedAt(e.target.value)} />
        </div>
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
        <div className="rrx-field">
          <label htmlFor="ni-st">Detection station (where found)</label>
          <select id="ni-st" value={detectionStationId} onChange={(e) => setDetectionStationId(e.target.value)}>
            <option value="">Unknown</option>
            {ws.catalog?.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="ni-ps">Process step (where found)</label>
          <select id="ni-ps" value={processStepId} onChange={(e) => setProcessStepId(e.target.value)}>
            <option value="">Unknown</option>
            {ws.catalog?.processSteps.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="ni-dc">Defect code</label>
          <select id="ni-dc" value={defectCode} onChange={(e) => setDefectCode(e.target.value)}>
            <option value="">Not classified yet</option>
            {ws.catalog?.defectCodes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.id})
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="ni-pn">Part number / revision</label>
          <div className="rrx-row" style={{ flexWrap: "nowrap" }}>
            <input id="ni-pn" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Part number" />
            <input aria-label="Part revision" value={partRevision} onChange={(e) => setPartRevision(e.target.value)} placeholder="Rev" style={{ width: 80 }} />
          </div>
        </div>
        <div className="rrx-field rrx-field--full">
          <label htmlFor="ni-ent">Marked items (component, module, vehicle build id)</label>
          <div className="rrx-chips" data-testid="entity-chips">
            {entityIds.map((id) => (
              <span key={id} className="rrx-chip rrx-mono">
                {id}
                <button type="button" aria-label={`Remove ${id}`} onClick={() => setEntityIds(entityIds.filter((x) => x !== id))}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="rrx-row" style={{ flexWrap: "nowrap" }}>
            <input
              id="ni-ent"
              value={entityDraft}
              onChange={(e) => setEntityDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEntity();
                }
              }}
              placeholder="Add a serial or build id, e.g. CPM-0005 or DEMO-EV-005"
            />
            <button type="button" className="rrx-btn" onClick={addEntity}>
              Add
            </button>
          </div>
          <span className="rrx-muted rrx-small">Tip: tap a part on the Vehicles sketch to prefill this from the recorded assembly.</span>
        </div>
        <div className="rrx-field rrx-field--full">
          <label>Linked suppliers (context only, not a fault claim)</label>
          <div className="rrx-row">
            {ws.catalog?.suppliers.map((s) => (
              <label key={s.id} className="rrx-chip" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={suppliers.includes(s.id)} onChange={(e) => setSuppliers(e.target.checked ? [...suppliers, s.id] : suppliers.filter((x) => x !== s.id))} /> {s.name}
              </label>
            ))}
          </div>
        </div>
        <div className="rrx-field rrx-field--full">
          <label>Notes and evidence</label>
          {evidence.map((ev, i) => (
            <div key={i} className="rrx-row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <input aria-label={`Evidence ${i + 1} source`} value={ev.sourceName} onChange={(e) => setEvidence(evidence.map((x, j) => (j === i ? { ...x, sourceName: e.target.value } : x)))} placeholder="Source (e.g. gauge photo, note)" style={{ width: 200 }} />
              <textarea aria-label={`Evidence ${i + 1} text`} value={ev.text} onChange={(e) => setEvidence(evidence.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="What the evidence shows" style={{ minHeight: 44 }} />
              <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => setEvidence(evidence.filter((_, j) => j !== i))} aria-label={`Remove evidence ${i + 1}`}>
                ×
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => setEvidence([...evidence, { sourceName: "Operator note", text: "" }])}>
              + Add note / evidence
            </button>
          </div>
        </div>
      </div>
      <div className="rrx-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="rrx-btn rrx-btn--ghost" onClick={onCancel} disabled={create.pending}>
          Cancel
        </button>
        <button type="submit" className="rrx-btn rrx-btn--primary" disabled={create.pending || !title.trim() || !reportingTeamId} data-testid="submit-issue">
          {create.pending ? "Saving…" : "Save issue"}
        </button>
      </div>
    </form>
  );
}
