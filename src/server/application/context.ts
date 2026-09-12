type Env = Record<string, string | undefined>;
import { DomainError, RequestContextSchema, type RequestContext } from "@/contracts/recall";

/**
 * Derives the workspace/actor context on the server from environment configuration.
 *
 * This is a documented synthetic demo identity for one local workspace. It is NOT production
 * authentication: there is no session, no credential check and no per-user authorization.
 * Browsers cannot override these values; request bodies/headers are never consulted.
 */
export function getRequestContext(env: Env = process.env): RequestContext {
  const parsed = RequestContextSchema.safeParse({
    workspaceId: env.RECALL_WORKSPACE_ID ?? "",
    actorId: env.RECALL_DEMO_ACTOR_ID ?? "",
  });
  if (!parsed.success) {
    throw new DomainError(
      "FORBIDDEN",
      "Server demo identity is not configured (RECALL_WORKSPACE_ID / RECALL_DEMO_ACTOR_ID).",
    );
  }
  return parsed.data;
}
