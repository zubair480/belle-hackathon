/**
 * Neo4j connectivity check (no secrets printed).
 *
 *   npm run neo4j:check
 *
 * Reads NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE from the environment or from
 * .env.local (simple KEY=VALUE parsing, no dependency). Verifies connectivity, runs a trivial read,
 * and counts nodes carrying the demo workspace id when RECALL_WORKSPACE_ID is set. Exit 0 only when
 * the driver connected and the read succeeded. This proves a database is reachable; it does not
 * prove schemas, seeds or graph services exist.
 */
import { existsSync, readFileSync } from "node:fs";
import neo4j from "neo4j-driver";

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

const uri = process.env.NEO4J_URI ?? "";
const user = process.env.NEO4J_USERNAME ?? "";
const password = process.env.NEO4J_PASSWORD ?? "";
const database = process.env.NEO4J_DATABASE ?? "neo4j";
const workspaceId = process.env.RECALL_WORKSPACE_ID ?? null;

const redactedUri = uri.replace(/\/\/[^@]*@/, "//<redacted>@");
if (!uri || uri.includes("<") || !user || !password || password.includes("<")) {
  console.error("NEO4J_* not configured (placeholders present). Database integration UNVERIFIED.");
  process.exit(2);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
try {
  await driver.verifyConnectivity();
  const info = await driver.getServerInfo();
  console.log(`connected: uri=${redactedUri} database=${database} server=${info.agent ?? "unknown"} protocol=${String(info.protocolVersion ?? "?")}`);
  const session = driver.session({ database, defaultAccessMode: neo4j.session.READ });
  try {
    const one = await session.run("RETURN 1 AS one");
    const v = one.records[0]?.get("one");
    console.log(`trivial read: ${typeof v?.toNumber === "function" ? v.toNumber() : String(v)}`);
    if (workspaceId) {
      const count = await session.run("MATCH (n) WHERE n.workspaceId = $workspaceId RETURN count(n) AS c", { workspaceId });
      const c = count.records[0]?.get("c");
      console.log(`nodes with workspaceId=${workspaceId}: ${typeof c?.toNumber === "function" ? c.toNumber() : String(c)} (0 means the EV seed is not loaded yet)`);
    }
  } finally {
    await session.close();
  }
  process.exit(0);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`connection failed: ${msg.replace(password, "<redacted>").slice(0, 300)}`);
  process.exit(1);
} finally {
  await driver.close();
}
