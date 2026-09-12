/**
 * Neo4j driver singleton for the graph services. Reads NEO4J_* from the environment (Next loads
 * .env.local server-side). Credentials never leave this module; error messages are scrubbed by
 * the application layer before they reach HTTP responses.
 */
import neo4j, { type Driver, type Session } from "neo4j-driver";
import { DomainError } from "@/contracts/common";

type Env = Record<string, string | undefined>;

export type GraphConfig = { uri: string; username: string; password: string; database: string };

export function graphConfig(env: Env = process.env): GraphConfig {
  const uri = env.NEO4J_URI ?? "";
  const username = env.NEO4J_USERNAME ?? "";
  const password = env.NEO4J_PASSWORD ?? "";
  const database = env.NEO4J_DATABASE && !env.NEO4J_DATABASE.includes("<") ? env.NEO4J_DATABASE : "neo4j";
  if (!uri || uri.includes("<") || !username || !password || password.includes("<")) {
    throw new DomainError("BACKEND_UNAVAILABLE", "Neo4j is not configured (NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD).");
  }
  return { uri, username, password, database };
}

const globalState = globalThis as unknown as { __recallNeo4jDriver?: Driver };

export function getDriver(env: Env = process.env): Driver {
  if (globalState.__recallNeo4jDriver) return globalState.__recallNeo4jDriver;
  const cfg = graphConfig(env);
  globalState.__recallNeo4jDriver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.username, cfg.password), {
    disableLosslessIntegers: true,
    maxConnectionPoolSize: 20,
    connectionAcquisitionTimeout: 15_000,
  });
  return globalState.__recallNeo4jDriver;
}

export function openSession(env: Env = process.env, mode: "READ" | "WRITE" = "WRITE"): Session {
  const cfg = graphConfig(env);
  return getDriver(env).session({ database: cfg.database, defaultAccessMode: mode === "READ" ? neo4j.session.READ : neo4j.session.WRITE });
}

export async function closeDriver(): Promise<void> {
  await globalState.__recallNeo4jDriver?.close();
  globalState.__recallNeo4jDriver = undefined;
}
