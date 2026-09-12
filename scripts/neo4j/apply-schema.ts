import { applySchema } from "../../src/server/graph/cody/schema";
import { closeNeo4jDriver, verifyNeo4jConnectivity } from "../../src/server/graph/cody/driver";

async function main() {
  await verifyNeo4jConnectivity();
  await applySchema();
  process.stdout.write("Neo4j Aura schema is ready.\n");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to apply Neo4j schema: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4jDriver();
  });
