import type { ManagedTransaction } from "neo4j-driver";
import {
  CONTRACT_VERSION,
  DomainError,
  EvidenceSchema,
  UtcIsoSchema,
  type Evidence,
  type RequestContext,
  type ReviewIssue,
} from "@/contracts/common";
import {
  IMPORT_FILE_NAMES,
  ImportInputSchema,
  type AcceptImportInput,
  type ImportInput,
  type ImportPreview,
  type LateEvidencePreviewRequest,
  type RevisionInfo,
} from "@/contracts/recall";
import { canonicalJson, createId, optional, parseCsv, parseJsonCell, sha256, type CsvRow } from "../../data/canonical";
import { executeRead, executeWrite } from "./driver";

const entityKinds = new Set(["component", "subassembly", "vehicle"]);
const locationStates = new Set(["onsite", "installed", "shipped", "quarantine", "unknown"]);
const sourcingTypes = new Set(["supplier", "in_house", "unknown"]);
const expectedFiles = Object.values(IMPORT_FILE_NAMES);

type SourcingType = "supplier" | "in_house" | "unknown";
type EntityKind = "component" | "subassembly" | "vehicle";
type LocationState = "onsite" | "installed" | "shipped" | "quarantine" | "unknown";

type EntityInput = {
  id: string;
  kind: EntityKind;
  partNumber: string;
  partRevision: string | null;
  serialNumber: string;
  displayCode: string;
  issuerId: string | null;
  locationState: LocationState;
  sourcingType: SourcingType;
  originId: string | null;
  vehicleBuildId: string | null;
  vin: string | null;
  engineeringReview: "pending" | "reviewed" | "not_recorded";
  evidence: Evidence[];
};

type SupplierBatchInput = {
  batchId: string;
  supplierId: string;
  producerOrganizationId: string;
  partNumber: string;
  partRevision: string | null;
  batchCode: string;
  evidence: Evidence[];
};

type ManufacturingLotInput = {
  lotId: string;
  producerOrganizationId: string;
  siteId: string;
  partNumber: string;
  partRevision: string | null;
  lotCode: string;
  workOrderId: string;
  manufacturingTeamId: string;
  processStepId: string;
  evidence: Evidence[];
};

type InstallationInput = {
  installationId: string;
  childId: string;
  parentId: string;
  slotId: string;
  installedAt: string;
  removedAt: string | null;
  recordedAt: string;
  evidence: Evidence[];
};

type ShipmentInput = {
  shipmentId: string;
  vehicleId: string;
  customerId: string;
  customerName: string;
  shippedAt: string;
  recordedAt: string;
  evidence: Evidence[];
};

type NormalizedImport = {
  scope: ImportInput["scope"];
  baseRevisionId: string | null;
  dataHash: string;
  sourceHashes: string[];
  entities: EntityInput[];
  batches: SupplierBatchInput[];
  manufacturingLots: ManufacturingLotInput[];
  installations: InstallationInput[];
  shipments: ShipmentInput[];
  evidence: Evidence[];
};

type StoredPreview = {
  canAccept: boolean;
  baseRevisionId: string | null;
  dataHash: string;
  normalizedJson: string;
  acceptedAt: string | null;
};

export type ImportInspection = {
  canAccept: boolean;
  issues: ReviewIssue[];
  sourceHashes: string[];
  coverage: ImportPreview["coverage"];
  dataHash: string;
};

function reviewIssue(
  code: string,
  message: string,
  entityIds: string[] = [],
  evidenceIds: string[] = [],
  severity: "warning" | "blocking" = "blocking",
): ReviewIssue {
  return { id: createId("review"), code, message, entityIds, evidenceIds, severity };
}

function required(row: CsvRow, column: string): string {
  const value = optional(row.values[column]);
  if (!value) throw new Error(`row ${row.row} requires ${column}`);
  return value;
}

function utc(row: CsvRow, column: string, nullable = false): string | null {
  const value = optional(row.values[column]);
  if (!value && nullable) return null;
  if (!value || !UtcIsoSchema.safeParse(value).success) {
    throw new Error(`row ${row.row} has invalid UTC timestamp in ${column}`);
  }
  return value;
}

function evidence(row: CsvRow): Evidence[] {
  const raw = optional(row.values.evidenceJson) ?? "[]";
  const parsed = parseJsonCell(raw, row.row, "evidenceJson");
  if (!Array.isArray(parsed)) throw new Error(`row ${row.row} evidenceJson must be an array`);

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`row ${row.row} evidenceJson item ${index + 1} must be an object`);
    }

    const source = entry as Record<string, unknown>;
    const candidate = {
      id: source.id,
      sourceName: source.sourceName,
      locator: source.locator,
      text: source.text,
      sourceKind: source.sourceKind,
      sourceRecordId: source.sourceRecordId ?? null,
      sourceUrl: source.sourceUrl ?? null,
      retrievedAt: source.retrievedAt ?? null,
    };
    const result = EvidenceSchema.safeParse({
      ...candidate,
      sourceHash: sha256(canonicalJson(candidate)),
    });
    if (!result.success) throw new Error(`row ${row.row} has invalid evidence item ${index + 1}`);
    return result.data;
  });
}

