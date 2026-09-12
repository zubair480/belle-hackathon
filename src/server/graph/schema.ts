/**
 * Neo4j constraints for the RecallRadius graph (assembly-quality-v4). Idempotent (IF NOT EXISTS).
 * Every node carries `ws` (workspace id); identities are unique per workspace.
 */
export const GRAPH_LABELS = [
  "Site", "Team", "Supplier", "Station", "ProcessStep", "DefectCode", "Customer",
  "SupplierLot", "MfgLot", "Entity", "Origin", "Evidence",
  "Issue", "Comment", "Cause", "Fix", "Verification", "Audit",
  "Idem", "Revision", "Preview", "TraceRun",
] as const;

export const CONSTRAINT_STATEMENTS: string[] = [
  ...GRAPH_LABELS.filter((l) => l !== "Idem").map((label) => `CREATE CONSTRAINT rr_${label.toLowerCase()}_identity IF NOT EXISTS FOR (n:${label}) REQUIRE (n.ws, n.id) IS UNIQUE`),
  "CREATE CONSTRAINT rr_idem_identity IF NOT EXISTS FOR (n:Idem) REQUIRE (n.ws, n.key) IS UNIQUE",
  "CREATE INDEX rr_issue_status IF NOT EXISTS FOR (n:Issue) ON (n.ws, n.status)",
  "CREATE INDEX rr_entity_kind IF NOT EXISTS FOR (n:Entity) ON (n.ws, n.kind)",
];
