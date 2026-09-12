/**
 * Public surface of Ali's lane. Zubair mounts `RecallWorkspace` in src/app/page.tsx.
 */
export { RecallWorkspace, type RecallWorkspaceProps } from "./RecallWorkspace";
export { createHttpClient, createMockClient, getDefaultClient, isMockModeEnabled, type ClientError, type ClientResult, type MockControls, type RecallClient } from "./api";
export type { WorkspaceView } from "./context";
