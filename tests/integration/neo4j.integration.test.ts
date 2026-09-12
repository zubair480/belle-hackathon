/**
 * Real-database integration checks. These run ONLY when NEO4J_URI/NEO4J_USERNAME/NEO4J_PASSWORD are
 * set; otherwise they are skipped and reported as UNVERIFIED (never as passed).
 *
 * Part 1 verifies connectivity with the official driver.
 * Part 2 runs the shared end-to-end acceptance loop through the HTTP handlers against Codey's real
 * graph services (mounted at final integration via RECALL_SERVICES=graph). Until that module exists
 * on this branch the loop is skipped with an explicit reason.
 */
import neo4j from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEMO,
  REFERENCE_EXPECTATIONS,
  type ApiResponse,
  type DomainServices,
  type ImportPreview,
  type RevisionInfo,
  type TraceComparison,
  type TraceResult,
} from "@/contracts/recall";
import { createHandlers } from "@/server/application/handlers";

const env = process.env;
const hasCreds = Boolean(env.NEO4J_URI && env.NEO4J_USERNAME && env.NEO4J_PASSWORD && !env.NEO4J_URI.includes("<"));
const graphMode = env.RECALL_SERVICES !== "double";

describe.skipIf(!hasCreds)("Neo4j connectivity (real database)", () => {
  let driver: ReturnType<typeof neo4j.driver>;
  beforeAll(() => {
    driver = neo4j.driver(env.NEO4J_URI!, neo4j.auth.basic(env.NEO4J_USERNAME!, env.NEO4J_PASSWORD!));
  });
  afterAll(async () => {
    await driver?.close();
  });

  it("connects and can run a trivial read", async () => {
    await driver.verifyConnectivity();
    const session = driver.session({ database: env.NEO4J_DATABASE ?? "neo4j", defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run("RETURN 1 AS one");
      expect(result.records[0]?.get("one").toNumber?.() ?? result.records[0]?.get("one")).toBe(1);
    } finally {
      await session.close();
    }
  });
});

/**
 * Loads Codey's graph services without a compile-time dependency on his branch. At final
 * integration this becomes `import { graphServices } from "@/server/graph"`.
 */
async function loadGraphServices(): Promise<DomainServices | null> {
  const modulePath = "@/server/graph";
  try {
    const mod = (await import(/* @vite-ignore */ modulePath)) as { graphServices?: DomainServices; default?: DomainServices };
    return mod.graphServices ?? mod.default ?? null;
  } catch {
    return null;
  }
}

describe.skipIf(!hasCreds || !graphMode)("End-to-end acceptance against real graph services", () => {
  let services: DomainServices | null = null;
  beforeAll(async () => {
    services = await loadGraphServices();
  });

  it("runs import -> trace -> late evidence -> trace -> compare with reference outcomes", async (ctx) => {
    if (!services) {
      ctx.skip("src/server/graph is not present on this checkout; integration UNVERIFIED");
      return;
    }
    const api = createHandlers({
      services: () => services!,
      context: () => ({ workspaceId: env.RECALL_WORKSPACE_ID ?? DEMO.workspaceId, actorId: env.RECALL_DEMO_ACTOR_ID ?? "qa-reviewer-demo" }),
      aiProvider: () => null,
      serviceTimeoutMs: 60_000,
      aiTimeoutMs: 1000,
      describeWiring: () => ({}),
    });
    const post = (body: unknown) => new Request("http://t/", { method: "POST", body: JSON.stringify(body) });
    const unwrap = async <T>(res: Response): Promise<T> => {
      const body = (await res.json()) as ApiResponse<T>;
      if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message}`);
      return body.data;
    };

    // Codey's importer defines the CSV columns; the fixture files under fixtures/ are read here.
    const { readFile } = await import("node:fs/promises");
    const names = ["lots.csv", "events.csv", "shipments.csv", "movements.csv"];
    const files = await Promise.all(names.map(async (name) => ({ name, text: await readFile(`fixtures/${name}`, "utf8") })));

    const preview = await unwrap<ImportPreview>(await api.importPreview(post({ files, scope: DEMO.scope })));
    expect(preview.canAccept).toBe(true);
    const rev1 = await unwrap<RevisionInfo>(await api.importAccept(post({}), preview.previewId));
    const run1 = await unwrap<TraceResult>(await api.traceCreate(post({ revisionId: rev1.revisionId, rootLotIds: [DEMO.rootLotId], scope: DEMO.scope }), DEMO.incidentId));
    expect(run1.executionStatus).toBe("completed");
    expect(run1.known).toEqual(REFERENCE_EXPECTATIONS.revision1.known);
    expect(run1.unresolvedOnly).toEqual(REFERENCE_EXPECTATIONS.revision1.unresolvedOnly);
    expect(run1.disposedKg).toBe(REFERENCE_EXPECTATIONS.revision1.disposedKg);
    expect(run1.rows.find((r) => r.lotId === "F-D")).toMatchObject({ knownMaterialPath: false });
    expect(run1.rows.find((r) => r.lotId === "F-C")).toMatchObject({ onsiteKg: 50, shipmentLineIds: ["SL-C"] });

    const late = await unwrap<ImportPreview>(await api.lateEvidencePreview(post({ baseRevisionId: rev1.revisionId })));
    expect(late.canAccept).toBe(true);
    const rev2 = await unwrap<RevisionInfo>(await api.importAccept(post({ expectedBaseRevisionId: rev1.revisionId }), late.previewId));
    const run2 = await unwrap<TraceResult>(await api.traceCreate(post({ revisionId: rev2.revisionId, rootLotIds: [DEMO.rootLotId], scope: DEMO.scope }), DEMO.incidentId));
    expect(run2.known).toEqual(REFERENCE_EXPECTATIONS.revision2.known);
    expect(run2.unresolvedOnly).toEqual(REFERENCE_EXPECTATIONS.revision2.unresolvedOnly);
    expect(run2.disposedKg).toBe(REFERENCE_EXPECTATIONS.revision2.disposedKg);
    expect(run2.rows.find((r) => r.lotId === "F-D")).toMatchObject({ knownMaterialPath: false });

    const cmp = await unwrap<TraceComparison>(await api.traceCompare(run1.runId, run2.runId));
    expect(cmp.comparable).toBe(true);
    expect(cmp.delta).toEqual(REFERENCE_EXPECTATIONS.delta);

    const run1Again = await unwrap<TraceResult>(await api.traceGet(run1.runId));
    expect(run1Again).toEqual(run1);

    const csv = await (await api.traceExport(run2.runId)).text();
    expect(csv).toContain(`"${rev2.revisionId}"`);
  });
});

describe("integration status report", () => {
  it("states whether database integration was exercised", () => {
    // This test never fails; it documents the state in the run output.
    const state = hasCreds ? "NEO4J credentials present: integration suites executed" : "NEO4J credentials absent: database integration UNVERIFIED (suites skipped)";
    console.info(`[integration] ${state}`);
    expect(true).toBe(true);
  });
});