function parseEntities(rows: CsvRow[], issues: ReviewIssue[]): EntityInput[] {
  const result: EntityInput[] = [];
  for (const row of rows) {
    try {
      const kind = required(row, "kind");
      const locationState = required(row, "locationState");
      const sourcingType = required(row, "sourcingType");
      const engineeringReview = required(row, "engineeringReview");
      if (!entityKinds.has(kind)) throw new Error(`row ${row.row} has invalid kind`);
      if (!locationStates.has(locationState)) throw new Error(`row ${row.row} has invalid locationState`);
      if (!sourcingTypes.has(sourcingType)) throw new Error(`row ${row.row} has invalid sourcingType`);
      if (!new Set(["pending", "reviewed", "not_recorded"]).has(engineeringReview)) {
        throw new Error(`row ${row.row} has invalid engineeringReview`);
      }

      const entity: EntityInput = {
        id: required(row, "id"),
        kind: kind as EntityKind,
        partNumber: required(row, "partNumber"),
        partRevision: optional(row.values.partRevision),
        serialNumber: required(row, "serialNumber"),
        displayCode: required(row, "displayCode"),
        issuerId: optional(row.values.issuerId),
        locationState: locationState as LocationState,
        sourcingType: sourcingType as SourcingType,
        originId: optional(row.values.originId),
        vehicleBuildId: optional(row.values.vehicleBuildId),
        vin: optional(row.values.vin),
        engineeringReview: engineeringReview as EntityInput["engineeringReview"],
        evidence: evidence(row),
      };

      if (entity.kind === "vehicle" && !entity.vehicleBuildId) {
        throw new Error(`row ${row.row} vehicle requires vehicleBuildId`);
      }
      if (entity.kind !== "vehicle" && (entity.vehicleBuildId || entity.vin)) {
        throw new Error(`row ${row.row} only a vehicle may define vehicleBuildId or vin`);
      }
      if (entity.sourcingType === "unknown" && entity.originId) {
        throw new Error(`row ${row.row} unknown origin cannot define originId`);
      }
      if (entity.sourcingType !== "unknown" && !entity.originId) {
        throw new Error(`row ${row.row} known origin requires originId`);
      }
      result.push(entity);
    } catch (error) {
      issues.push(reviewIssue("SCHEMA_ERROR", errorMessage(error)));
    }
  }
  return result;
}

function parseBatches(rows: CsvRow[], issues: ReviewIssue[]): SupplierBatchInput[] {
  const result: SupplierBatchInput[] = [];
  for (const row of rows) {
    try {
      result.push({
        batchId: required(row, "batchId"),
        supplierId: required(row, "supplierId"),
        producerOrganizationId: required(row, "producerOrganizationId"),
        partNumber: required(row, "partNumber"),
        partRevision: optional(row.values.partRevision),
        batchCode: required(row, "batchCode"),
        evidence: evidence(row),
      });
    } catch (error) {
      issues.push(reviewIssue("SCHEMA_ERROR", errorMessage(error)));
    }
  }
  return result;
}

function parseManufacturingLots(rows: CsvRow[], issues: ReviewIssue[]): ManufacturingLotInput[] {
  const result: ManufacturingLotInput[] = [];
  for (const row of rows) {
    try {
      result.push({
        lotId: required(row, "lotId"),
        producerOrganizationId: required(row, "producerOrganizationId"),
        siteId: required(row, "siteId"),
        partNumber: required(row, "partNumber"),
        partRevision: optional(row.values.partRevision),
        lotCode: required(row, "lotCode"),
        workOrderId: required(row, "workOrderId"),
        manufacturingTeamId: required(row, "manufacturingTeamId"),
        processStepId: required(row, "processStepId"),
        evidence: evidence(row),
      });
    } catch (error) {
      issues.push(reviewIssue("SCHEMA_ERROR", errorMessage(error)));
    }
  }
  return result;
}

