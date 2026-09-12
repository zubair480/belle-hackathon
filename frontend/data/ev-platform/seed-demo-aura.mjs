/**
 * Demo records for the sketched vehicles, in Zubair's graph model (workspace-scoped, idempotent).
 *
 *   node frontend/data/ev-platform/seed-demo-aura.mjs            # app must be running (catalog + issues go through the API)
 *   RECALL_APP_BASE_URL=http://localhost:3000                      # default
 *
 * Phase 1 (API): catalog items the design data references (suppliers, teams, stations, process steps,
 *   defect codes) via POST /api/catalog/:kind.
 * Phase 2 (Cypher): for every vehicle in seed.json and every design slot except the charge-port trio
 *   (already seeded by scripts/neo4j/seed-ev.mts), MERGE Supplier / SupplierLot / MfgLot / Entity / Origin
 *   and INSTALLED_IN relationships with the same labels and properties as seed-ev.mts, so Zubair's
 *   graphServices read them unchanged. Never deletes; only touches nodes with ws = RECALL_WORKSPACE_ID.
 * Phase 3 (API): the non-charge-port issues from seed.json and their cause hypotheses via POST /api/issues
 *   and /api/issues/:id/causes (idempotency keys seed-<id>), so audits and versions are the server's.
 *
 * All identifiers are fictional. Credentials come from .env.local / env and are never printed.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";

const here = dirname(fileURLToPath(import.meta.url));
(function loadEnvLocal() {
  const f = join(process.cwd(), ".env.local");
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
})();

const parts = JSON.parse(readFileSync(join(here, "parts.json"), "utf8"));
const seed = JSON.parse(readFileSync(join(here, "seed.json"), "utf8"));
const base = process.env.RECALL_APP_BASE_URL ?? "http://localhost:3000";
const ws = process.env.RECALL_WORKSPACE_ID ?? seed.workspaceId ?? "synthetic-ev-assembler";
const SKIP_SLOTS = new Set(["charge-port-module", "charge-connector", "charge-bracket"]);

const NAMES = {
  suppliers: { "SUP-CONNECTOR": "Demo Connector Supplier (fictional)", "SUP-CELLS": "Demo Cell Supplier", "SUP-LAMP": "Demo Lighting Supplier", "SUP-WHEEL": "Demo Wheel and Tire Supplier", "SUP-HARNESS": "Demo Harness Supplier", "SUP-GLASS": "Demo Glazing Supplier", "SUP-POWER": "Demo Power Electronics Supplier", "SUP-ELEC": "Demo Electronics Supplier", "SUP-BATT12": "Demo 12 V Battery Supplier", "SUP-INTERIOR": "Demo Interior Supplier", "SUP-STEER": "Demo Steering Supplier", "SUP-SEATS": "Demo Seat Supplier", "SUP-MIRROR": "Demo Mirror Supplier", "SUP-PLASTICS": "Demo Plastics Supplier", "SUP-THERMAL": "Demo Thermal Supplier" },
  teams: { "TEAM-BODY": "Body Shop", "TEAM-BATTERY": "Battery and Drive Unit Assembly", "TEAM-ELECTRONICS": "Electronics and Software", "TEAM-QUALITY-ENG": "Quality Engineering" },
  stations: { "ST-INCOMING": ["Incoming Inspection", "Receiving"], "ST-BATTERY-MARRIAGE": ["Battery Marriage", "Chassis line"], "ST-BODY-SHOP": ["Body Shop", "Body"], "ST-ELECTRICAL-EOL": ["Electrical End-of-line Test", "End of line"], "ST-WHEEL-FIT": ["Wheel Fitment", "Chassis line"] },
  processSteps: { "incoming-inspection": ["Incoming inspection", "Receiving"], "battery-pack-assembly": ["Battery pack assembly", "Battery shop"], "battery-marriage": ["Battery marriage", "Chassis line"], "door-stamping": ["Door and closure stamping", "Body"], "drive-unit-assembly": ["Drive unit assembly", "Powertrain"], "hv-box-assembly": ["HV junction box assembly", "Battery shop"], "controller-flash": ["Controller assembly and flash", "Electronics"], "ip-subassembly": ["Instrument panel subassembly", "Trim line"], "final-assembly": ["Final assembly", "Trim line"], "electrical-eol": ["Electrical end-of-line test", "End of line"], "wheel-fitment": ["Wheel fitment", "Chassis line"] },
  defectCodes: { CONNECTOR_PIN_DAMAGE: ["Connector pin damage", "Charge port"], LAMP_CONDENSATION: ["Headlamp condensation", "Lighting"], DOOR_GAP: ["Door gap out of spec", "Body fit"], DOOR_SEAL_NOISE: ["Door seal wind noise", "Body fit"], BATTERY_FASTENER_TORQUE: ["Battery fastener torque", "HV battery"], NO_WAKE_ON_START: ["No wake on start button", "Electrical"], TPMS_FAULT: ["Tire pressure sensor fault", "Chassis"], ...Object.fromEntries(seed.extraDefectCodes.map((d) => [d.id, [d.name, d.family]])) },
};

async function api(method, path, body, idem) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(idem ? { "idempotency-key": idem } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({ ok: false, error: { code: "NETWORK", message: `HTTP ${res.status}` } }));
  return { status: res.status, ...json };
}

// ---------- phase 1: catalog ----------
const health = await api("GET", "/api/health");
if (!health.ok) throw new Error(`App not reachable at ${base}: ${health.error?.message ?? health.status}`);
console.log(`app: services=${health.data.servicesMode} registered=${health.data.servicesRegistered} neo4j=${health.data.neo4jConfigured}`);
const catalog = (await api("GET", "/api/catalog")).data;
const have = (kind) => new Set((catalog?.[kind] ?? []).map((x) => x.id));
let upserts = 0;
for (const [id, name] of Object.entries(NAMES.suppliers)) if (!have("suppliers").has(id)) { await api("POST", "/api/catalog/suppliers", { id, name, active: true }); upserts++; }
for (const [id, name] of Object.entries(NAMES.teams)) if (!have("teams").has(id)) { await api("POST", "/api/catalog/teams", { id, name, active: true }); upserts++; }
for (const [id, [name, areaLabel]] of Object.entries(NAMES.stations)) if (!have("stations").has(id)) { await api("POST", "/api/catalog/stations", { id, name, active: true, siteId: "PLANT-1", areaLabel }); upserts++; }
for (const [id, [name, areaLabel]] of Object.entries(NAMES.processSteps)) if (!have("processSteps").has(id)) { await api("POST", "/api/catalog/processSteps", { id, name, active: true, areaLabel }); upserts++; }
for (const [id, [name, family]] of Object.entries(NAMES.defectCodes)) if (!have("defectCodes").has(id)) { await api("POST", "/api/catalog/defectCodes", { id, name, active: true, family }); upserts++; }
console.log(`phase 1 catalog: ${upserts} item(s) added`);

// ---------- phase 2: records ----------
const uri = process.env.NEO4J_URI ?? "";
if (!uri || uri.includes("<")) throw new Error("NEO4J_* not configured");
const driver = neo4j.driver(uri, neo4j.auth.basic(process.env.NEO4J_USERNAME ?? "neo4j", process.env.NEO4J_PASSWORD ?? ""), { disableLosslessIntegers: true });
const session = driver.session({ database: process.env.NEO4J_DATABASE && !process.env.NEO4J_DATABASE.includes("<") ? process.env.NEO4J_DATABASE : "neo4j" });
const run = (q, p = {}) => session.run(q, { ws, ...p });
const entityIdFor = (slot, suffix) => `${slot.prefix}-${suffix}${slot.sideSuffix ? `-${slot.sideSuffix}` : ""}`;
const slotById = Object.fromEntries(parts.parts.map((p) => [p.slot, p]));
let entities = 0, installs = 0;
try {
  for (const [id, name] of Object.entries(NAMES.suppliers)) await run("MERGE (s:Supplier {ws: $ws, id: $id}) ON CREATE SET s.name = $name, s.active = true", { id, name });
  for (const [id, name] of Object.entries(NAMES.teams)) await run("MERGE (t:Team {ws: $ws, id: $id}) ON CREATE SET t.name = $name, t.active = true", { id, name });
  for (const v of seed.vehicles) {
    await run("MERGE (n:Entity {ws: $ws, id: $id}) ON CREATE SET n += $p", { id: v.buildId, p: { kind: "vehicle", partNumber: "EV-PLATFORM-1", partRevision: null, serialNumber: v.buildId, displayCode: `Build ${v.buildId}`, issuerId: null, locationState: v.locationState, buildId: v.buildId, vin: null } });
    const installedAt = `${v.builtDay}T08:00:00Z`;
    const recordedAt = `${v.builtDay}T08:05:00Z`;
    for (const slot of parts.parts) {
      if (SKIP_SLOTS.has(slot.slot)) continue;
      const id = entityIdFor(slot, v.suffix);
      const unknown = (v.unknownOrigin ?? []).includes(slot.slot);
      const sourcing = unknown ? "unknown" : slot.sourcing;
      await run("MERGE (n:Entity {ws: $ws, id: $id}) SET n += $p", { id, p: { kind: slot.kind, partNumber: slot.partNumber, partRevision: slot.partRevision ?? null, serialNumber: id, displayCode: `${slot.partNumber} / ${id}`, issuerId: sourcing === "supplier" ? slot.supplierId : sourcing === "in_house" ? "PLANT-1" : "UNKNOWN", locationState: "installed", buildId: null, vin: null } });
      entities++;
      if (sourcing === "supplier") {
        const lot = `LOT-${slot.supplierBatchCode}`;
        await run("MERGE (l:SupplierLot {ws: $ws, id: $id}) SET l.code = $code, l.partNumber = $pn, l.supplierId = $sup WITH l MATCH (s:Supplier {ws: $ws, id: $sup}) MERGE (l)-[:SUPPLIED_BY]->(s)", { id: lot, code: slot.supplierBatchCode, pn: slot.partNumber, sup: slot.supplierId });
        await run(
          `MERGE (o:Origin {ws: $ws, id: $oid}) SET o += $p WITH o MATCH (n:Entity {ws: $ws, id: $eid}) MERGE (n)-[:HAS_ORIGIN]->(o) WITH o MATCH (l:SupplierLot {ws: $ws, id: $lot}) MERGE (o)-[:FROM_SUPPLIER_LOT]->(l)`,
          { oid: `ORIGIN-${id}`, eid: id, lot, p: { sourcingType: "supplier", producerOrganizationId: slot.supplierId, partNumber: slot.partNumber, partRevision: slot.partRevision ?? null, productionLotId: lot, supplierId: slot.supplierId, supplierBatchCode: slot.supplierBatchCode, siteId: null, manufacturingLotCode: null, workOrderId: null, manufacturingTeamId: null, processStepId: null, evidenceIds: [] } },
        );
      } else if (sourcing === "in_house") {
        const lot = `LOT-${slot.manufacturingLotCode}`;
        await run("MERGE (l:MfgLot {ws: $ws, id: $id}) SET l.code = $code, l.partNumber = $pn, l.workOrderId = $wo, l.teamId = $team, l.processStepId = $step, l.siteId = 'PLANT-1' WITH l MATCH (t:Team {ws: $ws, id: $team}) MERGE (l)-[:MADE_BY]->(t)", { id: lot, code: slot.manufacturingLotCode, pn: slot.partNumber, wo: slot.workOrderId ?? null, team: slot.manufacturingTeamId, step: slot.processStepId ?? null });
        await run(
          `MERGE (o:Origin {ws: $ws, id: $oid}) SET o += $p WITH o MATCH (n:Entity {ws: $ws, id: $eid}) MERGE (n)-[:HAS_ORIGIN]->(o) WITH o MATCH (m:MfgLot {ws: $ws, id: $lot}) MERGE (o)-[:PRODUCED_IN]->(m)`,
          { oid: `ORIGIN-${id}`, eid: id, lot, p: { sourcingType: "in_house", producerOrganizationId: null, partNumber: slot.partNumber, partRevision: slot.partRevision ?? null, productionLotId: lot, supplierId: null, supplierBatchCode: null, siteId: "PLANT-1", manufacturingLotCode: slot.manufacturingLotCode, workOrderId: slot.workOrderId ?? null, manufacturingTeamId: slot.manufacturingTeamId, processStepId: slot.processStepId ?? null, evidenceIds: [] } },
        );
      }
      const parent = slot.parent && slotById[slot.parent] ? entityIdFor(slotById[slot.parent], v.suffix) : v.buildId;
      await run("MATCH (c:Entity {ws: $ws, id: $child}) MATCH (p:Entity {ws: $ws, id: $parent}) MERGE (c)-[r:INSTALLED_IN {id: $id}]->(p) SET r.slotId = $slot, r.installedAt = $installedAt, r.removedAt = null, r.recordedAt = $recordedAt, r.evidenceIds = []", { child: id, parent, id: `INST-${id}`, slot: slot.slot, installedAt, recordedAt });
      installs++;
    }
  }
  // Customers (distributors) and shipments: only for vehicles the graph already marks as shipped but
  // without a recorded customer (Zubair's seed ships 002/003 to CUST-DEALER-1; that stays as is).
  for (const c of seed.customers) await run("MERGE (c:Customer {ws: $ws, id: $id}) ON CREATE SET c.name = $name, c.kind = $kind, c.active = true", { id: c.id, name: c.name, kind: c.kind });
  let shipped = 0;
  for (const sh of seed.shipments) {
    const r = await run("MATCH (v:Entity {ws: $ws, id: $vid}) OPTIONAL MATCH (v)-[s:SHIPPED_TO]->() RETURN v.locationState AS state, count(s) AS n", { vid: sh.vehicleId });
    const rec = r.records[0];
    if (!rec || rec.get("state") !== "shipped" || rec.get("n") > 0) continue;
    await run("MATCH (v:Entity {ws: $ws, id: $vid}) MATCH (c:Customer {ws: $ws, id: $cid}) MERGE (v)-[r:SHIPPED_TO {id: $id}]->(c) SET r.shippedAt = $at", { vid: sh.vehicleId, cid: sh.customerId, id: sh.id, at: sh.shippedAt });
    shipped++;
  }
  console.log(`phase 2b customers: ${seed.customers.length} ensured, ${shipped} shipment(s) added for shipped vehicles without a customer`);
  const counts = await run("MATCH (n) WHERE n.ws = $ws RETURN labels(n)[0] AS label, count(n) AS c ORDER BY label");
  console.log(`phase 2 records: ${entities} entities, ${installs} installations. Workspace now: ${counts.records.map((r) => `${r.get("label")}=${r.get("c")}`).join(" ")}`);
} finally {
  await session.close();
  await driver.close();
}

// ---------- phase 3: issues + causes through the API ----------
const CHARGE_PORT_PARTS = new Set(["CP-BRKT-200", "CP-CONN-100", "CP-MOD-300"]);
const idMap = {};
let created = 0, replayed = 0, failed = 0;
for (const i of seed.issues) {
  if (CHARGE_PORT_PARTS.has(i.partNumber)) continue;
  const body = { idempotencyKey: `seed-${i.id}`, title: i.title, description: i.description, origin: i.origin, detectedAt: i.detectedAt, reportingTeamId: i.reportingTeamId, assignedTeamId: i.assignedTeamId ?? null, detectionStationId: i.detectionStationId ?? null, processStepId: i.processStepId ?? null, entityIds: i.entityIds, partNumber: i.partNumber, partRevision: i.partRevision ?? null, linkedSupplierIds: i.linkedSupplierIds ?? [], defectCode: i.defectCode ?? null, severity: i.severity, evidenceIds: [], newEvidence: [] };
  const r = await api("POST", "/api/issues", body);
  if (!r.ok) { failed++; console.log(`  issue ${i.id} FAILED: ${r.error.code} ${r.error.message} ${JSON.stringify(r.error.details ?? "").slice(0, 200)}`); continue; }
  idMap[i.id] = r.data.id;
  if (r.status === 201) created++; else replayed++;
}
let causes = 0;
for (const c of seed.causes) {
  const issueId = idMap[c.issueId];
  if (!issueId) continue;
  const r = await api("POST", `/api/issues/${issueId}/causes`, { idempotencyKey: `seed-${c.id}`, state: c.state, causeType: c.causeType, responsibleTeamId: c.responsibleTeamId ?? null, responsibleSupplierId: c.responsibleSupplierId ?? null, causalStationId: c.causalStationId ?? null, causalProcessStepId: c.causalProcessStepId ?? null, rationale: c.rationale, evidenceIds: [], supersedesId: null });
  if (r.ok) causes++; else console.log(`  cause ${c.id} FAILED: ${r.error.code} ${r.error.message}`);
}
console.log(`phase 3 issues: ${created} created, ${replayed} replayed, ${failed} failed; ${causes} cause assessments recorded`);
console.log(JSON.stringify(idMap));
