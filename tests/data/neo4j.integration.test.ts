import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EV_DEMO } from "@/contracts/issues";
import { EV_TRACE_DEMO, type RevisionInfo, type TraceResult } from "@/contracts/recall";
import { loadEvFixtureImport } from "@/server/data/fixture";
import { cacheNhtsaRecords } from "@/server/data/nhtsa";
import { closeNeo4jDriver, executeRead, executeWrite, toNative } from "@/server/graph/cody/driver";
import { acceptImport, previewImport, previewLateEvidence } from "@/server/graph/cody/imports";
import { applySchema } from "@/server/graph/cody/schema";
import { compareTraces, getTrace, runTrace } from "@/server/graph/cody/traces";

const hasAuraCredentials = Boolean(
  process.env.NEO4J_URI?.startsWith("neo4j+s://") &&
  process.env.NEO4J_USERNAME &&
  process.env.NEO4J_PASSWORD,
);
const workspaceId = `data-integration-${randomUUID()}`;
const ctx = { workspaceId, actorId: "neo4j-integration-test" };
const labels = [
  "TraceRun",
  "ImportPreview",
  "Shipment",
  "Installation",
  "SupplierBatch",
  "ManufacturingLot",
  "EntityState",
  "DataRevision",
  "Entity",
  "Evidence",
  "ExternalRecord",
  "Workspace",
] as const;

async function cleanWorkspace(): Promise<void> {
  await executeWrite(async (tx) => {
    for (const label of labels) {
      await tx.run(`MATCH (node:${label} {workspaceId: $workspaceId}) DETACH DELETE node`, { workspaceId });
    }
  });
}