function parseInstallations(rows: CsvRow[], issues: ReviewIssue[]): InstallationInput[] {
  const result: InstallationInput[] = [];
  for (const row of rows) {
    try {
      const installedAt = utc(row, "installedAt") as string;
      const removedAt = utc(row, "removedAt", true);
      if (removedAt && Date.parse(removedAt) <= Date.parse(installedAt)) {
        throw new Error(`row ${row.row} removedAt must be later than installedAt`);
      }
      result.push({
        installationId: required(row, "installationId"),
        childId: required(row, "childId"),
        parentId: required(row, "parentId"),
        slotId: required(row, "slotId"),
        installedAt,
        removedAt,
        recordedAt: utc(row, "recordedAt") as string,
        evidence: evidence(row),
      });
    } catch (error) {
      issues.push(reviewIssue("SCHEMA_ERROR", errorMessage(error)));
    }
  }
  return result;
}

function parseShipments(rows: CsvRow[], issues: ReviewIssue[]): ShipmentInput[] {
  const result: ShipmentInput[] = [];
  for (const row of rows) {
    try {
      result.push({
        shipmentId: required(row, "shipmentId"),
        vehicleId: required(row, "vehicleId"),
        customerId: required(row, "customerId"),
        customerName: required(row, "customerName"),
        shippedAt: utc(row, "shippedAt") as string,
        recordedAt: utc(row, "recordedAt") as string,
        evidence: evidence(row),
      });
    } catch (error) {
      issues.push(reviewIssue("SCHEMA_ERROR", errorMessage(error)));
    }
  }
  return result;
}

function hasOverlap(left: InstallationInput, right: InstallationInput): boolean {
  const leftEnd = left.removedAt ? Date.parse(left.removedAt) : Number.POSITIVE_INFINITY;
  const rightEnd = right.removedAt ? Date.parse(right.removedAt) : Number.POSITIVE_INFINITY;
  return Date.parse(left.installedAt) < rightEnd && Date.parse(right.installedAt) < leftEnd;
}

function deduplicateCanonicalRows<T>(
  rows: T[],
  key: (row: T) => string,
  code: "AMBIGUOUS_IDENTITY" | "DUPLICATE_ROW",
  label: string,
  issues: ReviewIssue[],
): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    const previous = unique.get(id);
    if (!previous) {
      unique.set(id, row);
      continue;
    }
    if (canonicalJson(previous) !== canonicalJson(row)) {
      issues.push(reviewIssue(code, `Conflicting ${label} ${id}`));
    }
  }
  return [...unique.values()];
}

