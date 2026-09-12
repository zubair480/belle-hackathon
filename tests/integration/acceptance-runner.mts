/**
 * RecallRadius HTTP acceptance runner (assembly-quality-v4).
 *
 * Drives the REQUIRED ACCEPTANCE EVIDENCE through the HTTP API of a running server. This is the
 * HTTP acceptance; the browser workflow is a separate check (tests/integration/BROWSER_ACCEPTANCE.md).
 *
 *   node tests/integration/acceptance-runner.mts --base http://localhost:3000 [--out report.json]
 *        [--expectations tests/integration/acceptance-expectations.json] [--allow-double]
 *        [--persist-from report.json]   # second run after a documented server restart
 *
 * Exit codes: 0 all steps passed, 1 some failed, 2 server is not running real graph services and
 * --allow-double was not given. Every mutation response is validated and failure details (HTTP
 * status, error code, message, details) are preserved in the JSON report.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Json = Record<string, unknown>;
const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name: string) => args.includes(`--${name}`);
const BASE = (opt("base", "http://localhost:3000") ?? "").replace(/\/$/, "");
const ALLOW_DOUBLE = flag("allow-double");
const OUT = opt("out", "acceptance-report.json")!;
const PERSIST_FROM = opt("persist-from");
const EXPECTATIONS_PATH = opt("expectations", new URL("./acceptance-expectations.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))!;

type Expectations = {
  workspaceId: string;
  revisionId: string;
  incidentId: string;
  scope: Json;
  traceRoots: Record<string, { root: { kind: string; id: string }; expectedCurrentVehicleIds: string[]; expectedCounts: Record<string, number>; expectedComponentIds: string[] }>;
  doubleContainment: { vehicleId: string; componentsPerRoot: number };
  issueStory: Record<string, string | string[]>;
};
const X: Expectations = JSON.parse(readFileSync(EXPECTATIONS_PATH, "utf8")) as Expectations;
const S = X.issueStory as Record<string, string> & { entityIds: string[] };

type StepResult = { step: string; ok: boolean; detail: string; failure?: { status?: number; code?: string; message?: string; details?: unknown } };
const results: StepResult[] = [];
const record = (step: string, ok: boolean, detail = "", failure?: StepResult["failure"]) => {
  results.push(failure ? { step, ok, detail, failure } : { step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? `  (${detail})` : ""}`);
};
let n = 0;
const key = () => `acc-${Date.now()}-${++n}`;

class StepError extends Error {
  readonly failure: StepResult["failure"];
  constructor(message: string, failure: StepResult["failure"]) {
    super(message);
    this.failure = failure;
  }
}
type Reply = { status: number; json: Json; text: string };
async function call(method: string, path: string, body?: unknown): Promise<Reply> {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: Json = {};
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = {};
  }
  return { status: res.status, json, text };
}
const failureOf = (r: Reply): StepResult["failure"] => {
  const e = (r.json.error as Json | undefined) ?? {};
  return { status: r.status, code: e.code as string | undefined, message: e.message as string | undefined, details: e.details };
};
/** Validates a mutation/read response: envelope ok, expected HTTP status, and required data keys. */
function expectOk<T extends Json>(r: Reply, expectedStatus: number | number[], requiredKeys: string[] = []): T {
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (r.json.ok !== true) throw new StepError(`envelope not ok (${r.status} ${String((r.json.error as Json | undefined)?.code)})`, failureOf(r));
  if (!statuses.includes(r.status)) throw new StepError(`unexpected HTTP status ${r.status}, wanted ${statuses.join("/")}`, failureOf(r));
  const d = r.json.data as T;
  const missing = requiredKeys.filter((k) => !(k in d));
  if (missing.length) throw new StepError(`response missing keys ${missing.join(", ")}`, { status: r.status, details: Object.keys(d) });
  return d;
}
const errCode = (r: Reply) => ((r.json.error as Json | undefined)?.code as string | undefined) ?? "none";
async function step(name: string, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const detail = await fn();
    record(name, true, detail ?? "");
    return true;
  } catch (e) {
    if (e instanceof StepError) record(name, false, e.message, e.failure);
    else record(name, false, e instanceof Error ? e.message : String(e));
    return false;
  }
}
const sortedEq = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const stable = (v: unknown) => JSON.stringify(v, Object.keys((v as Json) ?? {}).sort());

