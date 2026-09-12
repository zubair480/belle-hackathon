import { EV_DEMO } from "../../src/contracts/issues";
import { EV_TRACE_DEMO } from "../../src/contracts/recall";
import { closeNeo4jDriver } from "../../src/server/graph/cody/driver";
import { runTrace } from "../../src/server/graph/cody/traces";

async function main() {
  const revisionId = process.argv[2];
  if (!revisionId) {
    throw new Error("Usage: tsx scripts/neo4j/query-demo-traces.ts <revisionId>");
  }

  const ctx = { workspaceId: EV_DEMO.workspaceId, actorId: "demo-query" };

  const supplierTrace = await runTrace(ctx, {
    contractVersion: "assembly-quality-v4",
    revisionId,
    root: EV_TRACE_DEMO.supplierBatchRoot,
    scope: EV_TRACE_DEMO.scope,
  });
  process.stdout.write("=== Supplier batch (LOT-SUP-01) trace ===\n");
  process.stdout.write(`${JSON.stringify(supplierTrace.counts, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify(
      supplierTrace.rows.map((r) => ({ id: r.entityId, kind: r.entityKind, part: r.partNumber, loc: r.locationState })),
      null,
      2,
    )}\n`,
  );

  const lotTrace = await runTrace(ctx, {
    contractVersion: "assembly-quality-v4",
    revisionId,
    root: EV_TRACE_DEMO.manufacturingLotRoot,
    scope: EV_TRACE_DEMO.scope,
  });
  process.stdout.write("\n=== Manufacturing lot (LOT-MFG-01) trace ===\n");
  process.stdout.write(`${JSON.stringify(lotTrace.counts, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify(
      lotTrace.rows.map((r) => ({ id: r.entityId, kind: r.entityKind, part: r.partNumber, loc: r.locationState })),
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4jDriver();
  });
