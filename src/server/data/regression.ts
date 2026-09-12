import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTRACT_VERSION } from "@/contracts/common";
import { ASSEMBLY_REGRESSION, IMPORT_FILE_NAMES, type ImportInput } from "@/contracts/recall";

type LegacyEntity = {
  id: string;
  kind: "component" | "subassembly" | "robot";
  partNumber: string;
  partRevision: string | null;
  serialNumber: string;
  issuerId: string | null;
  batchId: string | null;
  locationState: "onsite" | "installed" | "shipped" | "quarantine";
  originEvidenceId?: string | null;
};

type LegacyInstallation = {
  id: string;
  childId: string;
  parentId: string;
  slotId: string;
  installedAt: string;
  removedAt: string | null;
  recordedAt: string;
  evidenceId: string;
};

type LegacyShipment = {
  id: string;
  unitId: string;
  customerId: string;
  shippedAt: string;
  evidenceId: string;
};

type LegacyFixture = {
  entities: Record<string, LegacyEntity>;
  batches: Record<string, { supplierId: string; partNumber: string; externalCode: string }>;
  installations: LegacyInstallation[];
  shipments: LegacyShipment[];
};

const referencePath = join(process.cwd(), "docs", "reference", "assembly", "assembly_reference_output", "fixture_revision_1.json");

function cell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function csv(headers: string[], rows: unknown[][]): string {
  return `${headers.join(",")}\n${rows.map((row) => row.map(cell).join(",")).join("\n")}\n`;
}

function evidence(id: string, text: string): string {
  return JSON.stringify([{ id, sourceName: "Legacy robotics reference", locator: id, text, sourceKind: "synthetic" }]);
}

export async function loadAssemblyRegressionImport(): Promise<ImportInput> {
  const legacy = JSON.parse(await readFile(referencePath, "utf8")) as LegacyFixture;
  const entities = Object.values(legacy.entities);
  const batches = Object.entries(legacy.batches);

  return {
    contractVersion: CONTRACT_VERSION,
    scope: ASSEMBLY_REGRESSION.scope,
    files: [
      {
        name: IMPORT_FILE_NAMES.entities,
        text: csv(
          ["id", "kind", "partNumber", "partRevision", "serialNumber", "displayCode", "issuerId", "locationState", "sourcingType", "originId", "vehicleBuildId", "vin", "engineeringReview", "evidenceJson"],
          entities.map((entity) => [
            entity.id,
            entity.kind === "robot" ? "vehicle" : entity.kind,
            entity.partNumber,
            entity.partRevision,
            entity.serialNumber,
            `Legacy ${entity.id}`,
            entity.issuerId,
            entity.locationState,
            entity.batchId ? "supplier" : "unknown",
            entity.batchId,
            entity.kind === "robot" ? entity.id : null,
            null,
            entity.batchId ? "reviewed" : "pending",
            evidence(`EVID-REG-ENTITY-${entity.id}`, `Legacy robotics reference entity ${entity.id}.`),
          ]),
        ),
      },
      {
        name: IMPORT_FILE_NAMES.batches,
        text: csv(
          ["batchId", "supplierId", "producerOrganizationId", "partNumber", "partRevision", "batchCode", "evidenceJson"],
          batches.map(([batchId, batch]) => [
            batchId,
            batch.supplierId,
            batch.supplierId,
            batch.partNumber,
            "A",
            batch.externalCode,
            evidence(`EVID-REG-BATCH-${batchId}`, `Legacy robotics reference supplier batch ${batchId}.`),
          ]),
        ),
      },
      {
        name: IMPORT_FILE_NAMES.manufacturing_lots,
        text: csv(["lotId", "producerOrganizationId", "siteId", "partNumber", "partRevision", "lotCode", "workOrderId", "manufacturingTeamId", "processStepId", "evidenceJson"], []),
      },
      {
        name: IMPORT_FILE_NAMES.installations,
        text: csv(
          ["installationId", "childId", "parentId", "slotId", "installedAt", "removedAt", "recordedAt", "evidenceJson"],
          legacy.installations.map((installation) => [
            installation.id,
            installation.childId,
            installation.parentId,
            installation.slotId,
            installation.installedAt,
            installation.removedAt,
            installation.recordedAt,
            evidence(`EVID-REG-INSTALL-${installation.id}`, `Legacy robotics reference installation ${installation.id}.`),
          ]),
        ),
      },
      {
        name: IMPORT_FILE_NAMES.shipments,
        text: csv(
          ["shipmentId", "vehicleId", "customerId", "customerName", "shippedAt", "recordedAt", "evidenceJson"],
          legacy.shipments.map((shipment) => [
            shipment.id,
            shipment.unitId,
            shipment.customerId,
            `Legacy customer ${shipment.customerId}`,
            shipment.shippedAt,
            shipment.shippedAt,
            evidence(`EVID-REG-SHIP-${shipment.id}`, `Legacy robotics reference shipment ${shipment.id}.`),
          ]),
        ),
      },
    ],
  };
}
