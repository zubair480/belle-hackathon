/**
 * RecallRadius acceptance runner (assembly-quality-v4).
 *
 * Drives the REQUIRED ACCEPTANCE EVIDENCE through the HTTP API of a running server and prints a
 * pass/fail table plus a JSON report. It refuses to claim real integration when the server reports
 * service doubles or a stub AI provider unless --allow-double is passed (development only).
 *
 *   npx tsx tests/integration/acceptance-runner.mts --base http://localhost:3000 [--allow-double] [--out report.json]
 *
 * "Restart and retrieve" is proven by running the script twice: the second run passes --issue <id>
 * from the first run's report and checks the issue is still retrievable after a server restart.
 */
import { writeFileSync } from "node:fs";

type Json = Record<string, unknown>;
const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name: string) => args.includes(`--${name}`);
const BASE = (opt("base", "http://localhost:3000") ?? "").replace(/\/$/, "");
const ALLOW_DOUBLE = flag("allow-double");
const OUT = opt("out", "acceptance-report.json");
const PRIOR_ISSUE = opt("issue");

const EV = {
  teams: { finalInspection: "TEAM-FINAL-INSPECTION", inHouse: "TEAM-INHOUSE-MFG" },
  supplier: "SUP-CONNECTOR",
  stations: { finalInspection: "ST-FINAL-INSPECTION", bracketCell: "ST-BRACKET-CELL" },
  steps: { chargePortInstall: "chargeport-install", bracketForming: "bracket-forming" },
  defects: { misalignment: "CONNECTOR_MISALIGNED", bracket: "BRACKET_OUT_OF_TOLERANCE" },
  parts: { module: "CP-MOD-300", bracket: "CP-BRKT-200" },
  entities: { module: "CPM-0005", connector: "CONN-0005", bracket: "BRKT-0005", vehicle: "DEMO-EV-005" },
  trace: {
    supplierRoot: { kind: "supplier_batch", id: "LOT-SUP-01" },
    lotRoot: { kind: "manufacturing_lot", id: "LOT-MFG-01" },
    scope: { siteId: "PLANT-1", configurationAsOf: "2026-09-12T12:00:00Z", historyFrom: "2026-09-01T00:00:00Z", trackedPartNumber: "CP-CONN-100", limitations: ["acceptance run"] },
  },
};

