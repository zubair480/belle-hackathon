import { EV_DEMO } from "../../src/contracts/issues";
import { cacheNhtsaRecords } from "../../src/server/data/nhtsa";
import { closeNeo4jDriver } from "../../src/server/graph/cody/driver";

async function main() {
  const records = await cacheNhtsaRecords({ workspaceId: EV_DEMO.workspaceId, actorId: "nhtsa-cache-script" });
  process.stdout.write(`Cached ${records.length} reviewed NHTSA records without factory joins.\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4jDriver();
  });
