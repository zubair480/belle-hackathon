import type { ManagedTransaction } from "neo4j-driver";
import {
  CONTRACT_VERSION,
  DomainError,
  type Evidence,
  type RequestContext,
  type ReviewIssue,
} from "@/contracts/common";
import {
  TraceComparisonSchema,
  TraceRequestSchema,
  TraceResultSchema,
  type CompareTracesInput,
  type GetTraceInput,
  type RootSelector,
  type Scope,
  type TraceComparison,
  type TracePath,
  type TraceResult,
} from "@/contracts/recall";
import { canonicalJson, createId, sha256 } from "../../data/canonical";
import { executeRead, executeWrite } from "./driver";

type Entity = {
  entityId: string;
  kind: "component" | "subassembly" | "vehicle";
  partNumber: string;
  serialNumber: string;
  buildId: string | null;
  vin: string | null;
  locationState: "onsite" | "installed" | "shipped" | "quarantine" | "unknown";
  sourcingType: "supplier" | "in_house" | "unknown";
  engineeringReview: "pending" | "reviewed" | "not_recorded";
  evidenceIds: string[];
};

type Installation = {
  installationId: string;
  childId: string;
  parentId: string;
  installedAt: string;
  removedAt: string | null;
  evidenceIds: string[];
};

type OriginLink = { entityId: string; relationshipId: string; evidenceIds: string[] };
type Shipment = { vehicleId: string; customerId: string; customerName: string; shipmentId: string };
export type TraceSnapshot = {
  dataHash: string;
  entities: Entity[];
  installations: Installation[];
  rootLinks: OriginLink[];
  shipments: Shipment[];
  evidence: Evidence[];
};

type TraversalState = {
  entityId: string;
  start: number;
  end: number;
  paths: TracePath[];
};

type Traversal = { entities: Map<string, Entity>; paths: Map<string, TracePath>; incomplete: boolean };

const engineVersion = "assembly-trace-v1";
const traversalBudget = 500;

export async function runTrace(ctx: RequestContext, request: Parameters<typeof TraceRequestSchema.parse>[0]): Promise<TraceResult> {
  const parsed = TraceRequestSchema.safeParse(request);
  if (!parsed.success) throw new DomainError("VALIDATION_FAILED", "Trace request does not match the v4 contract.", parsed.error.flatten());

  const snapshot = await loadSnapshot(ctx.workspaceId, parsed.data.revisionId, parsed.data.root);
  const result = buildTraceFromSnapshot(parsed.data.revisionId, parsed.data.root, parsed.data.scope, parsed.data.incidentId, snapshot);
  const validated = TraceResultSchema.parse(result);

  await executeWrite(async (tx) => {
    await tx.run(`
      MATCH (revision:DataRevision {workspaceId: $workspaceId, revisionId: $revisionId})
      CREATE (run:TraceRun {
        workspaceId: $workspaceId, runId: $runId, revisionId: $revisionId, rootJson: $rootJson,
        scopeJson: $scopeJson, engineVersion: $engineVersion, dataHash: $dataHash, resultJson: $resultJson,
        resultHash: $resultHash, createdAt: $createdAt
      })
      MERGE (revision)-[:HAS_TRACE_RUN]->(run)
    `, {
      workspaceId: ctx.workspaceId,
      runId: validated.runId,
      revisionId: validated.revisionId,
      rootJson: JSON.stringify(validated.root),
      scopeJson: JSON.stringify(validated.scope),
      engineVersion,
      dataHash: validated.dataHash,
      resultJson: JSON.stringify(validated),
      resultHash: sha256(canonicalJson(validated)),
      createdAt: validated.createdAt,
    });
  });

  return validated;
}

export async function getTrace(ctx: RequestContext, input: GetTraceInput): Promise<TraceResult> {
  return executeRead(async (tx) => {
    const result = await tx.run(`
      MATCH (run:TraceRun {workspaceId: $workspaceId, runId: $runId})
      RETURN run.resultJson AS resultJson
    `, { workspaceId: ctx.workspaceId, runId: input.runId });
    const [record] = result.records;
    if (!record) throw new DomainError("NOT_FOUND", `Trace run ${input.runId} was not found.`);
    return TraceResultSchema.parse(JSON.parse(record.get("resultJson") as string));
  });
}

