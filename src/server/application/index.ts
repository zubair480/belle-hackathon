type Env = Record<string, string | undefined>;
import { aiTimeoutMs, configuredAiProvider, resolveProvider } from "@/server/ai/config";
import { getRequestContext } from "./context";
import { createHandlers, type ApiHandlers } from "./handlers";
import { configuredMode, getServices, registeredMode } from "./registry";
import { ensureWired } from "./wiring";

const DEFAULT_SERVICE_TIMEOUT_MS = 20_000;

function serviceTimeoutMs(env: Env): number {
  const n = Number(env.RECALL_SERVICE_TIMEOUT_MS ?? DEFAULT_SERVICE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SERVICE_TIMEOUT_MS;
}

let cached: ApiHandlers | null = null;

/** Production/dev handlers wired from environment configuration. */
export function apiHandlers(env: Env = process.env): ApiHandlers {
  if (cached) return cached;
  cached = createHandlers({
    services: () => {
      ensureWired(env);
      return getServices(env);
    },
    context: () => getRequestContext(env),
    aiProvider: () => resolveProvider(env),
    serviceTimeoutMs: serviceTimeoutMs(env),
    aiTimeoutMs: aiTimeoutMs(env),
    describeWiring: () => {
      ensureWired(env);
      return {
        servicesMode: configuredMode(env),
        servicesRegistered: registeredMode() === configuredMode(env),
        aiProvider: configuredAiProvider(env),
        aiCredentialConfigured: Boolean(env.RECALL_AI_API_KEY && !env.RECALL_AI_API_KEY.startsWith("<")),
        neo4jConfigured: Boolean(env.NEO4J_URI && !env.NEO4J_URI.includes("<")),
        workspaceId: env.RECALL_WORKSPACE_ID ?? null,
        demoIdentity: "server-configured synthetic demo context; not production authentication",
      };
    },
  });
  return cached;
}

export { createHandlers } from "./handlers";
export type { ApiHandlers, HandlerDeps } from "./handlers";
