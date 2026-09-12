/**
 * Removes issues created by the automated acceptance runs so the demo starts from the seeded
 * state. Scope: workspace RECALL_WORKSPACE_ID only; deletes Issue nodes created by the demo actor
 * whose title matches the runner's synthetic titles, together with their Comment, Cause, Fix,
 * Verification, Audit and manual Evidence nodes and the Idem markers that point at them.
 * Never touches seeded issues (ISS-BRKT-PRIOR, ISS-CONN-SUPPLIER), entities, provenance, catalog,
 * Codey's or Ali's nodes. Pass --dry-run to list without deleting.
 *
 *   npm run neo4j:cleanup-acceptance -- [--dry-run]
 */
import { existsSync, readFileSync } from "node:fs";
import neo4j from "neo4j-driver";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined && !line.trim().startsWith("#")) process.env[m[1]] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
}
const env = process.env;
if (!env.NEO4J_URI || env.NEO4J_URI.includes("<") || !env.NEO4J_PASSWORD) {
  console.error("NEO4J_* not configured.");
  process.exit(2);
}
const dryRun = process.argv.includes("--dry-run");
const ws = env.RECALL_WORKSPACE_ID ?? "synthetic-ev-assembler";
const actor = env.RECALL_DEMO_ACTOR_ID ?? "qa-reviewer-demo";
const database = env.NEO4J_DATABASE && !env.NEO4J_DATABASE.includes("<") ? env.NEO4J_DATABASE : "neo4j";
const driver = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USERNAME ?? "neo4j", env.NEO4J_PASSWORD), { disableLosslessIntegers: true });
const session = driver.session({ database });
try {
  const match = `MATCH (i:Issue {ws: $ws, createdBy: $actor})
    WHERE i.id STARTS WITH 'ISS-M' AND (i.title STARTS WITH 'Charge-port connector misaligned on DEMO-EV-005' OR i.title STARTS WITH 'Bracket skew on DEMO-EV-004')`;
  const list = await session.run(`${match} RETURN i.id AS id, i.title AS title, i.status AS status ORDER BY i.createdAt`, { ws, actor });
  console.log(`${list.records.length} acceptance-run issue(s) in workspace ${ws}:`);
  for (const r of list.records) console.log(`  ${r.get("id")}  ${r.get("status")}  ${r.get("title")}`);
  if (dryRun || list.records.length === 0) {
    console.log(dryRun ? "dry run; nothing deleted" : "nothing to delete");
  } else {
    const res = await session.run(
      `${match}
       OPTIONAL MATCH (c:Comment {ws: $ws, issueId: i.id})
       OPTIONAL MATCH (ca:Cause {ws: $ws, issueId: i.id})
       OPTIONAL MATCH (f:Fix {ws: $ws, issueId: i.id})
       OPTIONAL MATCH (v:Verification {ws: $ws, issueId: i.id})
       OPTIONAL MATCH (a:Audit {ws: $ws, issueId: i.id})
       OPTIONAL MATCH (k:Idem {ws: $ws})-[:RESULT]->(i)
       OPTIONAL MATCH (e:Evidence {ws: $ws, sourceKind: 'manual'}) WHERE e.id IN i.evidenceIds OR e.id IN coalesce(v.evidenceIds, [])
       WITH i, collect(DISTINCT c) + collect(DISTINCT ca) + collect(DISTINCT f) + collect(DISTINCT v) + collect(DISTINCT a) + collect(DISTINCT k) + collect(DISTINCT e) AS attached
       FOREACH (n IN attached | DETACH DELETE n)
       DETACH DELETE i
       RETURN count(*) AS deleted`,
      { ws, actor },
    );
    console.log(`deleted ${res.records[0]?.get("deleted")} issue(s) with attached nodes`);
    const idem = await session.run("MATCH (k:Idem {ws: $ws}) WHERE NOT (k)-[:RESULT]->() AND k.key STARTS WITH 'create:' DELETE k RETURN count(k) AS c", { ws });
    console.log(`removed ${idem.records[0]?.get("c")} orphan create idempotency marker(s)`);
  }
  const remaining = await session.run("MATCH (i:Issue {ws: $ws}) RETURN i.id AS id, i.status AS status ORDER BY i.id", { ws });
  console.log("remaining issues:", remaining.records.map((r) => `${r.get("id")} (${r.get("status")})`).join(", "));
} finally {
  await session.close();
  await driver.close();
}
