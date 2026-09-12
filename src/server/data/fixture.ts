import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTRACT_VERSION } from "@/contracts/common";
import { EV_TRACE_DEMO, IMPORT_FILE_NAMES, type ImportInput } from "@/contracts/recall";

const fixtureDirectory = join(process.cwd(), "fixtures", "ev");

async function read(name: string): Promise<string> {
  return readFile(join(fixtureDirectory, name), "utf8");
}

async function importWithEntities(entitiesName: string, baseRevisionId?: string): Promise<ImportInput> {
  const [entities, batches, manufacturingLots, installations, shipments] = await Promise.all([
    read(entitiesName),
    read(IMPORT_FILE_NAMES.batches),
    read(IMPORT_FILE_NAMES.manufacturing_lots),
    read(IMPORT_FILE_NAMES.installations),
    read(IMPORT_FILE_NAMES.shipments),
  ]);

  return {
    contractVersion: CONTRACT_VERSION,
    files: [
      { name: IMPORT_FILE_NAMES.entities, text: entities },
      { name: IMPORT_FILE_NAMES.batches, text: batches },
      { name: IMPORT_FILE_NAMES.manufacturing_lots, text: manufacturingLots },
      { name: IMPORT_FILE_NAMES.installations, text: installations },
      { name: IMPORT_FILE_NAMES.shipments, text: shipments },
    ],
    scope: EV_TRACE_DEMO.scope,
    ...(baseRevisionId ? { baseRevisionId } : {}),
  };
}

export function loadEvFixtureImport(): Promise<ImportInput> {
  return importWithEntities(IMPORT_FILE_NAMES.entities);
}

export async function loadLateEvidenceImport(baseRevisionId: string): Promise<ImportInput> {
  const input = await importWithEntities(IMPORT_FILE_NAMES.entities, baseRevisionId);
  const entities = input.files.find((file) => file.name === IMPORT_FILE_NAMES.entities);
  if (!entities) throw new Error("EV fixture is missing entities.csv");

  entities.text = entities.text.replace(
    "CONN-0099,component,CP-CONN-100,A,CONN-0099,Connector 0099,UNKNOWN,installed,unknown,,,,pending,[]",
    "CONN-0099,component,CP-CONN-100,A,CONN-0099,Connector 0099,SUP-CONNECTOR,installed,supplier,LOT-SUP-01,,,pending,\"[{\"\"id\"\":\"\"EVID-SUP-CERT-0099\"\",\"\"sourceName\"\":\"\"Late supplier certificate\"\",\"\"locator\"\":\"\"certificate-0099\"\",\"\"text\"\":\"\"Synthetic supplier certificate assigns connector 0099 to the supplier batch.\"\",\"\"sourceKind\"\":\"\"synthetic\"\"}]\"",
  );
  return input;
}