async function getIssue(id: string): Promise<Json> {
  return expectOk<Json>(await call("GET", `/api/issues/${encodeURIComponent(id)}`), 200, ["issue", "entities", "causes", "fixes", "verifications", "audit"]);
}
const historyOf = (d: Json) => ({
  status: (d.issue as Json).status,
  version: (d.issue as Json).version,
  currentFixRevisionId: (d.issue as Json).currentFixRevisionId,
  confirmedCauseId: (d.issue as Json).confirmedCauseId,
  fixStates: ((d.fixes as Json[]) ?? []).map((f) => [f.id, f.state]),
  verificationOutcomes: ((d.verifications as Json[]) ?? []).map((v) => v.outcome),
  auditKinds: ((d.audit as Json[]) ?? []).map((a) => `${String(a.kind)}:${String(a.fromStatus)}->${String(a.toStatus)}`),
  causeStates: ((d.causes as Json[]) ?? []).map((c) => [c.id, c.state, c.isCurrent]),
});

async function main(): Promise<void> {
  const health = expectOk<Json>(await call("GET", "/api/health"), 200);
  const realServices = health.servicesMode === "graph" && health.servicesRegistered === true;
  console.log(`health: services=${String(health.servicesMode)} registered=${String(health.servicesRegistered)} ai=${String(health.aiProvider)} neo4jConfigured=${String(health.neo4jConfigured)} workspace=${String(health.workspaceId)}`);
  if (!realServices && !ALLOW_DOUBLE) {
    console.error("Server is not running real graph services. Pass --allow-double for a development dry run; results are then labelled NOT integration evidence.");
    process.exit(2);
  }
  const mode = realServices ? "REAL graph services (integration evidence)" : "SERVICE DOUBLE (development dry run, NOT integration evidence)";
  console.log(`mode: ${mode}`);
  if (health.workspaceId !== X.workspaceId) record("server workspace matches expectations", false, `${String(health.workspaceId)} != ${X.workspaceId}`);

  // ----- Persistence check (separate run after a documented server restart) -----
  let persistence: Json | null = null;
  if (PERSIST_FROM) {
    const prior = JSON.parse(readFileSync(PERSIST_FROM, "utf8")) as Json;
    const priorIssueId = prior.issueId as string;
    const expectedHistory = prior.expectedHistory as Json;
    await step("persistence: issue from previous run retrievable after restart", async () => {
      const d = await getIssue(priorIssueId);
      const now = historyOf(d);
      if (stable(now) !== stable(expectedHistory)) throw new StepError("saved issue history differs from the pre-restart snapshot", { details: { expected: expectedHistory, actual: now } });
      return `${priorIssueId} status=${String(now.status)} version=${String(now.version)}`;
    });
    persistence = { priorIssueId, priorReport: PERSIST_FROM, restartDocumentedBy: "operator (see report notes)" };
  }

  // ----- Manual creation, no AI, no import -----
  let issueId = "";
  let issueVersion = 0;
  await step("create manual issue (201, no AI/import)", async () => {
    const r = await call("POST", "/api/issues", {
      idempotencyKey: key(), title: "Charge-port connector misaligned on DEMO-EV-005", description: "Acceptance run: connector does not seat; found at final inspection.", origin: "manual", detectedAt: "2026-09-12T10:00:00Z",
      reportingTeamId: S.reportingTeamId, assignedTeamId: null, detectionStationId: S.detectionStationId, processStepId: S.processStepId, entityIds: S.entityIds,
      partNumber: S.modulePartNumber, partRevision: "A", linkedSupplierIds: [S.linkedSupplierId], defectCode: S.defectCode, severity: "major", evidenceIds: [],
      newEvidence: [{ sourceName: "Operator note", locator: "note:1", text: "Connector sits proud; bracket looks skewed." }],
    });
    const issue = expectOk<Json>(r, 201, ["id", "version", "status"]);
    issueId = issue.id as string;
    issueVersion = issue.version as number;
    if (issue.status !== "open") throw new StepError(`status ${String(issue.status)}`, failureOf(r));
    return issueId;
  });
  if (!issueId) return finish(mode, realServices, "", null, persistence);

  let detail = await getIssue(issueId);
  await step("reload issue detail with audit and evidence", async () => {
    if ((detail.issue as Json).id !== issueId) throw new StepError("id mismatch", {});
    if (!((detail.audit as Json[]) ?? []).some((a) => a.kind === "created")) throw new StepError("no created audit event", {});
    if (!((detail.evidence as Json[]) ?? []).some((e) => e.sourceKind === "manual")) throw new StepError("manual evidence missing", {});
  });

  // ----- Both sourcing paths -----
  const ents = (detail.entities as Json[]) ?? [];
  const origin = (id: string) => ((ents.find((e) => e.id === id)?.origin as Json | null | undefined)?.sourcingType as string | undefined) ?? "none";
  await step("connector shows supplier origin with batch code", async () => {
    const o = ents.find((e) => e.id === "CONN-0005")?.origin as Json | null | undefined;
    if (o?.sourcingType !== "supplier" || !o.supplierBatchCode || o.manufacturingTeamId !== null) throw new StepError(`origin=${origin("CONN-0005")}`, { details: o });
    return String(o.supplierBatchCode);
  });
  await step("bracket shows in-house origin with lot, work order and team", async () => {
    const o = ents.find((e) => e.id === "BRKT-0005")?.origin as Json | null | undefined;
    if (o?.sourcingType !== "in_house" || !o.manufacturingLotCode || !o.workOrderId || !o.manufacturingTeamId || o.supplierId !== null) throw new StepError(`origin=${origin("BRKT-0005")}`, { details: o });
    return `${String(o.manufacturingLotCode)} / ${String(o.workOrderId)} / ${String(o.manufacturingTeamId)}`;
  });
  await step("vehicle carries build id with nullable VIN", async () => {
    const v = ents.find((e) => e.id === "DEMO-EV-005")?.vehicle as Json | undefined;
    if (v?.buildId !== "DEMO-EV-005" || v.vin !== null) throw new StepError("vehicle identity mismatch", { details: v });
  });

  // ----- Assignment and stale write -----
  await step("assign to In-house Manufacturing (version bumps)", async () => {
    const r = await call("PATCH", `/api/issues/${issueId}`, { expectedVersion: issueVersion, assignedTeamId: S.assignedTeamId });
    const i = expectOk<Json>(r, 200, ["version", "assignedTeamId", "reportingTeamId"]);
    if (i.assignedTeamId !== S.assignedTeamId || i.reportingTeamId !== S.reportingTeamId || (i.version as number) <= issueVersion) throw new StepError("assignment not applied", failureOf(r));
    issueVersion = i.version as number;
  });
  await step("stale write rejected (STALE_VERSION)", async () => {
    const r = await call("PATCH", `/api/issues/${issueId}`, { expectedVersion: issueVersion - 1, title: "stale write" });
    if (errCode(r) !== "STALE_VERSION" || r.status !== 409) throw new StepError(`got ${r.status} ${errCode(r)}`, failureOf(r));
  });
  await step("start work transition", async () => {
    const r = await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "start_work", expectedVersion: issueVersion });
    const i = expectOk<Json>(r, 200, ["status", "version"]);
    if (i.status !== "in_progress") throw new StepError(`status ${String(i.status)}`, failureOf(r));
    issueVersion = i.version as number;
  });

  // ----- Reviewed attribution -----
  let causeId = "";
  await step("hypothesis then confirmed in-house cause; reporter unchanged; supplier stays linked only", async () => {
    expectOk<Json>(await call("POST", `/api/issues/${issueId}/causes`, { idempotencyKey: key(), state: "hypothesis", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: S.linkedSupplierId, causalStationId: null, rationale: "Initial suspicion of connector.", evidenceIds: [] }), 201, ["id", "isCurrent"]);
    const r = await call("POST", `/api/issues/${issueId}/causes`, { idempotencyKey: key(), state: "confirmed", causeType: "in_house_manufacturing", responsibleTeamId: S.assignedTeamId, responsibleSupplierId: null, causalStationId: S.causalStationId, causalProcessStepId: S.causalProcessStepId, rationale: "Bracket out of tolerance confirmed by gauge.", evidenceIds: [] });
    const c = expectOk<Json>(r, 201, ["id", "state", "isCurrent"]);
    causeId = c.id as string;
    detail = await getIssue(issueId);
    const issue = detail.issue as Json;
    if (issue.confirmedCauseId !== causeId || issue.reportingTeamId !== S.reportingTeamId) throw new StepError("attribution not recorded as expected", { details: { confirmedCauseId: issue.confirmedCauseId, reportingTeamId: issue.reportingTeamId } });
    const hyp = ((detail.causes as Json[]) ?? []).find((x) => x.state === "hypothesis");
    if (hyp?.isCurrent !== false) throw new StepError("superseded hypothesis still current", { details: hyp });
    issueVersion = issue.version as number;
  });

  // ----- Prior verified fix retrieval and reuse with before/after comparison -----
  let sourceFixId = "";
  let sourceIssueId = "";
  let sourceFixBefore: Json | null = null;
  await step("prior verified fix retrieved with match reasons and verification evidence", async () => {
    const s = expectOk<Json>(await call("GET", `/api/issues/${issueId}/similar-resolutions`), 200, ["results"]);
    const results = (s.results as Json[]) ?? [];
    if (results.length === 0) throw new StepError("no results", { details: s });
    // A durable store accumulates verified fixes from earlier runs, so the seeded prior fix need not be
    // first; it must be retrieved, verified, and carry reasons that never rely on supplier overlap.
    const top = results.find((r) => r.sourceFixRevisionId === S.priorVerifiedFixId);
    if (!top) throw new StepError(`expected prior fix ${S.priorVerifiedFixId} not retrieved`, { details: results.map((r) => r.sourceFixRevisionId) });
    if (!(top.matchReasons as string[]).length || !top.verificationId) throw new StepError("missing reasons or verification", { details: top });
    if ((top.matchReasons as string[]).some((m) => /supplier/i.test(m))) throw new StepError("supplier overlap used as a match reason", { details: top });
    for (const r of results) if ((r.matchReasons as string[]).some((m) => /supplier/i.test(m))) throw new StepError("a result used supplier overlap as a match reason", { details: r });
    sourceFixId = top.sourceFixRevisionId as string;
    sourceIssueId = top.sourceIssueId as string;
    const src = await getIssue(sourceIssueId);
    sourceFixBefore = ((src.fixes as Json[]) ?? []).find((f) => f.id === sourceFixId) ?? null;
    if (!sourceFixBefore || sourceFixBefore.state !== "verified") throw new StepError("source fix not verified before reuse", { details: sourceFixBefore });
    return `${sourceFixId}: ${(top.matchReasons as string[]).join("; ")}`;
  });
  let fixId = "";
  await step("reuse creates a NEW proposal linked to the source", async () => {
    const r = await call("POST", `/api/issues/${issueId}/fixes`, { idempotencyKey: key(), summary: "Reuse prior bracket fix (acceptance)", steps: [{ order: 1, instruction: "Apply referenced work instruction." }], applicability: { partNumber: S.bracketPartNumber, partRevision: "A", processStepId: S.causalProcessStepId, limitations: [] }, sourceFixRevisionId: sourceFixId || null, workInstructionRef: S.workInstructionRef, evidenceIds: [] });
    const f = expectOk<Json>(r, 201, ["id", "state", "sourceFixRevisionId", "version"]);
    if (f.state !== "proposed" || f.sourceFixRevisionId !== sourceFixId || f.id === sourceFixId) throw new StepError("not a separate proposal", { details: f });
    fixId = f.id as string;
    return `${fixId} <- ${sourceFixId}`;
  });
  await step("original fix content unchanged after reuse (deep compare)", async () => {
    if (!sourceFixBefore) throw new StepError("no before snapshot", {});
    const src = await getIssue(sourceIssueId);
    const after = ((src.fixes as Json[]) ?? []).find((f) => f.id === sourceFixId);
    if (stable(after) !== stable(sourceFixBefore)) throw new StepError("source fix changed", { details: { before: sourceFixBefore, after } });
    if ((src.issue as Json).status !== "closed") throw new StepError("source issue no longer closed", { details: (src.issue as Json).status });
  });

  // ----- Verification-gated closure -----
  const refresh = async () => {
    detail = await getIssue(issueId);
    issueVersion = (detail.issue as Json).version as number;
    return detail.issue as Json;
  };
  await step("premature closure blocked (VERIFICATION_REQUIRED)", async () => {
    await refresh();
    const r = await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "close", expectedVersion: issueVersion, fixRevisionId: fixId });
    if (errCode(r) !== "VERIFICATION_REQUIRED" || r.status !== 409) throw new StepError(`got ${r.status} ${errCode(r)}`, failureOf(r));
  });
  await step("failed verification recorded; issue stays open", async () => {
    expectOk<Json>(await call("POST", `/api/issues/${issueId}/verifications`, { idempotencyKey: key(), fixRevisionId: fixId, outcome: "fail", method: "Gauge check", resultNotes: "Still proud.", evidenceIds: [] }), 201, ["id", "outcome"]);
    const i = await refresh();
    if (i.status === "closed") throw new StepError("closed after failed verification", { details: i.status });
    const r = await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "close", expectedVersion: issueVersion, fixRevisionId: fixId });
    if (errCode(r) !== "VERIFICATION_REQUIRED") throw new StepError(`close after fail gave ${r.status} ${errCode(r)}`, failureOf(r));
    return String(i.status);
  });
  await step("passed verification then closure", async () => {
    expectOk<Json>(await call("POST", `/api/issues/${issueId}/verifications`, { idempotencyKey: key(), fixRevisionId: fixId, outcome: "pass", method: "Gauge check", resultNotes: "Within tolerance.", evidenceIds: [], newEvidence: [{ sourceName: "Gauge sheet", locator: "gauge:1", text: "PASS 0.1 mm" }] }), 201, ["id", "outcome"]);
    await refresh();
    const r = await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "close", expectedVersion: issueVersion, fixRevisionId: fixId, reason: "Verified" });
    const i = expectOk<Json>(r, 200, ["status", "currentFixRevisionId"]);
    if (i.status !== "closed" || i.currentFixRevisionId !== fixId) throw new StepError("not closed on the applied fix", { details: i });
  });
  await step("reopen preserves close event and both verifications", async () => {
    await refresh();
    const r = await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "reopen", expectedVersion: issueVersion, reason: "Recurred" });
    const i = expectOk<Json>(r, 200, ["status"]);
    if (i.status !== "in_progress") throw new StepError(`status ${String(i.status)}`, failureOf(r));
    const d = await getIssue(issueId);
    const audit = (d.audit as Json[]) ?? [];
    const ver = ((d.verifications as Json[]) ?? []).map((v) => v.outcome);
    if (!audit.some((a) => a.toStatus === "closed") || !audit.some((a) => a.fromStatus === "closed") || JSON.stringify(ver) !== JSON.stringify(["fail", "pass"])) throw new StepError("history not preserved", { details: { auditKinds: audit.map((a) => `${String(a.fromStatus)}->${String(a.toStatus)}`), ver } });
    await refresh();
    expectOk<Json>(await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "close", expectedVersion: issueVersion, fixRevisionId: fixId, reason: "Re-closed for acceptance" }), 200, ["status"]);
  });

  // ----- Reuse from a later issue -----
  await step("new verified resolution retrievable from a later issue", async () => {
    const later = expectOk<Json>(await call("POST", "/api/issues", { idempotencyKey: key(), title: "Bracket skew on DEMO-EV-004", description: "Acceptance reuse check", origin: "manual", detectedAt: "2026-09-12T11:00:00Z", reportingTeamId: S.reportingTeamId, assignedTeamId: null, detectionStationId: null, processStepId: null, entityIds: [], partNumber: S.bracketPartNumber, partRevision: "A", linkedSupplierIds: [], defectCode: S.laterDefectCode, severity: "major", evidenceIds: [] }), 201, ["id"]);
    const s = expectOk<Json>(await call("GET", `/api/issues/${later.id as string}/similar-resolutions`), 200, ["results"]);
    const ids = ((s.results as Json[]) ?? []).map((r) => r.sourceFixRevisionId);
    if (!ids.includes(fixId)) throw new StepError(`new fix ${fixId} not retrieved`, { details: ids });
  });

  // ----- Insights -----
  await step("insights: reporter vs confirmed cause; linked supplier excluded; N/A rate", async () => {
    const ins = expectOk<Json>(await call("GET", "/api/insights"), 200, ["teams", "suppliers"]);
    const fi = ((ins.teams as Json[]) ?? []).find((t) => t.teamId === S.reportingTeamId);
    const mfg = ((ins.teams as Json[]) ?? []).find((t) => t.teamId === S.assignedTeamId);
    const sup = ((ins.suppliers as Json[]) ?? []).find((s) => s.supplierId === S.linkedSupplierId);
    const problems: string[] = [];
    if (!fi || !(fi.reportedIssueIds as string[]).includes(issueId) || (fi.confirmedCauseIssueIds as string[]).includes(issueId)) problems.push("Final Inspection attribution");
    if (!mfg || !(mfg.confirmedCauseIssueIds as string[]).includes(issueId)) problems.push("In-house Manufacturing confirmed cause");
    if (!sup || !(sup.linkedIssueIds as string[]).includes(issueId) || (sup.confirmedIssueIds as string[]).includes(issueId)) problems.push("supplier linked-vs-confirmed");
    if (!sup || sup.affectedUnitRate !== null || sup.cohortComplete !== false) problems.push("rate should be null without a complete cohort");
    if (problems.length) throw new StepError(problems.join("; "), { details: { fi, mfg, sup } });
  });

  // ----- Traces: fixture-defined expectations per root, distinct vehicle counting -----
  const traceRuns: Record<string, Json> = {};
  for (const [name, exp] of Object.entries(X.traceRoots)) {
    await step(`trace ${name}: expected vehicles and counts`, async () => {
      const r = await call("POST", `/api/incidents/${X.incidentId}/traces`, { contractVersion: "assembly-quality-v4", revisionId: X.revisionId, root: exp.root, scope: X.scope });
      const run = expectOk<Json>(r, 201, ["runId", "counts", "rows", "executionStatus"]);
      traceRuns[name] = run;
      if (run.executionStatus !== "completed") throw new StepError(`execution ${String(run.executionStatus)}`, { details: run.issues });
      const rows = (run.rows as Json[]) ?? [];
      const vehicles = rows.filter((x) => x.entityKind === "vehicle" && x.currentContainment === true).map((x) => x.entityId as string);
      if (exp.expectedCurrentVehicleIds.length > 0 && vehicles.length === 0) throw new StepError("no affected vehicles returned but fixture expects some", { details: { expected: exp.expectedCurrentVehicleIds } });
      if (!sortedEq(vehicles, exp.expectedCurrentVehicleIds)) throw new StepError("current vehicle ids differ", { details: { expected: exp.expectedCurrentVehicleIds, actual: vehicles } });
      const counts = run.counts as Record<string, number>;
      const badCounts = Object.entries(exp.expectedCounts).filter(([k, v]) => counts[k] !== v);
      if (badCounts.length) throw new StepError("counts differ", { details: { expected: exp.expectedCounts, actual: counts } });
      const comps = rows.filter((x) => x.entityKind === "component").map((x) => x.entityId as string);
      const missingComps = exp.expectedComponentIds.filter((c) => !comps.includes(c));
      if (missingComps.length) throw new StepError(`components missing from rows: ${missingComps.join(", ")}`, { details: comps });
      return `vehicles=${vehicles.join(",")}`;
    });
  }
  await step("two affected components on one vehicle are counted once", async () => {
    const v = X.doubleContainment.vehicleId;
    const problems: string[] = [];
    for (const [name, run] of Object.entries(traceRuns)) {
      const rows = (run.rows as Json[]) ?? [];
      const vehicleRows = rows.filter((x) => x.entityId === v);
      if (vehicleRows.length !== 1) problems.push(`${name}: vehicle ${v} appears ${vehicleRows.length} times`);
      const paths = (run.paths as Json[]) ?? [];
      const intoVehicle = paths.filter((p) => p.toId === v && p.kind === "INSTALLED_IN").length;
      if (intoVehicle < X.doubleContainment.componentsPerRoot) problems.push(`${name}: only ${intoVehicle} installation path(s) into ${v}, expected >= ${X.doubleContainment.componentsPerRoot}`);
      const counts = run.counts as Record<string, number>;
      const distinct = new Set(rows.filter((x) => x.entityKind === "vehicle" && x.currentContainment === true).map((x) => x.entityId)).size;
      if ((counts.currentOnsiteVehicleCount ?? 0) + (counts.currentShippedVehicleCount ?? 0) !== distinct) problems.push(`${name}: counts ${String(counts.currentOnsiteVehicleCount)}+${String(counts.currentShippedVehicleCount)} != distinct vehicles ${distinct}`);
    }
    if (Object.keys(traceRuns).length === 0) throw new StepError("no trace runs to check", {});
    if (problems.length) throw new StepError(problems.join("; "), {});
  });
  await step("trace runs preserved and exportable", async () => {
    for (const run of Object.values(traceRuns)) {
      const again = expectOk<Json>(await call("GET", `/api/traces/${run.runId as string}`), 200, ["runId"]);
      if (stable(again) !== stable(run)) throw new StepError("stored run differs from created run", { details: run.runId });
      const csv = await fetch(`${BASE}/api/traces/${run.runId as string}/export`);
      if (csv.status !== 200 || !(csv.headers.get("content-type") ?? "").includes("text/csv")) throw new StepError(`export ${csv.status}`, {});
    }
  });

  const finalDetail = await getIssue(issueId);
  return finish(mode, realServices, issueId, historyOf(finalDetail), persistence);
}

function finish(mode: string, realServices: boolean, issueId: string, expectedHistory: Json | null, persistence: Json | null): void {
  const passed = results.filter((r) => r.ok).length;
  const report = {
    kind: "http-acceptance",
    base: BASE,
    mode,
    realServices,
    at: new Date().toISOString(),
    expectationsFile: EXPECTATIONS_PATH,
    issueId,
    expectedHistory,
    persistence,
    passed,
    failed: results.length - passed,
    results,
    notes: [
      "HTTP acceptance only; the browser workflow is checked separately (tests/integration/BROWSER_ACCEPTANCE.md).",
      "To prove persistence: restart the server, then run again with --persist-from <this report>.",
      realServices ? "" : "Service double in use: this report is development evidence, not integration evidence.",
    ].filter(Boolean),
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n${passed}/${results.length} passed. Mode: ${mode}. Report: ${OUT}`);
  if (issueId) console.log(`Persistence check: restart the server, then run with --persist-from ${OUT}`);
  process.exit(results.length - passed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("acceptance runner aborted:", e instanceof Error ? e.message : e);
  finish("aborted", false, "", null, null);
});
