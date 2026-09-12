type Env = Record<string, string | undefined>;
import { DomainError, type DomainServices } from "@/contracts/recall";

export type ServicesMode = "graph" | "double";

let registered: { mode: ServicesMode; services: DomainServices } | null = null;

/**
 * Explicit wiring point. `src/server/application/wiring.ts` registers Codey's graph services at
 * final integration; the in-memory double is registered only when RECALL_SERVICES=double.
 * There is no automatic fallback: if the configured mode has nothing registered, routes fail
 * with BACKEND_UNAVAILABLE rather than answering from a double.
 */
export function registerServices(mode: ServicesMode, services: DomainServices): void {
  registered = { mode, services };
}

export function resetServicesForTests(): void {
  registered = null;
}

export function configuredMode(env: Env = process.env): ServicesMode {
  return env.RECALL_SERVICES === "double" ? "double" : "graph";
}

export function getServices(env: Env = process.env): DomainServices {
  const mode = configuredMode(env);
  if (!registered || registered.mode !== mode) {
    throw new DomainError(
      "BACKEND_UNAVAILABLE",
      mode === "graph"
        ? "Graph domain services are not wired. Mount src/server/graph at final integration or set RECALL_SERVICES=double for development."
        : "Service double is not registered.",
    );
  }
  return registered.services;
}

export function registeredMode(): ServicesMode | null {
  return registered?.mode ?? null;
}