export async function compareTraces(ctx: RequestContext, input: CompareTracesInput): Promise<TraceComparison> {
  const [earlier, later] = await Promise.all([
    getTrace(ctx, { runId: input.earlierRunId }),
    getTrace(ctx, { runId: input.laterRunId }),
  ]);
  const reasons: string[] = [];
  if (canonicalJson(earlier.root) !== canonicalJson(later.root)) reasons.push("Trace roots differ.");
  if (canonicalJson(earlier.scope) !== canonicalJson(later.scope)) reasons.push("Trace scopes or configuration cutoffs differ.");
  if (earlier.engineVersion !== later.engineVersion) reasons.push("Trace counting semantics differ.");
  if (earlier.executionStatus !== "completed" || later.executionStatus !== "completed") reasons.push("An incomplete trace cannot be compared numerically.");

  const comparable = reasons.length === 0;
  const earlierVehicles = vehicleIds(earlier);
  const laterVehicles = vehicleIds(later);
  const earlierCustomers = new Set(earlier.customers.map((customer) => customer.id));
  const laterCustomers = new Set(later.customers.map((customer) => customer.id));
  const comparison = {
    earlierRunId: earlier.runId,
    laterRunId: later.runId,
    comparable,
    reasons,
    delta: comparable ? delta(earlier.counts, later.counts) : null,
    addedCurrentVehicleIds: comparable ? [...laterVehicles].filter((id) => !earlierVehicles.has(id)).sort() : [],
    removedCurrentVehicleIds: comparable ? [...earlierVehicles].filter((id) => !laterVehicles.has(id)).sort() : [],
    addedCurrentCustomerIds: comparable ? [...laterCustomers].filter((id) => !earlierCustomers.has(id)).sort() : [],
    resolvedIssueIds: comparable
      ? earlier.issues.filter((issue) => !later.issues.some((next) => next.id === issue.id)).map((issue) => issue.id).sort()
      : [],
  };
  return TraceComparisonSchema.parse(comparison);
}

async function loadSnapshot(workspaceId: string, revisionId: string, root: RootSelector): Promise<TraceSnapshot> {
  return executeRead(async (tx) => {
    const revision = await tx.run(`
      MATCH (revision:DataRevision {workspaceId: $workspaceId, revisionId: $revisionId})
      RETURN revision.dataHash AS dataHash
    `, { workspaceId, revisionId });
    const [revisionRecord] = revision.records;
    if (!revisionRecord) throw new DomainError("NOT_FOUND", `Revision ${revisionId} was not found.`);

    const [entities, installations, rootLinks, shipments, evidence] = await Promise.all([
      tx.run(`
        MATCH (state:EntityState {workspaceId: $workspaceId, revisionId: $revisionId})
        RETURN state.entityId AS entityId, state.kind AS kind, state.partNumber AS partNumber, state.serialNumber AS serialNumber,
          state.vehicleBuildId AS buildId, state.vin AS vin, state.locationState AS locationState, state.sourcingType AS sourcingType,
          state.engineeringReview AS engineeringReview, state.evidenceIds AS evidenceIds
      `, { workspaceId, revisionId }),
      tx.run(`
        MATCH (installation:Installation {workspaceId: $workspaceId, revisionId: $revisionId})
        RETURN installation.installationId AS installationId, installation.childId AS childId, installation.parentId AS parentId,
          installation.installedAt AS installedAt, installation.removedAt AS removedAt, installation.evidenceIds AS evidenceIds
      `, { workspaceId, revisionId }),
      rootLinkQuery(tx, workspaceId, revisionId, root),
      tx.run(`
        MATCH (shipment:Shipment {workspaceId: $workspaceId, revisionId: $revisionId})
        RETURN shipment.vehicleId AS vehicleId, shipment.customerId AS customerId, shipment.customerName AS customerName,
          shipment.shipmentId AS shipmentId
      `, { workspaceId, revisionId }),
      tx.run(`
        MATCH (evidence:Evidence {workspaceId: $workspaceId})
        RETURN evidence.evidenceId AS id, evidence.sourceName AS sourceName, evidence.sourceHash AS sourceHash,
          evidence.locator AS locator, evidence.text AS text, evidence.sourceKind AS sourceKind,
          evidence.sourceRecordId AS sourceRecordId, evidence.sourceUrl AS sourceUrl, evidence.retrievedAt AS retrievedAt
      `, { workspaceId }),
    ]);

    return {
      dataHash: revisionRecord.get("dataHash") as string,
      entities: entities.records.map((record) => ({
        entityId: record.get("entityId") as string,
        kind: record.get("kind") as Entity["kind"],
        partNumber: record.get("partNumber") as string,
        serialNumber: record.get("serialNumber") as string,
        buildId: (record.get("buildId") as string | null) ?? null,
        vin: (record.get("vin") as string | null) ?? null,
        locationState: record.get("locationState") as Entity["locationState"],
        sourcingType: record.get("sourcingType") as Entity["sourcingType"],
        engineeringReview: record.get("engineeringReview") as Entity["engineeringReview"],
        evidenceIds: (record.get("evidenceIds") as string[] | null) ?? [],
      })),
      installations: installations.records.map((record) => ({
        installationId: record.get("installationId") as string,
        childId: record.get("childId") as string,
        parentId: record.get("parentId") as string,
        installedAt: record.get("installedAt") as string,
        removedAt: (record.get("removedAt") as string | null) ?? null,
        evidenceIds: (record.get("evidenceIds") as string[] | null) ?? [],
      })),
      rootLinks: rootLinks.records.map((record) => ({
        entityId: record.get("entityId") as string,
        relationshipId: record.get("relationshipId") as string,
        evidenceIds: (record.get("evidenceIds") as string[] | null) ?? [],
      })),
      shipments: shipments.records.map((record) => ({
        vehicleId: record.get("vehicleId") as string,
        customerId: record.get("customerId") as string,
        customerName: record.get("customerName") as string,
        shipmentId: record.get("shipmentId") as string,
      })),
      evidence: evidence.records.map((record) => ({
        id: record.get("id") as string,
        sourceName: record.get("sourceName") as string,
        sourceHash: record.get("sourceHash") as string,
        locator: record.get("locator") as string,
        text: record.get("text") as string,
        sourceKind: record.get("sourceKind") as Evidence["sourceKind"],
        sourceRecordId: (record.get("sourceRecordId") as string | null) ?? null,
        sourceUrl: (record.get("sourceUrl") as string | null) ?? null,
        retrievedAt: (record.get("retrievedAt") as string | null) ?? null,
      })),
    };
  });
}