function validate(normalized: Omit<NormalizedImport, "dataHash" | "evidence" | "sourceHashes">, issues: ReviewIssue[]): Evidence[] {
  const entities = new Map<string, EntityInput>();
  const identities = new Map<string, EntityInput>();
  for (const entity of normalized.entities) {
    if (entities.has(entity.id)) issues.push(reviewIssue("AMBIGUOUS_IDENTITY", `Duplicate entity id ${entity.id}`, [entity.id]));
    entities.set(entity.id, entity);
    const identityKey = [entity.issuerId ?? "unissued", entity.partNumber, entity.serialNumber].join("\u001f");
    const previous = identities.get(identityKey);
    if (previous && previous.id !== entity.id) {
      issues.push(reviewIssue("AMBIGUOUS_IDENTITY", `Duplicate issuer, part, and serial identity for ${entity.id}`, [previous.id, entity.id]));
    }
    identities.set(identityKey, entity);
  }

  const batches = new Map(normalized.batches.map((batch) => [batch.batchId, batch]));
  const lots = new Map(normalized.manufacturingLots.map((lot) => [lot.lotId, lot]));
  if (batches.size !== normalized.batches.length) issues.push(reviewIssue("AMBIGUOUS_IDENTITY", "Duplicate supplier batch id"));
  if (lots.size !== normalized.manufacturingLots.length) issues.push(reviewIssue("AMBIGUOUS_IDENTITY", "Duplicate manufacturing lot id"));

  for (const entity of normalized.entities) {
    if (entity.sourcingType === "supplier") {
      const batch = entity.originId ? batches.get(entity.originId) : undefined;
      if (!batch) issues.push(reviewIssue("MISSING_REFERENCE", `Supplier origin is missing for ${entity.id}`, [entity.id]));
      else if (batch.partNumber !== entity.partNumber || batch.partRevision !== entity.partRevision) {
        issues.push(reviewIssue("SCHEMA_ERROR", `Supplier batch part identity conflicts with ${entity.id}`, [entity.id]));
      }
    }
    if (entity.sourcingType === "in_house") {
      const lot = entity.originId ? lots.get(entity.originId) : undefined;
      if (!lot) issues.push(reviewIssue("MISSING_REFERENCE", `Manufacturing origin is missing for ${entity.id}`, [entity.id]));
      else if (lot.partNumber !== entity.partNumber || lot.partRevision !== entity.partRevision) {
        issues.push(reviewIssue("SCHEMA_ERROR", `Manufacturing lot part identity conflicts with ${entity.id}`, [entity.id]));
      }
    }
  }

  const installationIds = new Set<string>();
  for (const installation of normalized.installations) {
    if (installationIds.has(installation.installationId)) {
      issues.push(reviewIssue("DUPLICATE_ROW", `Duplicate installation id ${installation.installationId}`));
    }
    installationIds.add(installation.installationId);
    const child = entities.get(installation.childId);
    const parent = entities.get(installation.parentId);
    if (!child || !parent) {
      issues.push(reviewIssue("MISSING_REFERENCE", `Installation ${installation.installationId} references an unknown entity`, [installation.childId, installation.parentId]));
      continue;
    }
    if (child.id === parent.id || parent.kind === "component") {
      issues.push(reviewIssue("CONFLICTING_INSTALLATION", `Installation ${installation.installationId} cannot establish physical containment`, [child.id, parent.id]));
    }
  }

  for (let index = 0; index < normalized.installations.length; index += 1) {
    const left = normalized.installations[index];
    if (!left) continue;
    for (const right of normalized.installations.slice(index + 1)) {
      if (!hasOverlap(left, right)) continue;
      if (left.childId === right.childId && left.parentId !== right.parentId) {
        issues.push(reviewIssue("CONFLICTING_INSTALLATION", `Component ${left.childId} has simultaneous physical parents`, [left.childId, left.parentId, right.parentId]));
      }
      if (left.parentId === right.parentId && left.slotId === right.slotId && left.childId !== right.childId) {
        issues.push(reviewIssue("SLOT_OVERLAP", `Slot ${left.slotId} has overlapping components`, [left.parentId, left.childId, right.childId]));
      }
    }
  }

  for (const installation of normalized.installations) {
    if (hasOverlappingPath(installation.parentId, installation.childId, installation, normalized.installations, new Set())) {
      issues.push(reviewIssue("CONFLICTING_INSTALLATION", `Installation ${installation.installationId} creates an overlapping containment cycle`, [installation.childId, installation.parentId]));
    }
  }

  const shipmentIds = new Set<string>();
  for (const shipment of normalized.shipments) {
    if (shipmentIds.has(shipment.shipmentId)) issues.push(reviewIssue("DUPLICATE_ROW", `Duplicate shipment id ${shipment.shipmentId}`));
    shipmentIds.add(shipment.shipmentId);
    const vehicle = entities.get(shipment.vehicleId);
    if (!vehicle || vehicle.kind !== "vehicle") {
      issues.push(reviewIssue("MISSING_REFERENCE", `Shipment ${shipment.shipmentId} must reference a vehicle`, [shipment.vehicleId]));
    }
  }

  const evidenceById = new Map<string, Evidence>();
  const allEvidence = [
    ...normalized.entities.flatMap((entity) => entity.evidence),
    ...normalized.batches.flatMap((batch) => batch.evidence),
    ...normalized.manufacturingLots.flatMap((lot) => lot.evidence),
    ...normalized.installations.flatMap((installation) => installation.evidence),
    ...normalized.shipments.flatMap((shipment) => shipment.evidence),
  ];
  for (const item of allEvidence) {
    const previous = evidenceById.get(item.id);
    if (previous && previous.sourceHash !== item.sourceHash) {
      issues.push(reviewIssue("AMBIGUOUS_IDENTITY", `Evidence ${item.id} has conflicting content`, [], [item.id]));
    }
    evidenceById.set(item.id, item);
  }

  return [...evidenceById.values()];
}

function hasOverlappingPath(
  currentId: string,
  targetId: string,
  candidate: InstallationInput,
  installations: InstallationInput[],
  seen: Set<string>,
): boolean {
  if (currentId === targetId) return true;
  if (seen.has(currentId)) return false;
  const nextSeen = new Set(seen).add(currentId);
  return installations
    .filter((installation) => installation.installationId !== candidate.installationId && installation.childId === currentId && hasOverlap(candidate, installation))
    .some((installation) => hasOverlappingPath(installation.parentId, targetId, candidate, installations, nextSeen));
}

