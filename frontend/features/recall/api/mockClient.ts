/**
 * Visibly labeled MOCK client (NEXT_PUBLIC_RECALL_UI_MOCKS=true). Same DTOs and error codes as the
 * live client. `controls.failNext` lets UI tests exercise backend-unavailable and conflict states.
 */
import { MockError, MockServer, type MockServerOptions } from "./mock/server";
import { clientFail, clientOk, type ClientError, type ClientResult, type RecallClient } from "./types";

export type MockControls = {
  server: MockServer;
  /** Queue an error for the next call of the named method (or "*" for any). */
  failNext: (method: keyof RecallClient | "*", error: ClientError) => void;
  latencyMs: number;
};

export type MockClientOptions = MockServerOptions & { latencyMs?: number };

export function createMockClient(options: MockClientOptions = {}): { client: RecallClient; controls: MockControls } {
  const server = new MockServer(options);
  const failures = new Map<string, ClientError>();
  const controls: MockControls = {
    server,
    latencyMs: options.latencyMs ?? 220,
    failNext: (method, error) => failures.set(method, error),
  };

  async function run<T>(method: keyof RecallClient, work: () => T): Promise<ClientResult<T>> {
    if (controls.latencyMs > 0) await new Promise((r) => setTimeout(r, controls.latencyMs));
    const forced = failures.get(method) ?? failures.get("*");
    if (forced) {
      failures.delete(method);
      failures.delete("*");
      return clientFail(forced.code, forced.message, forced.details);
    }
    try {
      return clientOk(work());
    } catch (e) {
      if (e instanceof MockError) return clientFail(e.code, e.message, e.details);
      return clientFail("INTERNAL", e instanceof Error ? e.message : "Mock failure");
    }
  }

  const client: RecallClient = {
    mode: "mock",
    modeLabel: "Sample data (mock mode)",
    getCatalog: () => run("getCatalog", () => server.getCatalog()),
    getEntityContext: (id, asOf) => run("getEntityContext", () => server.getEntityContext(id, asOf ?? null)),
    createIssue: (cmd) => run("createIssue", () => server.createIssue(cmd).issue),
    listIssues: (f) => run("listIssues", () => server.listIssues(f)),
    getIssue: (id) => run("getIssue", () => server.getIssue(id)),
    updateIssue: (id, u) => run("updateIssue", () => server.updateIssue(id, u)),
    addComment: (id, i) => run("addComment", () => server.addComment(id, i)),
    recordCause: (id, i) => run("recordCause", () => server.recordCause(id, i)),
    createFix: (id, i) => run("createFix", () => server.createFix(id, i)),
    recordVerification: (id, i) => run("recordVerification", () => server.recordVerification(id, i)),
    transition: (id, c) => run("transition", () => server.transition(id, c)),
    findSimilarResolutions: (id) => run("findSimilarResolutions", () => server.findSimilarResolutions(id)),
    getInsights: (f) => run("getInsights", () => server.getInsights(f)),
    runTrace: (incidentId, request) => run("runTrace", () => server.runTrace({ ...request, incidentId })),
    agentChat: async () => clientFail("AI_UNAVAILABLE", "Mock mode runs the deterministic stub planner in the browser; there is no server agent route to call."),
  };
  return { client, controls };
}
