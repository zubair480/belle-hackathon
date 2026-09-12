/**
 * Load the EV-PLATFORM-1 design dataset (part slots, zones, systems, circuits, wires, connectors)
 * into Neo4j Aura through the driver. `neo4j/import.cypher` is written for cypher-shell (`:param`
 * lines); Aura has no shell, so this script parses that file, applies the params and runs each
 * statement in order. Idempotent: every statement is a MERGE keyed by (platform, revision, id).
 *
 *   node frontend/data/ev-platform/seed-aura.mjs
 *
 * Reads NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE from the environment or
 * .env.local. Never prints credentials. Touches only nodes carrying the platform/revision keys.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";

const here = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnvLocal();

const uri = process.env.NEO4J_URI ?? "";
const password = process.env.NEO4J_PASSWORD ?? "";
if (!uri || uri.includes("<") || !password || password.includes("<")) {
  console.error("NEO4J_* not configured; nothing loaded.");
  process.exit(2);
}
const database = process.env.NEO4J_DATABASE && !process.env.NEO4J_DATABASE.includes("<") ? process.env.NEO4J_DATABASE : "neo4j";

/** Split import.cypher into { params, statements }. Statements end with ";" at end of line. */
function parseImport(text) {
  const params = {};
  const statements = [];
  let buf = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const p = line.match(/^:param\s+(\w+)\s*=>\s*(.*);$/);
    if (p) { params[p[1]] = JSON.parse(p[2]); continue; }
    buf += (buf ? "\n" : "") + raw;
    if (line.endsWith(";")) { statements.push(buf.replace(/;\s*$/, "")); buf = ""; }
  }
  if (buf.trim()) statements.push(buf);
  return { params, statements };
}

const { params, statements } = parseImport(readFileSync(join(here, "neo4j", "import.cypher"), "utf8"));
const driver = neo4j.driver(uri, neo4j.auth.basic(process.env.NEO4J_USERNAME ?? "neo4j", password), { disableLosslessIntegers: true });
const session = driver.session({ database });
let ran = 0;
try {
  for (const cypher of statements) {
    await session.run(cypher, params);
    ran += 1;
  }
  const counts = await session.run(
    `MATCH (n) WHERE n.platform = $platform AND n.revision = $revision UNWIND labels(n) AS l RETURN l AS label, count(*) AS c ORDER BY l`,
    params,
  );
  console.log(`ran ${ran} statements for ${params.platform}/${params.revision}`);
  for (const rec of counts.records) console.log(`  ${rec.get("label")}: ${rec.get("c")}`);
  const rels = await session.run(
    `MATCH (a)-[r]->(b) WHERE a.platform = $platform AND b.platform = $platform RETURN type(r) AS t, count(*) AS c ORDER BY t`,
    params,
  );
  for (const rec of rels.records) console.log(`  -[${rec.get("t")}]-> ${rec.get("c")}`);
} finally {
  await session.close();
  await driver.close();
}