function parseNormalized(input: ImportInput): { normalized: NormalizedImport; issues: ReviewIssue[]; sourceHashes: string[]; coverage: ImportPreview["coverage"] } {
  const validation = ImportInputSchema.safeParse(input);
  if (!validation.success) throw new DomainError("VALIDATION_FAILED", "Import input does not match the v4 contract.", validation.error.flatten());

  const files = new Map(validation.data.files.map((file) => [file.name, file.text]));
  const issues: ReviewIssue[] = [];
  const coverage = {
    expected: expectedFiles,
    received: [...files.keys()].sort(),
    missing: expectedFiles.filter((name) => !files.has(name)),
  };
  for (const name of coverage.missing) issues.push(reviewIssue("COVERAGE_GAP", `Missing required import file ${name}`));

  const rows = (name: string): CsvRow[] => {
    const text = files.get(name);
    if (!text) return [];
    try {
      return parseCsv(text);
    } catch (error) {
      issues.push(reviewIssue("SCHEMA_ERROR", `${name}: ${errorMessage(error)}`));
      return [];
    }
  };

  const entities = deduplicateCanonicalRows(
    parseEntities(rows(IMPORT_FILE_NAMES.entities), issues),
    (entity) => entity.id,
    "AMBIGUOUS_IDENTITY",
    "entity id",
    issues,
  );
  const batches = deduplicateCanonicalRows(
    parseBatches(rows(IMPORT_FILE_NAMES.batches), issues),
    (batch) => batch.batchId,
    "AMBIGUOUS_IDENTITY",
    "supplier batch id",
    issues,
  );
  const manufacturingLots = deduplicateCanonicalRows(
    parseManufacturingLots(rows(IMPORT_FILE_NAMES.manufacturing_lots), issues),
    (lot) => lot.lotId,
    "AMBIGUOUS_IDENTITY",
    "manufacturing lot id",
    issues,
  );
  const installations = deduplicateCanonicalRows(
    parseInstallations(rows(IMPORT_FILE_NAMES.installations), issues),
    (installation) => installation.installationId,
    "DUPLICATE_ROW",
    "installation id",
    issues,
  );
  const shipments = deduplicateCanonicalRows(
    parseShipments(rows(IMPORT_FILE_NAMES.shipments), issues),
    (shipment) => shipment.shipmentId,
    "DUPLICATE_ROW",
    "shipment id",
    issues,
  );
  const sourceHashes = validation.data.files.map((file) => sha256(file.text)).sort();
  const base = {
    scope: validation.data.scope,
    baseRevisionId: validation.data.baseRevisionId ?? null,
    entities,
    batches,
    manufacturingLots,
    installations,
    shipments,
  };
  const allEvidence = validate(base, issues);
  const { baseRevisionId: _baseRevisionId, ...canonicalImport } = base;
  const normalized: NormalizedImport = {
    ...base,
    evidence: allEvidence,
    sourceHashes,
    dataHash: sha256(canonicalJson(canonicalImport)),
  };
  return { normalized, issues, sourceHashes, coverage };
}

export function inspectImport(input: ImportInput): ImportInspection {
  const { normalized, issues, sourceHashes, coverage } = parseNormalized(input);
  return {
    canAccept: !issues.some((issue) => issue.severity === "blocking"),
    issues,
    sourceHashes,
    coverage,
    dataHash: normalized.dataHash,
  };
}

export async function previewImport(ctx: RequestContext, input: ImportInput): Promise<ImportPreview> {
  const { normalized, issues, sourceHashes, coverage } = parseNormalized(input);
  const previewId = createId("preview");
  const canAccept = !issues.some((issue) => issue.severity === "blocking");

  await executeWrite(async (tx) => {
    await write(tx, `
      MERGE (workspace:Workspace {workspaceId: $workspaceId})
      CREATE (preview:ImportPreview {
        workspaceId: $workspaceId,
        previewId: $previewId,
        baseRevisionId: $baseRevisionId,
        canAccept: $canAccept,
        acceptedAt: null,
        dataHash: $dataHash,
        normalizedJson: $normalizedJson,
        issuesJson: $issuesJson,
        sourceHashes: $sourceHashes,
        createdAt: $createdAt
      })
      MERGE (workspace)-[:HAS_PREVIEW]->(preview)
    `, {
      workspaceId: ctx.workspaceId,
      previewId,
      baseRevisionId: normalized.baseRevisionId,
      canAccept,
      dataHash: normalized.dataHash,
      normalizedJson: JSON.stringify(normalized),
      issuesJson: JSON.stringify(issues),
      sourceHashes,
      createdAt: new Date().toISOString(),
    });
  });

  return { previewId, baseRevisionId: normalized.baseRevisionId, canAccept, issues, sourceHashes, coverage };
}

