type Env = Record<string, string | undefined>;
import { createServiceDouble } from "./double";
import { configuredMode, registerServices, registeredMode } from "./registry";

/**
 * Explicit service wiring. Imported once by src/server/application/index.ts.
 *
 * FINAL INTEGRATION (Zubair): uncomment the two lines below once Codey's branch is merged so the
 * default mode "graph" answers from the real Neo4j-backed services.
 *
 *   import { graphServices } from "@/server/graph";
 *   if (configuredMode() === "graph") registerServices("graph", graphServices);
 *
 * The double is registered ONLY when RECALL_SERVICES=double. If the mode is "graph" and nothing is
 * registered, every route answers BACKEND_UNAVAILABLE. There is no silent fallback.
 */
const globalState = globalThis as unknown as { __recallServiceDouble?: ReturnType<typeof createServiceDouble> };

export function ensureWired(env: Env = process.env): void {
  const mode = configuredMode(env);
  if (mode === "double" && registeredMode() !== "double") {
    // Survives Next dev-server module reloads so issue/revision state persists across requests.
    globalState.__recallServiceDouble ??= createServiceDouble({
      workspaceId: env.RECALL_WORKSPACE_ID,
      issues: { includeQualityRegression: env.RECALL_DOUBLE_REGRESSION === "true" },
    });
    registerServices("double", globalState.__recallServiceDouble);
  }
}
