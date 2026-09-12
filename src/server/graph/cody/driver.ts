import neo4j, { type Driver, type ManagedTransaction } from "neo4j-driver";
import { DomainError } from "@/contracts/common";

export type Neo4jConfig = {
  uri: string;
  username: string;
  password: string;
  database: string;
};

let driver: Driver | null = null;

export function getNeo4jConfig(): Neo4jConfig {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;
  const database = process.env.NEO4J_DATABASE ?? "neo4j";

  if (!uri || !username || !password) {
    throw new DomainError(
      "BACKEND_UNAVAILABLE",
      "Neo4j Aura is not configured. Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD on the server.",
    );
  }

  if (!uri.startsWith("neo4j+s://")) {
    throw new DomainError("BACKEND_UNAVAILABLE", "NEO4J_URI must use the Aura neo4j+s:// scheme.");
  }

  return { uri, username, password, database };
}

export function getNeo4jDriver(): Driver {
  if (!driver) {
    const config = getNeo4jConfig();
    driver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password), {
      maxConnectionPoolSize: 5,
    });
  }

  return driver;
}

export async function verifyNeo4jConnectivity(): Promise<void> {
  await getNeo4jDriver().verifyConnectivity();
}

export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export async function executeRead<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
  const session = getNeo4jDriver().session({ database: getNeo4jConfig().database });
  try {
    return await session.executeRead(work);
  } finally {
    await session.close();
  }
}

export async function executeWrite<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
  const session = getNeo4jDriver().session({ database: getNeo4jConfig().database });
  try {
    return await session.executeWrite(work);
  } finally {
    await session.close();
  }
}

export function toNative(value: unknown): unknown {
  if (neo4j.isInt(value)) {
    return neo4j.integer.inSafeRange(value) ? value.toNumber() : value.toString();
  }

  if (Array.isArray(value)) return value.map(toNative);
  if (value instanceof Date) return value.toISOString();

  if (value && typeof value === "object") {
    const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;
    if (constructorName && /Date|Time|Duration/.test(constructorName)) return String(value);

    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toNative(entry)]));
  }

  return value;
}
