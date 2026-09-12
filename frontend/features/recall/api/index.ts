/**
 * Client selection. Mock mode is an explicit build-time flag; the live client is the default.
 * A live failure is surfaced as an error state and never swapped for the mock at runtime.
 */
import { createHttpClient } from "./httpClient";
import { createMockClient } from "./mockClient";
import type { RecallClient } from "./types";

export * from "./types";
export { BackendHealthSchema, describeBackend, type BackendHealth, type BackendServicesMode } from "./health";
export { createHttpClient } from "./httpClient";
export { createMockClient, type MockControls } from "./mockClient";

export function isMockModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RECALL_UI_MOCKS === "true";
}

let singleton: RecallClient | null = null;

export function getDefaultClient(): RecallClient {
  if (!singleton) singleton = isMockModeEnabled() ? createMockClient().client : createHttpClient();
  return singleton;
}
