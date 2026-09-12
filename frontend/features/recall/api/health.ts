/**
 * GET /api/health wiring report (additive to the frozen contract; owned by the API lane, read here).
 * The UI uses it to label the backend mode truthfully: "Live API" alone never implies Neo4j.
 */
import { z } from "zod";

export const BACKEND_SERVICE_MODES = ["graph", "double"] as const;
export type BackendServicesMode = (typeof BACKEND_SERVICE_MODES)[number];

export const BackendHealthSchema = z
  .object({
    ok: z.boolean(),
    contractVersion: z.string(),
    servicesMode: z.enum(BACKEND_SERVICE_MODES),
    servicesRegistered: z.boolean(),
    aiProvider: z.string(),
    aiCredentialConfigured: z.boolean().optional(),
    neo4jConfigured: z.boolean().optional(),
    workspaceId: z.string().nullable().optional(),
    demoIdentity: z.string().optional(),
  })
  .loose();
export type BackendHealth = z.infer<typeof BackendHealthSchema>;

/** Human labels for the backend that answers the real routes. */
export function describeBackend(h: BackendHealth): { short: string; long: string; tone: "ok" | "warning" | "blocking" } {
  if (!h.servicesRegistered) {
    return {
      short: `${h.servicesMode} services not wired`,
      long: `The server is configured for "${h.servicesMode}" services but none are registered; every data request fails with BACKEND_UNAVAILABLE. No sample data is substituted.`,
      tone: "blocking",
    };
  }
  if (h.servicesMode === "graph") {
    return { short: "Neo4j graph services", long: "Real routes answered by the Neo4j-backed graph services (RECALL_SERVICES=graph).", tone: "ok" };
  }
  return {
    short: "demo data (service double)",
    long: "Real HTTP routes answered by the in-memory service double seeded with the synthetic EV story (RECALL_SERVICES=double). This is not Neo4j and records do not survive a server restart. Nothing is mocked in the browser.",
    tone: "warning",
  };
}
