import { EV_DEMO } from "../../src/contracts/issues";
import { loadEvFixtureImport } from "../../src/server/data/fixture";
import { closeNeo4jDriver } from "../../src/server/graph/cody/driver";
import { acceptImport, previewImport } from "../../src/server/graph/cody/imports";
import { applySchema } from "../../src/server/graph/cody/schema";

async function main() {
  await applySchema();
  const ctx = { workspaceId: EV_DEMO.workspaceId, actorId: "seed-script" };
  const preview = await previewImport(ctx, await loadEvFixtureImport());
  if (!preview.canAccept) throw new Error(`EV fixture preview rejected: ${preview.issues.map((issue) => issue.message).join("; ")}`);
  const revision = await acceptImport(ctx, { previewId: preview.previewId });
  process.stdout.write(`${JSON.stringify(revision)}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4jDriver();
  });
