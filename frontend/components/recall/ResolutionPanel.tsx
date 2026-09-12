"use client";
/**
 * Resolution: prior verified fixes (similar-resolution query), fix revisions on this issue,
 * apply / verify / status actions. The server enforces transitions; the UI only pre-checks.
 * A reused fix is "Proposed from a verified prior resolution" until this issue's own
 * verification passes.
 */
import { useMemo, useState, type FormEvent } from "react";
import type { FixRevision, FixRevisionInput, IssueDetail, SimilarResolution, TransitionAction, TransitionCommand, VerificationInput } from "@/contracts/issues";
import { TRANSITIONS } from "@/contracts/issues";
import { newIdempotencyKey } from "../../features/recall/api/types";
import { useWorkspace } from "../../features/recall/context";
import { ATTRIBUTION, STATUS_LABEL, fmtDate } from "../../features/recall/format";
import { useAsync, useMutation } from "../../features/recall/hooks";
import { Banner, Empty, ErrorBanner, FixStateBadge, Loading } from "./primitives";

type FixDraft = { summary: string; steps: string[]; partNumber: string; partRevision: string; processStepId: string; limitations: string; workInstructionRef: string; sourceFixRevisionId: string | null; sourceIssueId: string | null };

export function ResolutionPanel({ detail, onChanged }: { detail: IssueDetail; onChanged: () => void }) {
  const ws = useWorkspace();
  const issue = detail.issue;
  const [draft, setDraft] = useState<FixDraft | null>(null);
  const [verifyFor, setVerifyFor] = useState<string | null>(null);
  const similar = useAsync(() => ws.client.findSimilarResolutions(issue.id), [issue.id, issue.version, ws.client]);
  const closed = issue.status === "closed";

  const startReuse = (r: SimilarResolution) => {
    setDraft({
      summary: r.fixSummary,
      steps: [],
      partNumber: issue.partNumber ?? "",
      partRevision: issue.partRevision ?? "",
      processStepId: issue.processStepId ?? "",
      // Warnings are server prose ("limitation: ..."); keep the bare limitation text so it is not re-prefixed on save.
      limitations: r.applicabilityWarnings.map((w) => w.replace(/^limitation:\s*/i, "")).join("\n"),
      workInstructionRef: "",
      sourceFixRevisionId: r.sourceFixRevisionId,
      sourceIssueId: r.sourceIssueId,
    });
    void ws.client.getIssue(r.sourceIssueId).then((res) => {
      if (!res.ok) return;
      const src = res.data.fixes.find((f) => f.id === r.sourceFixRevisionId);
      if (src) setDraft((d) => (d && d.sourceFixRevisionId === src.id ? { ...d, steps: src.steps.map((s) => s.instruction), workInstructionRef: src.workInstructionRef ?? "", partNumber: d.partNumber || src.applicability.partNumber || "", partRevision: d.partRevision || src.applicability.partRevision || "", processStepId: d.processStepId || src.applicability.processStepId || "", limitations: src.applicability.limitations.length ? src.applicability.limitations.join("\n") : d.limitations } : d));
    });
  };

  return (
    <div className="rrx-stack">
      <StatusActions detail={detail} onChanged={onChanged} />

      <section className="rrx-card" data-testid="similar-resolutions">
        <div className="rrx-card-head">
          <h3>Prior verified fixes that may apply</h3>
          <span className="rrx-muted rrx-small">Graph query: defect code, part/revision, process step, confirmed cause. Verified first.</span>
        </div>
        {similar.status === "loading" && !similar.data ? <Loading label="Searching prior resolutions" /> : null}
        {similar.status === "error" && similar.error ? <ErrorBanner error={similar.error} onRetry={similar.reload} /> : null}
        {similar.data ? (
          similar.data.results.length ? (
            similar.data.results.map((r) => {
              const verified = r.verificationId !== "NONE";
              return (
                <div key={r.sourceFixRevisionId} className="rrx-fixcard rrx-fixcard--source" style={{ marginBottom: 8 }} data-testid={`similar-${r.sourceFixRevisionId}`}>
                  <div className="rrx-row">
                    {verified ? <span className="rrx-badge rrx-badge--ok">Verified {fmtDate(r.verifiedAt)}</span> : <span className="rrx-badge rrx-badge--warning">Unverified suggestion</span>}
                    <strong>{r.fixSummary}</strong>
                  </div>
                  <div className="rrx-small" style={{ marginTop: 4 }}>
                    From issue{" "}
                    <button type="button" className="rrx-count-btn" onClick={() => ws.openIssue(r.sourceIssueId, "resolution")}>
                      {r.sourceIssueId}
                    </button>{" "}
                    · {r.sourceIssueTitle} · fix <span className="rrx-mono">{r.sourceFixRevisionId}</span>
                    {verified ? <> · verification <span className="rrx-mono">{r.verificationId}</span></> : null}
                  </div>
                  <div className="rrx-grid-2" style={{ marginTop: 6 }}>
                    <div>
                      <div className="rrx-label">Why it matched</div>
                      <ul className="rrx-oklist rrx-small">
                        {r.matchReasons.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="rrx-label">Applicability limits</div>
                      {r.applicabilityWarnings.length ? (
                        <ul className="rrx-warnlist rrx-small">
                          {r.applicabilityWarnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="rrx-muted rrx-small">No warnings; engineering still reviews before applying.</span>
                      )}
                    </div>
                  </div>
                  <div className="rrx-row" style={{ marginTop: 8 }}>
                    <button type="button" className="rrx-btn" onClick={() => startReuse(r)} disabled={closed} data-testid={`reuse-${r.sourceFixRevisionId}`}>
                      Reuse as new proposal
                    </button>
                    <span className="rrx-muted rrx-small">Creates an editable proposal linked to the source; this issue still needs its own verification.</span>
                  </div>
                </div>
              );
            })
          ) : (
            <Empty>No compatible prior fix found. Record the cause and part details to improve matching.</Empty>
          )
        ) : null}
        {similar.data ? <p className="rrx-muted rrx-small" style={{ margin: "6px 0 0" }}>{similar.data.queryExplanation}</p> : null}
      </section>

      <section className="rrx-card">
        <div className="rrx-card-head">
          <h3>Fix revisions on this issue</h3>
          <button type="button" className="rrx-btn rrx-btn--primary" disabled={closed || Boolean(draft)} onClick={() => setDraft({ summary: "", steps: [""], partNumber: issue.partNumber ?? "", partRevision: issue.partRevision ?? "", processStepId: issue.processStepId ?? "", limitations: "", workInstructionRef: "", sourceFixRevisionId: null, sourceIssueId: null })} data-testid="new-fix">
            + New fix proposal
          </button>
        </div>
        {draft ? <FixForm detail={detail} draft={draft} setDraft={setDraft} onDone={() => { setDraft(null); onChanged(); }} onCancel={() => setDraft(null)} /> : null}
        {detail.fixes.length ? (
          [...detail.fixes]
            .sort((a, b) => b.version - a.version)
            .map((f) => <FixCard key={f.id} fix={f} detail={detail} onVerify={() => setVerifyFor(f.id)} verifying={verifyFor === f.id} onChanged={onChanged} onCloseVerify={() => setVerifyFor(null)} />)
        ) : (
          <Empty>No fix proposed yet.</Empty>
        )}
      </section>

      <section className="rrx-card">
        <h3>Verifications</h3>
        {detail.verifications.length ? (
          <table>
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Fix</th>
                <th>Method</th>
                <th>Result</th>
                <th>By / at</th>
              </tr>
            </thead>
            <tbody>
              {detail.verifications.map((v) => (
                <tr key={v.id} data-testid={`verification-${v.id}`}>
                  <td>{v.outcome === "pass" ? <span className="rrx-badge rrx-badge--ok">Passed</span> : <span className="rrx-badge rrx-badge--blocking">Failed</span>}</td>
                  <td className="rrx-mono">{v.fixRevisionId}</td>
                  <td>{v.method}</td>
                  <td>{v.resultNotes}</td>
                  <td className="rrx-small">
                    {v.verifiedBy} · {fmtDate(v.verifiedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No verification recorded. The issue cannot close until a verification of the applied fix passes.</Empty>
        )}
      </section>
    </div>
  );
}

function StatusActions({ detail, onChanged }: { detail: IssueDetail; onChanged: () => void }) {
  const ws = useWorkspace();
  const issue = detail.issue;
  const [reason, setReason] = useState("");
  const m = useMutation((cmd: TransitionCommand) => ws.client.transition(issue.id, cmd));
  // Contract rule: close needs a fix whose LATEST verification passed (a later failure re-blocks it).
  const latestByFix = new Map<string, (typeof detail.verifications)[number]>();
  for (const v of [...detail.verifications].sort((a, b) => a.verifiedAt.localeCompare(b.verifiedAt) || a.id.localeCompare(b.id))) latestByFix.set(v.fixRevisionId, v);
  const closableFix = [...detail.fixes].sort((a, b) => b.version - a.version).find((f) => latestByFix.get(f.id)?.outcome === "pass") ?? null;
  const appliedFix = [...detail.fixes].sort((a, b) => b.version - a.version).find((f) => f.state === "applied" || f.id === issue.currentFixRevisionId) ?? null;
  const act = async (action: TransitionAction, fixRevisionId: string | null = null) => {
    const r = await m.run({ idempotencyKey: newIdempotencyKey("tr"), action, expectedVersion: issue.version, reason, fixRevisionId });
    if (r?.ok) {
      setReason("");
      onChanged();
    }
  };
  const allowed = (a: TransitionAction) => TRANSITIONS[a].from.includes(issue.status);
  return (
    <section className="rrx-card" data-testid="status-actions">
      <div className="rrx-card-head">
        <h3>
          Status: {STATUS_LABEL[issue.status]} <span className="rrx-muted rrx-small">v{issue.version}</span>
        </h3>
        <span className="rrx-muted rrx-small">Transitions are enforced by the server. Closing a ticket does not release a vehicle for shipment.</span>
      </div>
      {m.error ? <ErrorBanner error={m.error} onRetry={m.error.code === "STALE_VERSION" ? onChanged : undefined} retryLabel="Reload issue" /> : null}
      <div className="rrx-row">
        <input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" style={{ flex: 1, minWidth: 200, background: "#000", border: "1px solid var(--rr-border-strong)", borderRadius: 6, padding: "6px 9px" }} />
        <button type="button" className="rrx-btn" disabled={m.pending || !allowed("triage")} onClick={() => act("triage")}>
          Triage
        </button>
        <button type="button" className="rrx-btn" disabled={m.pending || !allowed("start_work")} onClick={() => act("start_work")}>
          Start work
        </button>
        <button type="button" className="rrx-btn rrx-btn--primary" disabled={m.pending || !allowed("close") || !closableFix} onClick={() => act("close", closableFix?.id ?? null)} title={closableFix ? `Close with verified fix v${closableFix.version}` : "Requires a passed verification of an applied fix"} data-testid="close-issue">
          Close{closableFix ? ` with verified fix v${closableFix.version}` : ""}
        </button>
        <button type="button" className="rrx-btn rrx-btn--danger" disabled={m.pending || !allowed("reopen")} onClick={() => act("reopen")}>
          Reopen
        </button>
      </div>
      {issue.status === "pending_verification" ? <Banner kind="warning">Pending review: record the verification result of the applied fix below. A failed verification returns the issue to work.</Banner> : null}
      {allowed("close") && !closableFix ? (
        <div style={{ marginTop: 8 }}>
          <Banner kind="warning">
            <strong>Close is blocked (VERIFICATION_REQUIRED).</strong>{" "}
            {appliedFix
              ? latestByFix.get(appliedFix.id)?.outcome === "fail"
                ? `The latest verification of fix v${appliedFix.version} failed; the issue stays open. Record a passed verification before closing.`
                : appliedFix.state === "proposed"
                  ? `Fix v${appliedFix.version} is only proposed. Mark it applied (request verification), then record a passed verification; the server enforces the same rule.`
                  : `Fix v${appliedFix.version} is applied but has no passed verification yet. Record one below; the server enforces the same rule.`
              : "No fix has been applied and verified on this issue. Propose or reuse a fix, mark it applied, then record a passed verification."}
          </Banner>
        </div>
      ) : issue.status !== "closed" && !closableFix ? (
        <p className="rrx-muted rrx-small" style={{ margin: "8px 0 0" }} data-testid="close-hint">Close is available only after a verification of an applied fix passes on this issue.</p>
      ) : null}
    </section>
  );
}

function FixCard({ fix, detail, onVerify, verifying, onCloseVerify, onChanged }: { fix: FixRevision; detail: IssueDetail; onVerify: () => void; verifying: boolean; onCloseVerify: () => void; onChanged: () => void }) {
  const ws = useWorkspace();
  const issue = detail.issue;
  const apply = useMutation((cmd: TransitionCommand) => ws.client.transition(issue.id, cmd));
  const canApply = fix.state === "proposed" && TRANSITIONS.request_verification.from.includes(issue.status);
  const failed = detail.verifications.filter((v) => v.fixRevisionId === fix.id && v.outcome === "fail").length;
  return (
    <div className="rrx-fixcard" style={{ marginBottom: 8 }} data-testid={`fix-${fix.id}`}>
      <div className="rrx-row">
        <strong>
          v{fix.version}: {fix.summary}
        </strong>
        <FixStateBadge state={fix.state} />
        {fix.sourceFixRevisionId ? (
          <span className="rrx-badge rrx-badge--accent" title={`Copied from ${fix.sourceFixRevisionId}; the source fix is unchanged`}>
            {ATTRIBUTION.proposedFromPrior}
          </span>
        ) : null}
        {issue.currentFixRevisionId === fix.id ? <span className="rrx-badge rrx-badge--muted">current fix</span> : null}
      </div>
      <ol className="rrx-steps">
        {fix.steps.map((s) => (
          <li key={s.order}>{s.instruction}</li>
        ))}
      </ol>
      <div className="rrx-muted rrx-small" style={{ marginTop: 6 }}>
        Applies to {fix.applicability.partNumber ?? "any part"}
        {fix.applicability.partRevision ? ` rev ${fix.applicability.partRevision}` : ""} · {ws.lookup.process(fix.applicability.processStepId)} · WI: {fix.workInstructionRef ?? "none"}
        {fix.sourceFixRevisionId ? <> · source <span className="rrx-mono">{fix.sourceFixRevisionId}</span></> : null} · created {fmtDate(fix.createdAt)}
        {fix.appliedAt ? ` · applied ${fmtDate(fix.appliedAt)}` : ""}
      </div>
      {fix.applicability.limitations.length ? (
        <ul className="rrx-warnlist rrx-small">
          {fix.applicability.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      {failed ? <div className="rrx-small" style={{ color: "var(--rr-blocking)", marginTop: 4 }}>{failed} failed verification(s); the issue stays open for work.</div> : null}
      {apply.error ? <ErrorBanner error={apply.error} /> : null}
      <div className="rrx-row" style={{ marginTop: 8 }}>
        {canApply ? (
          <button
            type="button"
            className="rrx-btn"
            disabled={apply.pending}
            onClick={async () => {
              const r = await apply.run({ idempotencyKey: newIdempotencyKey("apply"), action: "request_verification", expectedVersion: issue.version, reason: `Applied fix v${fix.version}`, fixRevisionId: fix.id });
              if (r?.ok) onChanged();
            }}
            data-testid={`apply-${fix.id}`}
          >
            Mark applied and request verification
          </button>
        ) : null}
        {fix.state === "proposed" && !canApply && issue.status !== "closed" ? <span className="rrx-muted rrx-small">Start work on the issue before applying a fix.</span> : null}
        {issue.status !== "closed" && fix.state !== "verified" ? (
          <button type="button" className="rrx-btn" onClick={verifying ? onCloseVerify : onVerify} data-testid={`verify-${fix.id}`}>
            {verifying ? "Cancel verification" : "Record verification"}
          </button>
        ) : null}
      </div>
      {verifying ? <VerificationForm detail={detail} fix={fix} onDone={() => { onCloseVerify(); onChanged(); }} /> : null}
    </div>
  );
}

function FixForm({ detail, draft, setDraft, onDone, onCancel }: { detail: IssueDetail; draft: FixDraft; setDraft: (d: FixDraft) => void; onDone: () => void; onCancel: () => void }) {
  const ws = useWorkspace();
  const key = useMemo(() => newIdempotencyKey("fix"), []);
  const m = useMutation((input: FixRevisionInput) => ws.client.createFix(detail.issue.id, input));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const steps = draft.steps.map((s) => s.trim()).filter(Boolean);
    const r = await m.run({
      idempotencyKey: key,
      summary: draft.summary.trim(),
      steps: steps.map((instruction, i) => ({ order: i + 1, instruction })),
      applicability: { partNumber: draft.partNumber.trim() || null, partRevision: draft.partRevision.trim() || null, processStepId: draft.processStepId || null, limitations: draft.limitations.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20) },
      sourceFixRevisionId: draft.sourceFixRevisionId,
      workInstructionRef: draft.workInstructionRef.trim() || null,
      evidenceIds: [],
    });
    if (r?.ok) onDone();
  };
  return (
    <form onSubmit={submit} className="rrx-card rrx-card--soft rrx-stack" aria-label="Fix proposal" data-testid="fix-form">
      {draft.sourceFixRevisionId ? (
        <Banner kind="info">
          <strong>{ATTRIBUTION.proposedFromPrior}.</strong> Copied from <span className="rrx-mono">{draft.sourceFixRevisionId}</span> on issue {draft.sourceIssueId}. Edit freely; the source fix is never changed and this issue still needs its own verification.
        </Banner>
      ) : null}
      {m.error ? <ErrorBanner error={m.error} /> : null}
      <div className="rrx-form-grid">
        <div className="rrx-field rrx-field--full">
          <label htmlFor="fx-sum">Summary *</label>
          <input id="fx-sum" required value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
        </div>
        <div className="rrx-field rrx-field--full">
          <label>Steps *</label>
          {draft.steps.map((s, i) => (
            <div key={i} className="rrx-row" style={{ flexWrap: "nowrap" }}>
              <span className="rrx-muted rrx-small">{i + 1}.</span>
              <input aria-label={`Step ${i + 1}`} value={s} onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} aria-label={`Remove step ${i + 1}`}>
                ×
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => setDraft({ ...draft, steps: [...draft.steps, ""] })}>
              + Step
            </button>
          </div>
        </div>
        <div className="rrx-field">
          <label htmlFor="fx-pn">Applies to part / revision</label>
          <div className="rrx-row" style={{ flexWrap: "nowrap" }}>
            <input id="fx-pn" value={draft.partNumber} onChange={(e) => setDraft({ ...draft, partNumber: e.target.value })} />
            <input aria-label="Applies to revision" value={draft.partRevision} onChange={(e) => setDraft({ ...draft, partRevision: e.target.value })} style={{ width: 80 }} />
          </div>
        </div>
        <div className="rrx-field">
          <label htmlFor="fx-ps">Applies to process step</label>
          <select id="fx-ps" value={draft.processStepId} onChange={(e) => setDraft({ ...draft, processStepId: e.target.value })}>
            <option value="">Any</option>
            {ws.catalog?.processSteps.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="fx-wi">Approved work-instruction reference</label>
          <input id="fx-wi" value={draft.workInstructionRef} onChange={(e) => setDraft({ ...draft, workInstructionRef: e.target.value })} placeholder="e.g. WI-BRKT-014 (placeholder)" />
        </div>
        <div className="rrx-field">
          <label htmlFor="fx-lim">Limitations (one per line)</label>
          <textarea id="fx-lim" value={draft.limitations} onChange={(e) => setDraft({ ...draft, limitations: e.target.value })} style={{ minHeight: 60 }} />
        </div>
      </div>
      <div className="rrx-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="rrx-btn rrx-btn--ghost" onClick={onCancel} disabled={m.pending}>
          Cancel
        </button>
        <button type="submit" className="rrx-btn rrx-btn--primary" disabled={m.pending || !draft.summary.trim() || !draft.steps.some((s) => s.trim())} data-testid="save-fix">
          {m.pending ? "Saving…" : "Save proposal"}
        </button>
      </div>
    </form>
  );
}

function VerificationForm({ detail, fix, onDone }: { detail: IssueDetail; fix: FixRevision; onDone: () => void }) {
  const ws = useWorkspace();
  const key = useMemo(() => newIdempotencyKey("ver"), []);
  const [outcome, setOutcome] = useState<"pass" | "fail">("pass");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const m = useMutation((input: VerificationInput) => ws.client.recordVerification(detail.issue.id, input));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await m.run({ idempotencyKey: key, fixRevisionId: fix.id, outcome, method: method.trim(), resultNotes: notes.trim(), evidenceIds: [], newEvidence: evidenceText.trim() ? [{ sourceName: "Verification evidence", locator: "manual-note", text: evidenceText.trim() }] : [] });
    if (r?.ok) onDone();
  };
  return (
    <form onSubmit={submit} className="rrx-card rrx-card--soft rrx-stack" style={{ marginTop: 8 }} aria-label="Record verification" data-testid="verification-form">
      {m.error ? <ErrorBanner error={m.error} /> : null}
      <div className="rrx-form-grid">
        <div className="rrx-field">
          <label htmlFor="vf-out">Outcome</label>
          <select id="vf-out" value={outcome} onChange={(e) => setOutcome(e.target.value as "pass" | "fail")}>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
        </div>
        <div className="rrx-field">
          <label htmlFor="vf-m">Method *</label>
          <input id="vf-m" required value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e.g. Alignment gauge, four points" />
        </div>
        <div className="rrx-field rrx-field--full">
          <label htmlFor="vf-n">Result notes *</label>
          <textarea id="vf-n" required value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 56 }} />
        </div>
        <div className="rrx-field rrx-field--full">
          <label htmlFor="vf-e">Evidence note (optional)</label>
          <input id="vf-e" value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} placeholder="e.g. gauge photo reference" />
        </div>
      </div>
      <div className="rrx-row" style={{ justifyContent: "flex-end" }}>
        <button type="submit" className="rrx-btn rrx-btn--primary" disabled={m.pending || !method.trim() || !notes.trim()} data-testid="save-verification">
          {m.pending ? "Saving…" : `Record ${outcome}`}
        </button>
      </div>
    </form>
  );
}
