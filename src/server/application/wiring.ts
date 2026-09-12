type Env = Record<string, string | undefined>;
import { graphServices } from "@/server/graph";
import { createServiceDouble } from "./double";
import { configuredMode, registerServices, registeredMode } from "./registry";

/**
 * Explicit service wiring. Imported once by src/server/application/index.ts.
 *
 * - mode "graph" (default): Neo4j-backed `graphServices` (src/server/graph). The driver reads
 *   NEO4J_* at first use; a missing configuration surfaces as BACKEND_UNAVAILABLE on every call.
 * - mode "double": in-memory doubles, ONLY when RECALL_SERVICES=double.
 * A failing graph service is never replaced by the double.
 */
const globalState = globalThis as unknown as { __recallServiceDouble?: ReturnType<typeof createServiceDouble> };

export function ensureWired(env: Env = process.env): void {
  const mode = configuredMode(env);
  if (mode === "graph" && registeredMode() !== "graph") {
    registerServices("graph", graphServices);
    return;
  }
  if (mode === "double" && registeredMode() !== "double") {
    // Survives Next dev-server module reloads so issue/revision state persists across requests.
    globalState.__recallServiceDouble ??= createServiceDouble({
      workspaceId: env.RECALL_WORKSPACE_ID,
      issues: { includeQualityRegression: env.RECALL_DOUBLE_REGRESSION === "true" },
    });
    registerServices("double", globalState.__recallServiceDouble);
  }
}