function rootLinkQuery(tx: ManagedTransaction, workspaceId: string, revisionId: string, root: RootSelector) {
  if (root.kind === "supplier_batch") {
    return tx.run(`
      MATCH (batch:SupplierBatch {workspaceId: $workspaceId, revisionId: $revisionId, batchId: $rootId})-[link:BATCH_HAS_COMPONENT]->(state:EntityState)
      RETURN state.entityId AS entityId, link.relationshipId AS relationshipId, batch.evidenceIds AS evidenceIds
    `, { workspaceId, revisionId, rootId: root.id });
  }
  if (root.kind === "manufacturing_lot") {
    return tx.run(`
      MATCH (lot:ManufacturingLot {workspaceId: $workspaceId, revisionId: $revisionId, lotId: $rootId})-[link:LOT_PRODUCED_COMPONENT]->(state:EntityState)
      RETURN state.entityId AS entityId, link.relationshipId AS relationshipId, lot.evidenceIds AS evidenceIds
    `, { workspaceId, revisionId, rootId: root.id });
  }
  return tx.run(`
    MATCH (state:EntityState {workspaceId: $workspaceId, revisionId: $revisionId, entityId: $rootId, kind: 'component'})
    RETURN state.entityId AS entityId, 'component:' + state.entityId AS relationshipId, state.evidenceIds AS evidenceIds
  `, { workspaceId, revisionId, rootId: root.id });
}

