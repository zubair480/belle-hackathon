/**
 * Idempotent, workspace-scoped EV demo seed for Neo4j (assembly-quality-v4).
 *
 *   npm run neo4j:seed
 *
 * Loads: constraints, reference catalog, the synthetic charge-port entities with supplier and
 * in-house provenance (from src/server/application/ev-seed.ts), installations, shipments,
 * evidence, the accepted revision `ev-r1`, a closed prior bracket issue with a verified fix, and
 * a separate confirmed supplier-caused issue. Every statement is MERGE-based; running it twice
 * changes nothing. It never deletes and only touches nodes whose `ws` is the demo workspace.
 * All factory records are synthetic. Credentials come from .env.local / env and are not printed.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import neo4j from "neo4j-driver";
import { EV_DEMO } from "@/contracts/issues";
import { buildEvSeed, EV_LOTS } from "@/server/application/ev-seed";
import { CONSTRAINT_STATEMENTS } from "@/server/graph/schema";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const [, k, raw] = m;
    if (k && process.env[k] === undefined) process.env[k] = (raw ?? "").replace(/^['"]|['"]$/g, "");
  }
}
loadEnvLocal();
const env = process.env;
const uri = env.NEO4J_URI ?? "";
if (!uri || uri.includes("<") || !env.NEO4J_PASSWORD || env.NEO4J_PASSWORD.includes("<")) {
  console.error("NEO4J_* not configured; seed aborted.");
  process.exit(2);
}
const ws = env.RECALL_WORKSPACE_ID ?? EV_DEMO.workspaceId;
const database = env.NEO4J_DATABASE && !env.NEO4J_DATABASE.includes("<") ? env.NEO4J_DATABASE : "neo4j";
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

const driver = neo4j.driver(uri, neo4j.auth.basic(env.NEO4J_USERNAME ?? "neo4j", env.NEO4J_PASSWORD), { disableLosslessIntegers: true });
const session = driver.session({ database });
const run = (q: string, p: Record<string, unknown> = {}) => session.run(q, { ws, ...p });

try {
  for (const stmt of CONSTRAINT_STATEMENTS) await run(stmt);
  console.log(`constraints ensured (${CONSTRAINT_STATEMENTS.length}); workspace=${ws} database=${database}`);

  // ----- catalog -----
  const cat = async (label: string, items: Array<Record<string, unknown>>) => {
    for (const it of items) await run(`MERGE (n:${label} {ws: $ws, id: $id}) SET n += $p`, { id: it.id, p: { active: true, ...it } });
  };
  await cat("Site", [{ id: EV_DEMO.siteId, name: "Demo EV Plant 1" }]);
  await cat("Team", [
    { id: EV_DEMO.teams.finalInspection, name: "Final Inspection" },
    { id: EV_DEMO.teams.inHouseManufacturing, name: "In-house Manufacturing" },
    { id: EV_DEMO.teams.assembly, name: "Charge-port Assembly" },
    { id: EV_DEMO.teams.supplierQuality, name: "Supplier Quality" },
    { id: EV_DEMO.teams.incomingQuality, name: "Incoming Quality" },
  ]);
  await cat("Supplier", [{ id: EV_DEMO.suppliers.connector, name: "Demo Connector Supplier (fictional)" }]);
  await cat("Station", [
    { id: EV_DEMO.stations.finalInspection, name: "Final inspection", siteId: EV_DEMO.siteId, areaLabel: "Final line" },
    { id: EV_DEMO.stations.chargePortAssembly, name: "Charge-port module assembly", siteId: EV_DEMO.siteId, areaLabel: "Subassembly" },
    { id: EV_DEMO.stations.bracketCell, name: "Bracket forming cell", siteId: EV_DEMO.siteId, areaLabel: "In-house manufacturing" },
  ]);
  await cat("ProcessStep", [
    { id: EV_DEMO.processSteps.chargePortInstall, name: "Charge-port module install", areaLabel: "Final assembly" },
    { id: EV_DEMO.processSteps.bracketForming, name: "Bracket forming", areaLabel: "In-house manufacturing" },
    { id: EV_DEMO.processSteps.finalInspection, name: "Final inspection", areaLabel: "Final line" },
  ]);
  await cat("DefectCode", [
    { id: EV_DEMO.defectCodes.misalignment, name: "Connector misaligned", family: "Fit and alignment" },
    { id: EV_DEMO.defectCodes.bracketDimension, name: "Bracket out of tolerance", family: "Dimensional" },
    { id: "CONNECTOR_DEFECT", name: "Connector defect (supplied part)", family: "Supplied component" },
  ]);
  await cat("Customer", [{ id: "CUST-DEALER-1", name: "Demo Dealer 1 (synthetic)" }]);

  // ----- lots -----
  await run("MERGE (l:SupplierLot {ws: $ws, id: $id}) SET l.code = $code, l.partNumber = $pn, l.supplierId = $sup WITH l MATCH (s:Supplier {ws: $ws, id: $sup}) MERGE (l)-[:SUPPLIED_BY]->(s)", { id: EV_LOTS.supplier.id, code: EV_LOTS.supplier.code, pn: EV_LOTS.supplier.partNumber, sup: EV_LOTS.supplier.supplierId });
  await run("MERGE (l:MfgLot {ws: $ws, id: $id}) SET l.code = $code, l.partNumber = $pn, l.workOrderId = $wo, l.teamId = $team, l.processStepId = $step, l.siteId = $site WITH l MATCH (t:Team {ws: $ws, id: $team}) MERGE (l)-[:MADE_BY]->(t)", { id: EV_LOTS.manufacturing.id, code: EV_LOTS.manufacturing.code, pn: EV_LOTS.manufacturing.partNumber, wo: EV_LOTS.manufacturing.workOrderId, team: EV_LOTS.manufacturing.teamId, step: EV_LOTS.manufacturing.processStepId, site: EV_DEMO.siteId });
  await run("MERGE (l:MfgLot {ws: $ws, id: 'LOT-MFG-02'}) SET l.code = 'DEMO-MFG-LOT-02', l.partNumber = $pn, l.workOrderId = 'WO-DEMO-0002', l.teamId = $team, l.processStepId = $step, l.siteId = $site WITH l MATCH (t:Team {ws: $ws, id: $team}) MERGE (l)-[:MADE_BY]->(t)", { pn: EV_DEMO.parts.module, team: EV_DEMO.teams.assembly, step: EV_DEMO.processSteps.chargePortInstall, site: EV_DEMO.siteId });

  // ----- entities, origins, installations, shipments, evidence -----
  const seed = buildEvSeed();
  for (const [id, ev] of Object.entries(seed.evidenceTexts)) {
    await run("MERGE (e:Evidence {ws: $ws, id: $id}) SET e.sourceName = $sourceName, e.locator = $locator, e.text = $text, e.sourceHash = $hash, e.sourceKind = 'synthetic', e.sourceRecordId = null, e.sourceUrl = null, e.retrievedAt = null", { id, sourceName: ev.sourceName, locator: ev.locator, text: ev.text, hash: sha256(ev.text) });
  }
  for (const e of seed.entities) {
    await run("MERGE (n:Entity {ws: $ws, id: $id}) SET n += $p", { id: e.id, p: { kind: e.kind, partNumber: e.partNumber, partRevision: e.partRevision, serialNumber: e.serialNumber, displayCode: e.displayCode, issuerId: e.issuerId, locationState: e.locationState, buildId: e.vehicle?.buildId ?? null, vin: e.vehicle?.vin ?? null } });
    if (e.origin) {
      const o = e.origin;
      await run(
        `MERGE (o:Origin {ws: $ws, id: $oid}) SET o += $p
         WITH o MATCH (n:Entity {ws: $ws, id: $eid}) MERGE (n)-[:HAS_ORIGIN]->(o)
         WITH o FOREACH (_ IN CASE WHEN $sourcing = 'supplier' THEN [1] ELSE [] END | MERGE (l:SupplierLot {ws: $ws, id: $lot}) MERGE (o)-[:FROM_SUPPLIER_LOT]->(l))
         FOREACH (_ IN CASE WHEN $sourcing = 'in_house' THEN [1] ELSE [] END | MERGE (m:MfgLot {ws: $ws, id: $lot}) MERGE (o)-[:PRODUCED_IN]->(m))`,
        { oid: o.id, eid: e.id, sourcing: o.sourcingType, lot: o.productionLotId, p: { sourcingType: o.sourcingType, producerOrganizationId: o.producerOrganizationId, partNumber: o.partNumber, partRevision: o.partRevision, productionLotId: o.productionLotId, supplierId: o.supplierId, supplierBatchCode: o.supplierBatchCode, siteId: o.siteId, manufacturingLotCode: o.manufacturingLotCode, workOrderId: o.workOrderId, manufacturingTeamId: o.manufacturingTeamId, processStepId: o.processStepId, evidenceIds: o.evidenceIds } },
      );
    }
  }
  for (const i of seed.installations) {
    await run("MATCH (c:Entity {ws: $ws, id: $child}) MATCH (p:Entity {ws: $ws, id: $parent}) MERGE (c)-[r:INSTALLED_IN {id: $id}]->(p) SET r.slotId = $slot, r.installedAt = $installedAt, r.removedAt = $removedAt, r.recordedAt = $recordedAt, r.evidenceIds = $ev", { child: i.childId, parent: i.parentId, id: i.id, slot: i.slotId, installedAt: i.installedAt, removedAt: i.removedAt, recordedAt: i.recordedAt, ev: i.evidenceIds });
  }
  for (const s of seed.shipments) {
    await run("MATCH (v:Entity {ws: $ws, id: $unit}) MATCH (c:Customer {ws: $ws, id: $cust}) MERGE (v)-[r:SHIPPED_TO {id: $id}]->(c) SET r.shippedAt = $at", { unit: s.unitId, cust: s.customerId, id: s.id, at: s.shippedAt });
  }
  await run("MERGE (r:Revision {ws: $ws, id: 'ev-r1'}) ON CREATE SET r.acceptedAt = '2026-09-12T08:00:00Z', r.dataHash = $hash, r.sequence = 1, r.source = 'seed'", { hash: sha256("ev-seed-v1") });

  // ----- prior closed bracket issue with a verified fix (reusable knowledge) -----
  const ev = async (id: string, sourceName: string, locator: string, text: string) => run("MERGE (e:Evidence {ws: $ws, id: $id}) SET e.sourceName = $sourceName, e.locator = $locator, e.text = $text, e.sourceHash = $hash, e.sourceKind = 'synthetic', e.sourceRecordId = null, e.sourceUrl = null, e.retrievedAt = null", { id, sourceName, locator, text, hash: sha256(text) });
  await ev("EVID-BRKT-PRIOR-OBS", "Synthetic inspection note", "note:1", "Bracket BRKT-0002 measured out of tolerance at final inspection; connector could not seat.");
  await ev("EVID-BRKT-PRIOR-CAUSE", "Synthetic cell inspection", "note:2", "Forming die offset found in bracket cell; lot DEMO-MFG-LOT-01 affected.");
  await ev("EVID-BRKT-PRIOR-FIX", "Synthetic work instruction reference", "WI-BRKT-12 rev 2", "Placeholder work instruction WI-BRKT-12 rev 2: re-set die, rework bracket, re-inspect.");
  await ev("EVID-BRKT-PRIOR-VERIFY", "Synthetic verification record", "gauge:1", "Fixture result PASS on re-inspection. No real hardware was inspected.");
  await ev("EVID-CONN-SUPPLIER", "Synthetic incoming inspection", "note:3", "Connector CONN-0003 latch cracked on receipt; supplier notified.");

  const prior = {
    id: EV_DEMO.priorIssueId, version: 6, status: "closed", title: "Bracket out of tolerance on DEMO-EV-002", description: "Charge-port bracket did not meet dimension; connector would not seat.",
    origin: "manual", detectedAt: "2026-09-06T14:00:00Z", reportingTeamId: EV_DEMO.teams.finalInspection, assignedTeamId: EV_DEMO.teams.inHouseManufacturing,
    detectionStationId: EV_DEMO.stations.finalInspection, processStepId: EV_DEMO.processSteps.bracketForming, entityIds: ["BRKT-0002", "CPM-0002", "DEMO-EV-002"],
    partNumber: EV_DEMO.parts.bracket, partRevision: "A", linkedSupplierIds: [] as string[], defectCode: EV_DEMO.defectCodes.bracketDimension, severity: "major", evidenceIds: ["EVID-BRKT-PRIOR-OBS"],
    createdBy: "demo-operator", createdAt: "2026-09-06T14:05:00Z", updatedAt: "2026-09-08T16:00:00Z", confirmedCauseId: "CAUSE-BRKT-PRIOR", currentFixRevisionId: EV_DEMO.priorVerifiedFixId,
  };
  const supplierIssue = {
    id: "ISS-CONN-SUPPLIER", version: 3, status: "in_progress", title: "Cracked connector latch on CONN-0003", description: "Latch cracked at incoming inspection.", origin: "manual",
    detectedAt: "2026-09-04T09:00:00Z", reportingTeamId: EV_DEMO.teams.incomingQuality, assignedTeamId: EV_DEMO.teams.supplierQuality, detectionStationId: null, processStepId: null,
    entityIds: ["CONN-0003"], partNumber: EV_DEMO.parts.connector, partRevision: "A", linkedSupplierIds: [EV_DEMO.suppliers.connector], defectCode: "CONNECTOR_DEFECT", severity: "major",
    evidenceIds: ["EVID-CONN-SUPPLIER"], createdBy: "demo-inspector", createdAt: "2026-09-04T09:10:00Z", updatedAt: "2026-09-05T10:00:00Z", confirmedCauseId: "CAUSE-CONN-SUPPLIER", currentFixRevisionId: null,
  };
  for (const issue of [prior, supplierIssue]) {
    await run(
      `MERGE (i:Issue {ws: $ws, id: $id}) ON CREATE SET i += $p
       WITH i
       OPTIONAL MATCH (i)-[r:REPORTED_BY|ASSIGNED_TO|DETECTED_AT|AT_STEP|AFFECTS|LINKS_SUPPLIER|HAS_DEFECT|HAS_EVIDENCE]->() DELETE r
       WITH i
       MATCH (t:Team {ws: $ws, id: $p.reportingTeamId}) MERGE (i)-[:REPORTED_BY]->(t)
       WITH i
       FOREACH (_ IN CASE WHEN $p.assignedTeamId IS NULL THEN [] ELSE [1] END | MERGE (a:Team {ws: $ws, id: $p.assignedTeamId}) MERGE (i)-[:ASSIGNED_TO]->(a))
       FOREACH (_ IN CASE WHEN $p.detectionStationId IS NULL THEN [] ELSE [1] END | MERGE (s:Station {ws: $ws, id: $p.detectionStationId}) MERGE (i)-[:DETECTED_AT]->(s))
       FOREACH (_ IN CASE WHEN $p.processStepId IS NULL THEN [] ELSE [1] END | MERGE (ps:ProcessStep {ws: $ws, id: $p.processStepId}) MERGE (i)-[:AT_STEP]->(ps))
       FOREACH (_ IN CASE WHEN $p.defectCode IS NULL THEN [] ELSE [1] END | MERGE (d:DefectCode {ws: $ws, id: $p.defectCode}) MERGE (i)-[:HAS_DEFECT]->(d))
       FOREACH (eid IN $p.entityIds | MERGE (e:Entity {ws: $ws, id: eid}) MERGE (i)-[:AFFECTS]->(e))
       FOREACH (sid IN $p.linkedSupplierIds | MERGE (s:Supplier {ws: $ws, id: sid}) MERGE (i)-[:LINKS_SUPPLIER]->(s))
       FOREACH (vid IN $p.evidenceIds | MERGE (v:Evidence {ws: $ws, id: vid}) MERGE (i)-[:HAS_EVIDENCE]->(v))`,
      { id: issue.id, p: issue },
    );
  }
  const cause = async (c: Record<string, unknown>) =>
    run(
      `MATCH (i:Issue {ws: $ws, id: $p.issueId}) MERGE (c:Cause {ws: $ws, id: $p.id}) ON CREATE SET c += $p MERGE (c)-[:ASSESSES]->(i)
       WITH c
       FOREACH (_ IN CASE WHEN $p.responsibleTeamId IS NULL THEN [] ELSE [1] END | MERGE (t:Team {ws: $ws, id: $p.responsibleTeamId}) MERGE (c)-[:RESPONSIBLE_TEAM]->(t))
       FOREACH (_ IN CASE WHEN $p.responsibleSupplierId IS NULL THEN [] ELSE [1] END | MERGE (s:Supplier {ws: $ws, id: $p.responsibleSupplierId}) MERGE (c)-[:RESPONSIBLE_SUPPLIER]->(s))
       FOREACH (_ IN CASE WHEN $p.causalStationId IS NULL THEN [] ELSE [1] END | MERGE (s:Station {ws: $ws, id: $p.causalStationId}) MERGE (c)-[:CAUSAL_STATION]->(s))
       FOREACH (_ IN CASE WHEN $p.causalProcessStepId IS NULL THEN [] ELSE [1] END | MERGE (ps:ProcessStep {ws: $ws, id: $p.causalProcessStepId}) MERGE (c)-[:CAUSAL_STEP]->(ps))
       FOREACH (vid IN $p.evidenceIds | MERGE (v:Evidence {ws: $ws, id: vid}) MERGE (c)-[:HAS_EVIDENCE]->(v))`,
      { p: c },
    );
  await cause({ id: "CAUSE-BRKT-PRIOR", issueId: prior.id, state: "confirmed", causeType: "in_house_manufacturing", responsibleTeamId: EV_DEMO.teams.inHouseManufacturing, responsibleSupplierId: null, causalStationId: EV_DEMO.stations.bracketCell, causalProcessStepId: EV_DEMO.processSteps.bracketForming, rationale: "Forming die offset confirmed by cell inspection.", evidenceIds: ["EVID-BRKT-PRIOR-CAUSE"], supersedesId: null, assessedBy: "demo-quality-reviewer", assessedAt: "2026-09-07T10:00:00Z", isCurrent: true });
  await cause({ id: "CAUSE-CONN-SUPPLIER", issueId: supplierIssue.id, state: "confirmed", causeType: "supplier_component", responsibleTeamId: null, responsibleSupplierId: EV_DEMO.suppliers.connector, causalStationId: null, causalProcessStepId: null, rationale: "Supplier confirmed moulding defect in batch.", evidenceIds: ["EVID-CONN-SUPPLIER"], supersedesId: null, assessedBy: "demo-supplier-quality", assessedAt: "2026-09-05T10:00:00Z", isCurrent: true });
  await run(
    `MATCH (i:Issue {ws: $ws, id: $issueId}) MERGE (f:Fix {ws: $ws, id: $id}) ON CREATE SET f += $p MERGE (f)-[:FIXES]->(i)
     WITH f FOREACH (vid IN $p.evidenceIds | MERGE (v:Evidence {ws: $ws, id: vid}) MERGE (f)-[:HAS_EVIDENCE]->(v))`,
    { issueId: prior.id, id: EV_DEMO.priorVerifiedFixId, p: { issueId: prior.id, version: 1, summary: "Re-set forming die per WI-BRKT-12 rev 2 and rework bracket", stepsJson: JSON.stringify([{ order: 1, instruction: "Confirm WI-BRKT-12 rev 2 applies to bracket revision A." }, { order: 2, instruction: "Re-set die, rework affected brackets, document execution." }, { order: 3, instruction: "Re-inspect to gauge and record evidence." }]), applicabilityJson: JSON.stringify({ partNumber: EV_DEMO.parts.bracket, partRevision: "A", processStepId: EV_DEMO.processSteps.bracketForming, limitations: ["Synthetic placeholder; not a real procedure"] }), sourceFixRevisionId: null, workInstructionRef: "WI-BRKT-12 rev 2", evidenceIds: ["EVID-BRKT-PRIOR-FIX"], state: "verified", createdBy: "demo-engineer", createdAt: "2026-09-07T12:00:00Z", appliedAt: "2026-09-08T09:00:00Z" } },
  );
  await run(
    `MATCH (f:Fix {ws: $ws, id: $fixId}) MATCH (i:Issue {ws: $ws, id: $issueId}) MERGE (v:Verification {ws: $ws, id: $id}) ON CREATE SET v += $p MERGE (v)-[:VERIFIES]->(f) MERGE (v)-[:OF_ISSUE]->(i)
     WITH v FOREACH (vid IN $p.evidenceIds | MERGE (e:Evidence {ws: $ws, id: vid}) MERGE (v)-[:HAS_EVIDENCE]->(e))`,
    { fixId: EV_DEMO.priorVerifiedFixId, issueId: prior.id, id: "VERIFY-BRKT-PRIOR", p: { issueId: prior.id, fixRevisionId: EV_DEMO.priorVerifiedFixId, outcome: "pass", method: "Gauge re-inspection (synthetic)", resultNotes: "PASS", evidenceIds: ["EVID-BRKT-PRIOR-VERIFY"], verifiedBy: "demo-quality-reviewer", verifiedAt: "2026-09-08T15:00:00Z" } },
  );
  const auditRow = async (a: Record<string, unknown>) => run("MATCH (i:Issue {ws: $ws, id: $p.issueId}) MERGE (a:Audit {ws: $ws, id: $p.id}) ON CREATE SET a += $p MERGE (a)-[:AUDITS]->(i)", { p: a });
  await auditRow({ id: "AUD-PRIOR-1", issueId: prior.id, kind: "created", actorId: "demo-operator", at: prior.createdAt, fromStatus: null, toStatus: "open", summary: "Issue created", subjectId: null, seq: 1 });
  await auditRow({ id: "AUD-PRIOR-2", issueId: prior.id, kind: "transition", actorId: "demo-quality-reviewer", at: prior.updatedAt, fromStatus: "pending_verification", toStatus: "closed", summary: "Closed after passed verification VERIFY-BRKT-PRIOR", subjectId: "VERIFY-BRKT-PRIOR", seq: 2 });
  await auditRow({ id: "AUD-SUP-1", issueId: supplierIssue.id, kind: "created", actorId: "demo-inspector", at: supplierIssue.createdAt, fromStatus: null, toStatus: "open", summary: "Issue created", subjectId: null, seq: 1 });

  const counts = await run("MATCH (n) WHERE n.ws = $ws RETURN labels(n)[0] AS label, count(n) AS c ORDER BY label");
  console.log("seeded (idempotent):", counts.records.map((r) => `${String(r.get("label"))}=${String(r.get("c"))}`).join(" "));
  process.exitCode = 0;
} catch (e) {
  console.error("seed failed:", e instanceof Error ? e.message.replace(env.NEO4J_PASSWORD ?? "", "<redacted>") : String(e));
  process.exitCode = 1;
} finally {
  await session.close();
  await driver.close();
}