export async function acceptImport(ctx: RequestContext, input: AcceptImportInput): Promise<RevisionInfo> {
  return executeWrite(async (tx) => {
    const preview = await readPreview(tx, ctx.workspaceId, input.previewId);
    if (!preview) throw new DomainError("NOT_FOUND", `Import preview ${input.previewId} was not found.`);
    if (preview.acceptedAt) throw new DomainError("DUPLICATE_ACTION", `Import preview ${input.previewId} was already accepted.`);
    if (!preview.canAccept) throw new DomainError("PREVIEW_REJECTED", `Import preview ${input.previewId} has blocking review issues.`);
    const duplicate = await readDuplicateRevision(tx, ctx.workspaceId, preview.dataHash);
    if (duplicate) throw new DomainError("DUPLICATE_ACTION", "This import content was already accepted.");
    if ((input.expectedBaseRevisionId ?? null) !== preview.baseRevisionId) {
      throw new DomainError("REVISION_MISMATCH", "The expected base revision does not match this preview.");
    }

    const head = await readCurrentRevision(tx, ctx.workspaceId);
    if (head !== preview.baseRevisionId) {
      throw new DomainError("REVISION_MISMATCH", "The workspace revision changed after this preview was created.");
    }

    const normalized = JSON.parse(preview.normalizedJson) as NormalizedImport;
    await assertEvidenceImmutability(tx, ctx.workspaceId, normalized.evidence);
    const revisionId = `rev-${preview.dataHash.slice(0, 24)}`;
    const acceptedAt = new Date().toISOString();
    await persistRevision(tx, ctx.workspaceId, revisionId, acceptedAt, normalized);
    await write(tx, `
      MATCH (preview:ImportPreview {workspaceId: $workspaceId, previewId: $previewId})
      SET preview.acceptedAt = $acceptedAt, preview.acceptedRevisionId = $revisionId
    `, { workspaceId: ctx.workspaceId, previewId: input.previewId, acceptedAt, revisionId });

    return { contractVersion: CONTRACT_VERSION, revisionId, acceptedAt, dataHash: normalized.dataHash };
  });
}