export function buildTraceFromSnapshot(revisionId: string, root: RootSelector, scope: Scope, incidentId: string | undefined, snapshot: TraceSnapshot): TraceResult {
  if (snapshot.rootLinks.length === 0) throw new DomainError("NOT_FOUND", `Trace root ${root.id} has no matching revision data.`);
  const entities = new Map(snapshot.entities.map((entity) => [entity.entityId, entity]));
  const start = Date.parse(scope.historyFrom);
  const cutoff = Date.parse(scope.configurationAsOf);
  const rootStates = snapshot.rootLinks.map((link) => ({
    entityId: link.entityId,
    start,
    end: cutoff + 1,
    paths: root.kind === "component_serial" ? [] : [{
      relationshipId: link.relationshipId,
      fromId: root.id,
      toId: link.entityId,
      kind: root.kind === "manufacturing_lot" ? "LOT_PRODUCED_COMPONENT" : "BATCH_HAS_COMPONENT",
      validFrom: null,
      validTo: null,
      evidenceIds: link.evidenceIds,
    } satisfies TracePath],
  }));
  const current = traverse(rootStates, snapshot.installations, entities, cutoff, null);
  const historical = traverse(rootStates, snapshot.installations, entities, cutoff, start);
  const unknownStarts = snapshot.entities
    .filter((entity) => entity.kind === "component" && entity.partNumber === scope.trackedPartNumber && entity.sourcingType === "unknown")
    .map((entity) => ({ entityId: entity.entityId, start, end: cutoff + 1, paths: [] }));
  const unknown = traverse(unknownStarts, snapshot.installations, entities, cutoff, null);

  const currentVehicles = new Set([...current.entities.values()].filter((entity) => entity.kind === "vehicle").map((entity) => entity.entityId));
  const historicalVehicles = new Set([...historical.entities.values()].filter((entity) => entity.kind === "vehicle").map((entity) => entity.entityId));
  const unresolvedVehicles = new Set([...unknown.entities.values()]
    .filter((entity) => entity.kind === "vehicle" && !currentVehicles.has(entity.entityId))
    .map((entity) => entity.entityId));
  const rows = new Map<string, Entity>();
  for (const entity of [...current.entities.values(), ...historical.entities.values(), ...unknown.entities.values()]) rows.set(entity.entityId, entity);

  const shippedVehicles = [...currentVehicles].filter((id) => rows.get(id)?.locationState === "shipped");
  const shipmentByVehicle = new Map<string, Shipment[]>();
  for (const shipment of snapshot.shipments) {
    const items = shipmentByVehicle.get(shipment.vehicleId) ?? [];
    items.push(shipment);
    shipmentByVehicle.set(shipment.vehicleId, items);
  }
  const customerIds = new Set(shippedVehicles.flatMap((id) => shipmentByVehicle.get(id)?.map((shipment) => shipment.customerId) ?? []));
  const knownPaths = [...current.paths.values(), ...historical.paths.values()];
  const allPaths = new Map([...knownPaths, ...unknown.paths.values()].map((path) => [path.relationshipId, path]));
  const selectedEvidenceIds = new Set<string>();
  for (const entity of rows.values()) entity.evidenceIds.forEach((id) => selectedEvidenceIds.add(id));
  for (const path of allPaths.values()) path.evidenceIds.forEach((id) => selectedEvidenceIds.add(id));
  const issues: ReviewIssue[] = [];
  if (unknownStarts.length > 0) {
    issues.push({ id: createId("review"), code: "UNKNOWN_ORIGIN", severity: "warning", message: "Tracked components have unknown origin evidence.", entityIds: unknownStarts.map((state) => state.entityId), evidenceIds: [] });
  }
  for (const entity of rows.values()) {
    if (entity.engineeringReview === "pending") {
      issues.push({ id: createId("review"), code: "ENGINEERING_REVIEW_PENDING", severity: "warning", message: `Engineering review is pending for ${entity.entityId}.`, entityIds: [entity.entityId], evidenceIds: entity.evidenceIds });
    }
  }
  if (current.incomplete || historical.incomplete || unknown.incomplete) {
    issues.push({ id: createId("review"), code: "TRAVERSAL_BUDGET_EXCEEDED", severity: "blocking", message: "Trace traversal reached its state budget before completion.", entityIds: [], evidenceIds: [] });
  }

  const outputRows = [...rows.values()].map((entity) => ({
    entityId: entity.entityId,
    entityKind: entity.kind,
    partNumber: entity.partNumber,
    serialNumber: entity.serialNumber,
    buildId: entity.buildId,
    vin: entity.vin,
    locationState: entity.locationState,
    customerId: entity.kind === "vehicle" ? (shipmentByVehicle.get(entity.entityId)?.[0]?.customerId ?? null) : null,
    shipmentLineIds: entity.kind === "vehicle" ? (shipmentByVehicle.get(entity.entityId)?.map((shipment) => shipment.shipmentId) ?? []) : [],
    currentContainment: current.entities.has(entity.entityId),
    historicalContainment: historical.entities.has(entity.entityId),
    hasUnresolvedEvidence: unknown.entities.has(entity.entityId),
    engineeringReview: entity.engineeringReview,
    evidenceIds: entity.evidenceIds,
    issueIds: [],
  })).sort((left, right) => left.entityId.localeCompare(right.entityId));

  return {
    contractVersion: CONTRACT_VERSION,
    runId: createId("trace"),
    revisionId,
    root,
    createdAt: new Date().toISOString(),
    engineVersion,
    dataHash: snapshot.dataHash,
    scope,
    executionStatus: current.incomplete || historical.incomplete || unknown.incomplete ? "incomplete" : "completed",
    dataCompleteness: unknownStarts.length > 0 ? "gaps_found" : "reviewed_scope",
    counts: {
      currentOnsiteVehicleCount: [...currentVehicles].filter((id) => rows.get(id)?.locationState === "onsite").length,
      currentShippedVehicleCount: shippedVehicles.length,
      currentCustomerCount: customerIds.size,
      looseCandidateComponentCount: [...current.entities.values()].filter((entity) => entity.kind === "component" && entity.locationState === "onsite").length,
      quarantinedComponentCount: [...current.entities.values()].filter((entity) => entity.kind === "component" && entity.locationState === "quarantine").length,
      historicalOnlyVehicleCount: [...historicalVehicles].filter((id) => !currentVehicles.has(id)).length,
      unresolvedOnlyVehicleCount: unresolvedVehicles.size,
    },
    rows: outputRows,
    issues,
    evidence: snapshot.evidence.filter((item) => selectedEvidenceIds.has(item.id)),
    paths: [...allPaths.values()].sort((left, right) => left.relationshipId.localeCompare(right.relationshipId)),
    customers: [...customerIds].sort().map((id) => {
      const shipment = snapshot.shipments.find((item) => item.customerId === id);
      return { id, name: shipment?.customerName ?? id };
    }),
    ...(incidentId ? { incidentId } : {}),
  };
}