type Result = { step: string; ok: boolean; detail: string };
const results: Result[] = [];
const record = (step: string, ok: boolean, detail = "") => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? `  (${detail})` : ""}`);
};
let n = 0;
const key = () => `acc-${Date.now()}-${++n}`;

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json; text: string }> {
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
const data = <T>(r: { json: Json }): T => {
  if (r.json.ok !== true) throw new Error(JSON.stringify(r.json.error ?? r.json));
  return r.json.data as T;
};
const errCode = (r: { json: Json }) => ((r.json.error as Json | undefined)?.code as string | undefined) ?? "none";

async function main(): Promise<void> {
  const health = data<Json>(await call("GET", "/api/health"));
  const realServices = health.servicesMode === "graph" && health.servicesRegistered === true;
  console.log(`health: services=${String(health.servicesMode)} registered=${String(health.servicesRegistered)} ai=${String(health.aiProvider)} neo4jConfigured=${String(health.neo4jConfigured)}`);
  if (!realServices && !ALLOW_DOUBLE) {
    console.error("Server is not running real graph services. Pass --allow-double for a development dry run; results will be labelled NOT real integration.");
    process.exit(2);
  }
  const label = realServices ? "REAL graph services" : "SERVICE DOUBLE (development dry run, not integration evidence)";
  console.log(`mode: ${label}`);

  // 1. Restart/reload retrieval of a previously created issue (second run).
  if (PRIOR_ISSUE) {
    const r = await call("GET", `/api/issues/${encodeURIComponent(PRIOR_ISSUE)}`);
    record("issue from previous run retrievable after restart", r.json.ok === true, `${PRIOR_ISSUE} status=${String(((r.json.data as Json | undefined)?.issue as Json | undefined)?.status)}`);
  }

  // 2. Manual creation, no AI, no import.
  const created = await call("POST", "/api/issues", {
    idempotencyKey: key(),
    title: "Charge-port connector misaligned on DEMO-EV-005",
    description: "Acceptance run: connector does not seat; found at final inspection.",
    origin: "manual",
    detectedAt: "2026-09-12T10:00:00Z",
    reportingTeamId: EV.teams.finalInspection,
    assignedTeamId: null,
    detectionStationId: EV.stations.finalInspection,
    processStepId: EV.steps.chargePortInstall,
    entityIds: [EV.entities.module, EV.entities.connector, EV.entities.bracket, EV.entities.vehicle],
    partNumber: EV.parts.module,
    partRevision: "A",
    linkedSupplierIds: [EV.supplier],
    defectCode: EV.defects.misalignment,
    severity: "major",
    evidenceIds: [],
    newEvidence: [{ sourceName: "Operator note", locator: "note:1", text: "Connector sits proud; bracket looks skewed." }],
  });
  record("create manual issue (201)", created.status === 201, `status=${created.status}`);
  const issue = data<Json>(created);
  const issueId = issue.id as string;
  const detail = data<Json>(await call("GET", `/api/issues/${issueId}`));
  record("reload issue detail", (detail.issue as Json).id === issueId);

  // 3. Both sourcing paths.
  const ents = (detail.entities as Json[]) ?? [];
  const origin = (id: string) => ((ents.find((e) => e.id === id)?.origin as Json | null | undefined)?.sourcingType as string | undefined) ?? "none";
  record("connector shows supplier origin", origin(EV.entities.connector) === "supplier", origin(EV.entities.connector));
  record("bracket shows in-house origin", origin(EV.entities.bracket) === "in_house", origin(EV.entities.bracket));
  const veh = ents.find((e) => e.id === EV.entities.vehicle)?.vehicle as Json | undefined;
  record("vehicle carries build id with nullable VIN", veh?.buildId === EV.entities.vehicle && veh?.vin === null);

  // 4. Assignment; stale write rejected.
  let cur = data<Json>(await call("PATCH", `/api/issues/${issueId}`, { expectedVersion: issue.version, assignedTeamId: EV.teams.inHouse }));
  const stale = await call("PATCH", `/api/issues/${issueId}`, { expectedVersion: issue.version, title: "stale write" });
  record("stale write rejected (STALE_VERSION)", errCode(stale) === "STALE_VERSION", errCode(stale));
  cur = data<Json>(await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "start_work", expectedVersion: cur.version }));

  // 5. Reviewed attribution: in-house manufacturing cause; reporter unchanged; supplier stays linked only.
  await call("POST", `/api/issues/${issueId}/causes`, { idempotencyKey: key(), state: "hypothesis", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: EV.supplier, causalStationId: null, rationale: "Initial suspicion of connector.", evidenceIds: [] });
  const cause = data<Json>(await call("POST", `/api/issues/${issueId}/causes`, { idempotencyKey: key(), state: "confirmed", causeType: "in_house_manufacturing", responsibleTeamId: EV.teams.inHouse, responsibleSupplierId: null, causalStationId: EV.stations.bracketCell, causalProcessStepId: EV.steps.bracketForming, rationale: "Bracket out of tolerance confirmed by gauge.", evidenceIds: [] }));
  const d2 = data<Json>(await call("GET", `/api/issues/${issueId}`));
  record("confirmed in-house cause is current; reporter still Final Inspection", (d2.issue as Json).confirmedCauseId === cause.id && (d2.issue as Json).reportingTeamId === EV.teams.finalInspection);

  // 6. Prior verified fix retrieved with reasons; reuse creates a separate proposal; original untouched.
  const similar = data<Json>(await call("GET", `/api/issues/${issueId}/similar-resolutions`));
  const top = ((similar.results as Json[]) ?? [])[0];
  record("prior verified fix retrieved with match reasons", Boolean(top) && (top!.matchReasons as string[]).length > 0, top ? `${String(top.sourceFixRevisionId)}: ${(top.matchReasons as string[]).join("; ")}` : "no results");
  const sourceFixId = top?.sourceFixRevisionId as string | undefined;
  const sourceIssueId = top?.sourceIssueId as string | undefined;
  const fix = data<Json>(await call("POST", `/api/issues/${issueId}/fixes`, { idempotencyKey: key(), summary: "Reuse prior bracket fix (acceptance)", steps: [{ order: 1, instruction: "Apply referenced work instruction." }], applicability: { partNumber: EV.parts.bracket, partRevision: "A", processStepId: EV.steps.bracketForming, limitations: [] }, sourceFixRevisionId: sourceFixId ?? null, workInstructionRef: "WI-BRKT-12 rev 2", evidenceIds: [] }));
  record("reused fix is a NEW proposal linked to source", fix.state === "proposed" && fix.sourceFixRevisionId === sourceFixId, `${String(fix.id)} <- ${String(sourceFixId)}`);
  if (sourceIssueId) {
    const src = data<Json>(await call("GET", `/api/issues/${sourceIssueId}`));
    const srcFix = ((src.fixes as Json[]) ?? []).find((f) => f.id === sourceFixId);
    record("original fix untouched (still verified)", srcFix?.state === "verified");
  }

  // 7. Premature closure blocked; failed verification keeps open; passed verification closes.
  cur = (data<Json>(await call("GET", `/api/issues/${issueId}`)).issue as Json);
  const blocked = await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: fix.id });
  record("premature closure blocked (VERIFICATION_REQUIRED)", errCode(blocked) === "VERIFICATION_REQUIRED", errCode(blocked));
  await call("POST", `/api/issues/${issueId}/verifications`, { idempotencyKey: key(), fixRevisionId: fix.id, outcome: "fail", method: "Gauge check", resultNotes: "Still proud.", evidenceIds: [] });
  cur = (data<Json>(await call("GET", `/api/issues/${issueId}`)).issue as Json);
  record("failed verification does not close", cur.status !== "closed", String(cur.status));
  await call("POST", `/api/issues/${issueId}/verifications`, { idempotencyKey: key(), fixRevisionId: fix.id, outcome: "pass", method: "Gauge check", resultNotes: "Within tolerance.", evidenceIds: [] });
  cur = (data<Json>(await call("GET", `/api/issues/${issueId}`)).issue as Json);
  const closed = await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: fix.id, reason: "Verified" });
  record("closed after passed verification", closed.json.ok === true && (closed.json.data as Json).status === "closed", errCode(closed));

  // 8. Reopen preserves history.
  cur = (data<Json>(await call("GET", `/api/issues/${issueId}`)).issue as Json);
  const reopened = data<Json>(await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "reopen", expectedVersion: cur.version, reason: "Recurred" }));
  const d3 = data<Json>(await call("GET", `/api/issues/${issueId}`));
  const audit = (d3.audit as Json[]) ?? [];
  record("reopen keeps close event and verifications", reopened.status === "in_progress" && audit.some((a) => a.toStatus === "closed") && ((d3.verifications as Json[]) ?? []).length === 2);
  cur = reopened;
  await call("POST", `/api/issues/${issueId}/transitions`, { idempotencyKey: key(), action: "close", expectedVersion: cur.version, fixRevisionId: fix.id, reason: "Re-closed for acceptance" });

  // 9. New verified resolution retrievable from another issue.
  const later = data<Json>(await call("POST", "/api/issues", { idempotencyKey: key(), title: "Bracket skew on DEMO-EV-004", description: "Acceptance reuse check", origin: "manual", detectedAt: "2026-09-12T11:00:00Z", reportingTeamId: EV.teams.finalInspection, assignedTeamId: null, detectionStationId: null, processStepId: null, entityIds: [], partNumber: EV.parts.bracket, partRevision: "A", linkedSupplierIds: [], defectCode: EV.defects.bracket, severity: "major", evidenceIds: [] }));
  const laterSimilar = data<Json>(await call("GET", `/api/issues/${later.id as string}/similar-resolutions`));
  record("new resolution retrievable from a later issue", ((laterSimilar.results as Json[]) ?? []).some((r) => r.sourceFixRevisionId === fix.id));

  // 10. Insights: linked supplier excluded from confirmed; N/A without cohort.
  const ins = data<Json>(await call("GET", "/api/insights"));
  const sup = ((ins.suppliers as Json[]) ?? []).find((s) => s.supplierId === EV.supplier);
  record("linked supplier excluded from confirmed-fault count", Boolean(sup) && (sup!.linkedIssueIds as string[]).includes(issueId) && !(sup!.confirmedIssueIds as string[]).includes(issueId));
  record("rate is N/A (null) without complete cohort", Boolean(sup) && sup!.affectedUnitRate === null && sup!.cohortComplete === false);
  const fi = ((ins.teams as Json[]) ?? []).find((t) => t.teamId === EV.teams.finalInspection);
  record("Final Inspection counted as reporter, not confirmed cause", Boolean(fi) && (fi!.reportedIssueIds as string[]).includes(issueId) && !(fi!.confirmedCauseIssueIds as string[]).includes(issueId));

  // 11. Trace both roots; distinct vehicle counting (needs the EV fixture revision from Codey).
  for (const [name, root] of [["supplier lot", EV.trace.supplierRoot], ["manufacturing lot", EV.trace.lotRoot]] as const) {
    const revisionId = opt("revision", "ev-r1");
    const run = await call("POST", `/api/incidents/INC-CHARGEPORT-005/traces`, { contractVersion: "assembly-quality-v4", revisionId, root, scope: EV.trace.scope });
    if (run.json.ok === true) {
      const d = run.json.data as Json;
      const vehicles = ((d.rows as Json[]) ?? []).filter((r) => r.entityKind === "vehicle" && r.currentContainment).map((r) => r.entityId as string);
      const distinct = new Set(vehicles).size === vehicles.length;
      record(`${name} trace runs; vehicles counted once`, distinct, `current vehicles=${vehicles.join(",")} counts=${JSON.stringify(d.counts)}`);
    } else {
      record(`${name} trace runs`, false, `${errCode(run)} (pass --revision <acceptedRevisionId> for the EV fixture)`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const report = { base: BASE, mode: label, realServices, at: new Date().toISOString(), issueId, passed, failed: results.length - passed, results };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n${passed}/${results.length} passed. Mode: ${label}. Report: ${OUT}. Re-run with --issue ${issueId} after a server restart to prove persistence.`);
  process.exit(results.length - passed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("acceptance runner aborted:", e instanceof Error ? e.message : e);
  process.exit(1);
});