describe.skipIf(!hasAuraCredentials)("Neo4j Aura EV data integration", () => {
  let revision1: RevisionInfo;
  let revision2: RevisionInfo;
  let supplierRun1: TraceResult;

  beforeAll(async () => {
    await applySchema();
    const preview = await previewImport(ctx, await loadEvFixtureImport());
    expect(preview.canAccept).toBe(true);
    revision1 = await acceptImport(ctx, { previewId: preview.previewId });
  });

  afterAll(async () => {
    try {
      await cleanWorkspace();
    } finally {
      await closeNeo4jDriver();
    }
  });

  it("stores a scoped immutable EV revision and traces supplier and manufacturing provenance separately", async () => {
    const storedRevision = await executeRead(async (tx) => tx.run(`
      MATCH (revision:DataRevision {workspaceId: $workspaceId, revisionId: $revisionId})
      RETURN revision.sourceHashes AS sourceHashes
    `, { workspaceId, revisionId: revision1.revisionId }));
    expect(toNative(storedRevision.records[0]?.get("sourceHashes"))).toHaveLength(5);
    const duplicatePreview = await previewImport(ctx, await loadEvFixtureImport());
    await expect(acceptImport(ctx, { previewId: duplicatePreview.previewId })).rejects.toMatchObject({ code: "DUPLICATE_ACTION" });

    supplierRun1 = await runTrace(ctx, {
      contractVersion: "assembly-quality-v4",
      revisionId: revision1.revisionId,
      root: EV_TRACE_DEMO.supplierBatchRoot,
      scope: EV_TRACE_DEMO.scope,
    });
    const manufacturingRun = await runTrace(ctx, {
      contractVersion: "assembly-quality-v4",
      revisionId: revision1.revisionId,
      root: EV_TRACE_DEMO.manufacturingLotRoot,
      scope: EV_TRACE_DEMO.scope,
    });

    expect(supplierRun1.counts).toMatchObject({
      currentOnsiteVehicleCount: 1,
      currentShippedVehicleCount: 2,
      currentCustomerCount: 2,
      looseCandidateComponentCount: 1,
      quarantinedComponentCount: 1,
      unresolvedOnlyVehicleCount: 1,
    });
    expect(manufacturingRun.counts).toMatchObject({
      currentOnsiteVehicleCount: 1,
      currentShippedVehicleCount: 1,
      currentCustomerCount: 1,
      quarantinedComponentCount: 1,
      historicalOnlyVehicleCount: 1,
    });
    expect(supplierRun1.rows.filter((row) => row.entityId === "DEMO-EV-004")).toHaveLength(1);
    expect(supplierRun1.paths.filter((path) => path.kind === "BATCH_HAS_COMPONENT" && ["CONN-0004", "CONN-0007"].includes(path.toId))).toHaveLength(2);
    expect(manufacturingRun.paths.some((path) => path.kind === "LOT_PRODUCED_COMPONENT")).toBe(true);
    expect(supplierRun1.paths.some((path) => path.kind === "LOT_PRODUCED_COMPONENT")).toBe(false);
    await expect(runTrace(ctx, {
      contractVersion: "assembly-quality-v4",
      revisionId: revision1.revisionId,
      root: { kind: "component_serial", id: "CPM-0004" },
      scope: EV_TRACE_DEMO.scope,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepts late origin evidence as a new revision without changing the saved first run", async () => {
    const preview = await previewLateEvidence(ctx, { baseRevisionId: revision1.revisionId });
    expect(preview.canAccept).toBe(true);
    revision2 = await acceptImport(ctx, {
      previewId: preview.previewId,
      expectedBaseRevisionId: revision1.revisionId,
    });
    const supplierRun2 = await runTrace(ctx, {
      contractVersion: "assembly-quality-v4",
      revisionId: revision2.revisionId,
      root: EV_TRACE_DEMO.supplierBatchRoot,
      scope: EV_TRACE_DEMO.scope,
    });
    const comparison = await compareTraces(ctx, {
      earlierRunId: supplierRun1.runId,
      laterRunId: supplierRun2.runId,
    });

    expect(comparison.comparable).toBe(true);
    expect(comparison.delta).toMatchObject({
      currentShippedVehicleCount: 1,
      currentCustomerCount: 1,
      unresolvedOnlyVehicleCount: -1,
    });
    expect(supplierRun2.rows.find((row) => row.entityId === "DEMO-EV-008")?.currentContainment).toBe(true);
    expect(await getTrace(ctx, { runId: supplierRun1.runId })).toEqual(supplierRun1);
  });

  it("rejects evidence IDs whose source content changes across revisions", async () => {
    const input = await loadEvFixtureImport();
    input.baseRevisionId = revision2.revisionId;
    const batches = input.files.find((file) => file.name === "batches.csv");
    if (!batches) throw new Error("fixture lacks batches.csv");
    batches.text = batches.text.replace("Synthetic supplier batch receipt.", "Conflicting supplier receipt.");
    const preview = await previewImport(ctx, input);
    expect(preview.canAccept).toBe(true);
    await expect(acceptImport(ctx, {
      previewId: preview.previewId,
      expectedBaseRevisionId: revision2.revisionId,
    })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("persists the reviewed NHTSA cache without a factory-data relationship", async () => {
    await cacheNhtsaRecords(ctx);
    const result = await executeRead(async (tx) => tx.run(`
      MATCH (external:ExternalRecord {workspaceId: $workspaceId})
      OPTIONAL MATCH (external)-[relationship]-(target)
      RETURN sum(CASE WHEN target:Entity OR target:EntityState OR target:SupplierBatch OR target:ManufacturingLot OR target:Installation OR target:Shipment THEN 1 ELSE 0 END) AS relationshipCount,
        collect(DISTINCT external.rawSourceHash) AS rawSourceHashes
    `, { workspaceId }));
    const relationshipCount = toNative(result.records[0]?.get("relationshipCount"));
    const rawSourceHashes = toNative(result.records[0]?.get("rawSourceHashes"));
    expect(Number(relationshipCount)).toBe(0);
    expect(rawSourceHashes).toEqual(expect.arrayContaining([
      "19d27a525291a5ae6416a4a9563980af28b010fe63e9124bffdb4d3dec13f2ee",
      "e353a8727090947f962b6bb4a0890ac6299b94007fcc9920b60ef6b063f07572",
    ]));
  });
});

describe("Neo4j Aura integration status", () => {
  it("reports whether cloud persistence was exercised", () => {
    console.info(`[neo4j integration] ${hasAuraCredentials ? "credentials configured; suite executed" : "credentials absent; suite skipped and cloud persistence remains unverified"}`);
    expect(true).toBe(true);
  });
});