function traverse(
  initial: TraversalState[],
  installations: Installation[],
  entities: Map<string, Entity>,
  cutoff: number,
  historyFrom: number | null,
): Traversal {
  const reached = new Map<string, Entity>();
  const paths = new Map<string, TracePath>();
  const queue = [...initial];
  const seen = new Set<string>();
  let incomplete = false;
  let processed = 0;

  while (queue.length > 0) {
    const state = queue.shift();
    if (!state) break;
    const entity = entities.get(state.entityId);
    if (!entity) continue;
    const key = `${state.entityId}:${state.start}:${state.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reached.set(entity.entityId, entity);
    state.paths.forEach((path) => paths.set(path.relationshipId, path));
    processed += 1;
    if (processed > traversalBudget) {
      incomplete = true;
      break;
    }

    for (const installation of installations.filter((item) => item.childId === state.entityId)) {
      const installed = Date.parse(installation.installedAt);
      const removed = installation.removedAt ? Date.parse(installation.removedAt) : Number.POSITIVE_INFINITY;
      if (historyFrom === null) {
        if (!(installed <= cutoff && cutoff < removed)) continue;
        queue.push({
          entityId: installation.parentId,
          start: state.start,
          end: state.end,
          paths: [...state.paths, installationPath(installation)],
        });
      } else {
        const nextStart = Math.max(state.start, installed, historyFrom);
        const nextEnd = Math.min(state.end, removed, cutoff + 1);
        if (nextStart >= nextEnd) continue;
        queue.push({ entityId: installation.parentId, start: nextStart, end: nextEnd, paths: [...state.paths, installationPath(installation)] });
      }
    }
  }

  return { entities: reached, paths, incomplete };
}

function installationPath(installation: Installation): TracePath {
  return {
    relationshipId: installation.installationId,
    fromId: installation.childId,
    toId: installation.parentId,
    kind: "INSTALLED_IN",
    validFrom: installation.installedAt,
    validTo: installation.removedAt,
    evidenceIds: installation.evidenceIds,
  };
}

function delta(earlier: TraceResult["counts"], later: TraceResult["counts"]): TraceComparison["delta"] {
  return {
    currentOnsiteVehicleCount: later.currentOnsiteVehicleCount - earlier.currentOnsiteVehicleCount,
    currentShippedVehicleCount: later.currentShippedVehicleCount - earlier.currentShippedVehicleCount,
    currentCustomerCount: later.currentCustomerCount - earlier.currentCustomerCount,
    looseCandidateComponentCount: later.looseCandidateComponentCount - earlier.looseCandidateComponentCount,
    quarantinedComponentCount: later.quarantinedComponentCount - earlier.quarantinedComponentCount,
    historicalOnlyVehicleCount: later.historicalOnlyVehicleCount - earlier.historicalOnlyVehicleCount,
    unresolvedOnlyVehicleCount: later.unresolvedOnlyVehicleCount - earlier.unresolvedOnlyVehicleCount,
  };
}

function vehicleIds(trace: TraceResult): Set<string> {
  return new Set(trace.rows.filter((row) => row.entityKind === "vehicle" && row.currentContainment).map((row) => row.entityId));
}