async function persistRevision(
  tx: ManagedTransaction,
  workspaceId: string,
  revisionId: string,
  acceptedAt: string,
  normalized: NormalizedImport,
): Promise<void> {
  await write(tx, `
    MERGE (workspace:Workspace {workspaceId: $workspaceId})
    CREATE (revision:DataRevision {
      workspaceId: $workspaceId, revisionId: $revisionId, dataHash: $dataHash, sourceHashes: $sourceHashes,
      acceptedAt: $acceptedAt, scopeJson: $scopeJson
    })
    MERGE (workspace)-[:HAS_REVISION]->(revision)
    SET workspace.currentRevisionId = $revisionId
  `, {
    workspaceId,
    revisionId,
    dataHash: normalized.dataHash,
    sourceHashes: normalized.sourceHashes,
    acceptedAt,
    scopeJson: JSON.stringify(normalized.scope),
  });

  await write(tx, `
    UNWIND $entities AS row
    MERGE (entity:Entity {workspaceId: $workspaceId, entityId: row.id})
      ON CREATE SET entity.identityKey = row.identityKey, entity.issuerId = row.issuerId, entity.partNumber = row.partNumber, entity.serialNumber = row.serialNumber
    CREATE (state:EntityState {
      workspaceId: $workspaceId, revisionId: $revisionId, entityId: row.id, kind: row.kind, partNumber: row.partNumber,
      partRevision: row.partRevision, serialNumber: row.serialNumber, displayCode: row.displayCode, issuerId: row.issuerId,
      locationState: row.locationState, sourcingType: row.sourcingType, originId: row.originId, vehicleBuildId: row.vehicleBuildId,
      vin: row.vin, engineeringReview: row.engineeringReview, evidenceIds: row.evidenceIds
    })
    WITH entity, state
    MATCH (revision:DataRevision {workspaceId: $workspaceId, revisionId: $revisionId})
    MERGE (revision)-[:HAS_ENTITY_STATE]->(state)
    MERGE (state)-[:OF_ENTITY]->(entity)
  `, {
    workspaceId,
    revisionId,
    entities: normalized.entities.map((entity) => ({
      ...entity,
      identityKey: [entity.issuerId ?? "unissued", entity.partNumber, entity.serialNumber].join("\u001f"),
      evidenceIds: entity.evidence.map((item) => item.id),
    })),
  });

  await write(tx, `
    UNWIND $batches AS row
    CREATE (batch:SupplierBatch {
      workspaceId: $workspaceId, revisionId: $revisionId, batchId: row.batchId, supplierId: row.supplierId,
      producerOrganizationId: row.producerOrganizationId, partNumber: row.partNumber, partRevision: row.partRevision,
      batchCode: row.batchCode, evidenceIds: row.evidenceIds
    })
    WITH batch
    MATCH (revision:DataRevision {workspaceId: $workspaceId, revisionId: $revisionId})
    MERGE (revision)-[:HAS_SUPPLIER_BATCH]->(batch)
  `, { workspaceId, revisionId, batches: normalized.batches.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $lots AS row
    CREATE (lot:ManufacturingLot {
      workspaceId: $workspaceId, revisionId: $revisionId, lotId: row.lotId, producerOrganizationId: row.producerOrganizationId,
      siteId: row.siteId, partNumber: row.partNumber, partRevision: row.partRevision, lotCode: row.lotCode,
      workOrderId: row.workOrderId, manufacturingTeamId: row.manufacturingTeamId, processStepId: row.processStepId, evidenceIds: row.evidenceIds
    })
    WITH lot
    MATCH (revision:DataRevision {workspaceId: $workspaceId, revisionId: $revisionId})
    MERGE (revision)-[:HAS_MANUFACTURING_LOT]->(lot)
  `, { workspaceId, revisionId, lots: normalized.manufacturingLots.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $evidence AS row
    MERGE (evidence:Evidence {workspaceId: $workspaceId, evidenceId: row.id})
      ON CREATE SET evidence += row
  `, { workspaceId, evidence: normalized.evidence });

  await write(tx, `
    UNWIND $entities AS row
    MATCH (state:EntityState {workspaceId: $workspaceId, revisionId: $revisionId, entityId: row.id})
    UNWIND row.evidenceIds AS evidenceId
    MATCH (evidence:Evidence {workspaceId: $workspaceId, evidenceId: evidenceId})
    MERGE (evidence)-[:SUPPORTS]->(state)
  `, { workspaceId, revisionId, entities: normalized.entities.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $batches AS row
    MATCH (batch:SupplierBatch {workspaceId: $workspaceId, revisionId: $revisionId, batchId: row.batchId})
    UNWIND row.evidenceIds AS evidenceId
    MATCH (evidence:Evidence {workspaceId: $workspaceId, evidenceId: evidenceId})
    MERGE (evidence)-[:SUPPORTS]->(batch)
  `, { workspaceId, revisionId, batches: normalized.batches.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $lots AS row
    MATCH (lot:ManufacturingLot {workspaceId: $workspaceId, revisionId: $revisionId, lotId: row.lotId})
    UNWIND row.evidenceIds AS evidenceId
    MATCH (evidence:Evidence {workspaceId: $workspaceId, evidenceId: evidenceId})
    MERGE (evidence)-[:SUPPORTS]->(lot)
  `, { workspaceId, revisionId, lots: normalized.manufacturingLots.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $entities AS row
    WITH row WHERE row.sourcingType = 'supplier'
    MATCH (state:EntityState {workspaceId: $workspaceId, revisionId: $revisionId, entityId: row.id})
    MATCH (batch:SupplierBatch {workspaceId: $workspaceId, revisionId: $revisionId, batchId: row.originId})
    MERGE (batch)-[link:BATCH_HAS_COMPONENT]->(state)
    SET link.relationshipId = 'batch:' + batch.batchId + ':' + row.id
  `, { workspaceId, revisionId, entities: normalized.entities.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $entities AS row
    WITH row WHERE row.sourcingType = 'in_house'
    MATCH (state:EntityState {workspaceId: $workspaceId, revisionId: $revisionId, entityId: row.id})
    MATCH (lot:ManufacturingLot {workspaceId: $workspaceId, revisionId: $revisionId, lotId: row.originId})
    MERGE (lot)-[link:LOT_PRODUCED_COMPONENT]->(state)
    SET link.relationshipId = 'lot:' + lot.lotId + ':' + row.id
  `, { workspaceId, revisionId, entities: normalized.entities.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $installations AS row
    CREATE (installation:Installation {
      workspaceId: $workspaceId, revisionId: $revisionId, installationId: row.installationId, childId: row.childId,
      parentId: row.parentId, slotId: row.slotId, installedAt: row.installedAt, removedAt: row.removedAt,
      recordedAt: row.recordedAt, evidenceIds: row.evidenceIds
    })
    WITH installation, row
    MATCH (child:EntityState {workspaceId: $workspaceId, revisionId: $revisionId, entityId: row.childId})
    MATCH (parent:EntityState {workspaceId: $workspaceId, revisionId: $revisionId, entityId: row.parentId})
    MATCH (revision:DataRevision {workspaceId: $workspaceId, revisionId: $revisionId})
    MERGE (revision)-[:HAS_INSTALLATION]->(installation)
    MERGE (installation)-[:INSTALLS_CHILD]->(child)
    MERGE (installation)-[:INSTALLED_INTO]->(parent)
  `, { workspaceId, revisionId, installations: normalized.installations.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $installations AS row
    MATCH (installation:Installation {workspaceId: $workspaceId, revisionId: $revisionId, installationId: row.installationId})
    UNWIND row.evidenceIds AS evidenceId
    MATCH (evidence:Evidence {workspaceId: $workspaceId, evidenceId: evidenceId})
    MERGE (evidence)-[:SUPPORTS]->(installation)
  `, { workspaceId, revisionId, installations: normalized.installations.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $shipments AS row
    CREATE (shipment:Shipment {
      workspaceId: $workspaceId, revisionId: $revisionId, shipmentId: row.shipmentId, vehicleId: row.vehicleId,
      customerId: row.customerId, customerName: row.customerName, shippedAt: row.shippedAt, recordedAt: row.recordedAt,
      evidenceIds: row.evidenceIds
    })
    WITH shipment, row
    MATCH (vehicle:EntityState {workspaceId: $workspaceId, revisionId: $revisionId, entityId: row.vehicleId})
    MATCH (revision:DataRevision {workspaceId: $workspaceId, revisionId: $revisionId})
    MERGE (revision)-[:HAS_SHIPMENT]->(shipment)
    MERGE (shipment)-[:SHIPS]->(vehicle)
  `, { workspaceId, revisionId, shipments: normalized.shipments.map(withEvidenceIds) });

  await write(tx, `
    UNWIND $shipments AS row
    MATCH (shipment:Shipment {workspaceId: $workspaceId, revisionId: $revisionId, shipmentId: row.shipmentId})
    UNWIND row.evidenceIds AS evidenceId
    MATCH (evidence:Evidence {workspaceId: $workspaceId, evidenceId: evidenceId})
    MERGE (evidence)-[:SUPPORTS]->(shipment)
  `, { workspaceId, revisionId, shipments: normalized.shipments.map(withEvidenceIds) });
}

function withEvidenceIds<T extends { evidence: Evidence[] }>(value: T): Omit<T, "evidence"> & { evidenceIds: string[] } {
  const { evidence: sourceEvidence, ...rest } = value;
  return { ...rest, evidenceIds: sourceEvidence.map((item) => item.id) };
}

export async function previewLateEvidence(ctx: RequestContext, input: LateEvidencePreviewRequest): Promise<ImportPreview> {
  const { loadLateEvidenceImport } = await import("../../data/fixture");
  return previewImport(ctx, await loadLateEvidenceImport(input.baseRevisionId));
}

async function assertEvidenceImmutability(tx: ManagedTransaction, workspaceId: string, evidence: Evidence[]): Promise<void> {
  const result = await tx.run(`
    UNWIND $evidence AS row
    MATCH (existing:Evidence {workspaceId: $workspaceId, evidenceId: row.id})
    WHERE existing.sourceHash <> row.sourceHash
    RETURN existing.evidenceId AS evidenceId
    LIMIT 1
  `, { workspaceId, evidence });
  const evidenceId = result.records[0]?.get("evidenceId") as string | undefined;
  if (evidenceId) {
    throw new DomainError("VALIDATION_FAILED", `Evidence ${evidenceId} conflicts with an accepted immutable source record.`);
  }
}

async function readPreview(tx: ManagedTransaction, workspaceId: string, previewId: string): Promise<StoredPreview | null> {
  const result = await tx.run(`
    MATCH (preview:ImportPreview {workspaceId: $workspaceId, previewId: $previewId})
    RETURN preview.canAccept AS canAccept, preview.baseRevisionId AS baseRevisionId, preview.dataHash AS dataHash,
      preview.normalizedJson AS normalizedJson, preview.acceptedAt AS acceptedAt
  `, { workspaceId, previewId });
  const [record] = result.records;
  if (!record) return null;
  return {
    canAccept: record.get("canAccept") as boolean,
    baseRevisionId: (record.get("baseRevisionId") as string | null) ?? null,
    dataHash: record.get("dataHash") as string,
    normalizedJson: record.get("normalizedJson") as string,
    acceptedAt: (record.get("acceptedAt") as string | null) ?? null,
  };
}

async function readCurrentRevision(tx: ManagedTransaction, workspaceId: string): Promise<string | null> {
  const result = await tx.run(`
    MATCH (workspace:Workspace {workspaceId: $workspaceId})
    RETURN workspace.currentRevisionId AS revisionId
  `, { workspaceId });
  const [record] = result.records;
  return record ? ((record.get("revisionId") as string | null) ?? null) : null;
}

async function readDuplicateRevision(tx: ManagedTransaction, workspaceId: string, dataHash: string): Promise<boolean> {
  const result = await tx.run(`
    MATCH (revision:DataRevision {workspaceId: $workspaceId, dataHash: $dataHash})
    RETURN revision.revisionId AS revisionId
    LIMIT 1
  `, { workspaceId, dataHash });
  return result.records.length > 0;
}

async function write(tx: ManagedTransaction, statement: string, parameters: Record<string, unknown>): Promise<void> {
  await tx.run(statement, parameters);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
