import { getNeo4jConfig, getNeo4jDriver } from "./driver";

export const SCHEMA_STATEMENTS = [
  "CREATE CONSTRAINT workspace_identity IF NOT EXISTS FOR (node:Workspace) REQUIRE node.workspaceId IS UNIQUE",
  "CREATE CONSTRAINT revision_identity IF NOT EXISTS FOR (node:DataRevision) REQUIRE (node.workspaceId, node.revisionId) IS UNIQUE",
  "CREATE CONSTRAINT entity_identity IF NOT EXISTS FOR (node:Entity) REQUIRE (node.workspaceId, node.entityId) IS UNIQUE",
  "CREATE CONSTRAINT entity_serial_identity IF NOT EXISTS FOR (node:Entity) REQUIRE (node.workspaceId, node.identityKey) IS UNIQUE",
  "CREATE CONSTRAINT entity_state_identity IF NOT EXISTS FOR (node:EntityState) REQUIRE (node.workspaceId, node.revisionId, node.entityId) IS UNIQUE",
  "CREATE CONSTRAINT supplier_batch_identity IF NOT EXISTS FOR (node:SupplierBatch) REQUIRE (node.workspaceId, node.revisionId, node.batchId) IS UNIQUE",
  "CREATE CONSTRAINT manufacturing_lot_identity IF NOT EXISTS FOR (node:ManufacturingLot) REQUIRE (node.workspaceId, node.revisionId, node.lotId) IS UNIQUE",
  "CREATE CONSTRAINT installation_identity IF NOT EXISTS FOR (node:Installation) REQUIRE (node.workspaceId, node.revisionId, node.installationId) IS UNIQUE",
  "CREATE CONSTRAINT shipment_identity IF NOT EXISTS FOR (node:Shipment) REQUIRE (node.workspaceId, node.revisionId, node.shipmentId) IS UNIQUE",
  "CREATE CONSTRAINT evidence_identity IF NOT EXISTS FOR (node:Evidence) REQUIRE (node.workspaceId, node.evidenceId) IS UNIQUE",
  "CREATE CONSTRAINT import_preview_identity IF NOT EXISTS FOR (node:ImportPreview) REQUIRE (node.workspaceId, node.previewId) IS UNIQUE",
  "CREATE CONSTRAINT trace_run_identity IF NOT EXISTS FOR (node:TraceRun) REQUIRE (node.workspaceId, node.runId) IS UNIQUE",
  "CREATE CONSTRAINT external_record_identity IF NOT EXISTS FOR (node:ExternalRecord) REQUIRE (node.workspaceId, node.sourceKind, node.sourceRecordId) IS UNIQUE",
  "CREATE INDEX entity_state_part_lookup IF NOT EXISTS FOR (node:EntityState) ON (node.workspaceId, node.revisionId, node.partNumber)",
  "CREATE INDEX entity_state_location_lookup IF NOT EXISTS FOR (node:EntityState) ON (node.workspaceId, node.revisionId, node.locationState)",
  "CREATE INDEX installation_child_lookup IF NOT EXISTS FOR (node:Installation) ON (node.workspaceId, node.revisionId, node.childId)",
  "CREATE INDEX installation_parent_lookup IF NOT EXISTS FOR (node:Installation) ON (node.workspaceId, node.revisionId, node.parentId)",
  "CREATE INDEX evidence_source_lookup IF NOT EXISTS FOR (node:Evidence) ON (node.workspaceId, node.sourceKind, node.sourceRecordId)",
] as const;

export async function applySchema(): Promise<void> {
  const database = getNeo4jConfig().database;
  const driver = getNeo4jDriver();

  for (const statement of SCHEMA_STATEMENTS) {
    await driver.executeQuery(statement, {}, { database });
  }
}
