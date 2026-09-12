/**
 * Workspace graph read from Neo4j (Ali's lane; additive, read-only). Backs GET /api/graph. Uses
 * Zubair's driver and workspace scoping (`ws`); never writes. Unreachable graph -> BACKEND_UNAVAILABLE.
 */
import { apiFail, apiOk, DomainError, type ErrorCode } from "@/contracts/common";
import { EV_DEMO } from "@/contracts/issues";
import { openSession } from "@/server/graph/driver";
import { countKinds, GRAPH_KINDS, GRAPH_REL_TYPES, type GraphEdge, type GraphKind, type GraphNode, type WorkspaceGraph } from "../graph/model";

type Env = Record<string, string | undefined>;
type Props = Record<string, unknown>;

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const prim = (v: unknown): string | number | boolean | null => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : v === null || v === undefined ? null : Array.isArray(v) ? v.join(", ") : String(v));

function toNode(kind: GraphKind, p: Props): GraphNode {
  const id = String(p.id);
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((k) => p[k] !== undefined).map((k) => [k, prim(p[k])]));
  switch (kind) {
    case "Supplier": return { id, kind, label: str(p.name) ?? id, sub: "supplier", props: pick(["name", "active"]) };
    case "SupplierLot": return { id, kind, label: str(p.code) ?? id, sub: `supplier lot · ${str(p.partNumber) ?? ""}`, props: pick(["code", "partNumber", "supplierId"]) };
    case "MfgLot": return { id, kind, label: str(p.code) ?? id, sub: `in-house lot · ${str(p.partNumber) ?? ""}`, props: pick(["code", "partNumber", "workOrderId", "teamId", "processStepId"]) };
    case "Entity": return { id, kind, label: p.kind === "vehicle" ? String(p.buildId ?? id) : id, sub: `${str(p.kind) ?? "entity"} · ${str(p.partNumber) ?? ""}`, props: pick(["kind", "partNumber", "partRevision", "locationState", "buildId", "vin", "issuerId"]) };
    case "Customer": return { id, kind, label: str(p.name) ?? id, sub: "customer", props: pick(["name"]) };
    case "Issue": return { id, kind, label: str(p.title) ?? id, sub: `${str(p.status) ?? ""} · ${str(p.severity) ?? ""}`, props: pick(["status", "severity", "partNumber", "defectCode", "reportingTeamId", "assignedTeamId", "detectedAt", "version"]) };
    case "Cause": return { id, kind, label: `${str(p.state) ?? "cause"} · ${str(p.causeType) ?? ""}`, sub: str(p.rationale)?.slice(0, 80) ?? null, props: pick(["state", "causeType", "responsibleTeamId", "responsibleSupplierId", "rationale", "issueId"]) };
    case "Fix": return { id, kind, label: `${str(p.state) ?? "fix"} v${str(p.version) ?? "?"}`, sub: str(p.summary)?.slice(0, 80) ?? null, props: pick(["state", "summary", "version", "issueId"]) };
    case "Team": return { id, kind, label: str(p.name) ?? id, sub: "team", props: pick(["name"]) };
    case "Station": return { id, kind, label: str(p.name) ?? id, sub: "station", props: pick(["name", "areaLabel"]) };
    case "ProcessStep": return { id, kind, label: str(p.name) ?? id, sub: "process step", props: pick(["name", "areaLabel"]) };
    case "DefectCode": return { id, kind, label: str(p.name) ?? id, sub: "defect code", props: pick(["name", "family"]) };
  }
}

export async function readWorkspaceGraph(env: Env = process.env): Promise<WorkspaceGraph> {
  const ws = env.RECALL_WORKSPACE_ID ?? EV_DEMO.workspaceId;
  const session = openSession(env, "READ");
  try {
    const nodeRes = await session.run(
      `MATCH (n) WHERE n.ws = $ws AND (n:Supplier OR n:SupplierLot OR n:MfgLot OR n:Entity OR n:Customer OR n:Issue OR n:Fix OR n:Team OR n:Station OR n:ProcessStep OR n:DefectCode OR (n:Cause AND n.isCurrent = true))
       RETURN labels(n) AS labels, properties(n) AS p LIMIT 4000`,
      { ws },
    );
    const nodes: GraphNode[] = [];
    for (const r of nodeRes.records) {
      const labels = r.get("labels") as string[];
      const kind = labels.find((l): l is GraphKind => (GRAPH_KINDS as readonly string[]).includes(l));
      if (kind) nodes.push(toNode(kind, r.get("p") as Props));
    }
    const ids = new Set(nodes.map((n) => n.id));
    const edgeRes = await session.run(
      `MATCH (a)-[r]->(b) WHERE a.ws = $ws AND b.ws = $ws AND type(r) IN $types
       RETURN a.id AS from, b.id AS to, type(r) AS type, r.removedAt AS removedAt LIMIT 12000`,
      { ws, types: [...GRAPH_REL_TYPES] },
    );
    const originRes = await session.run(
      `MATCH (e:Entity {ws: $ws})-[:HAS_ORIGIN]->(:Origin)-[x:FROM_SUPPLIER_LOT|PRODUCED_IN]->(l) WHERE l.ws = $ws RETURN e.id AS from, l.id AS to, type(x) AS type LIMIT 6000`,
      { ws },
    );
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    for (const r of [...edgeRes.records, ...originRes.records]) {
      const e: GraphEdge = { from: String(r.get("from")), to: String(r.get("to")), type: String(r.get("type")), removed: r.keys.includes("removedAt") ? Boolean(r.get("removedAt")) : false };
      const key = `${e.from}|${e.type}|${e.to}|${e.removed ? 1 : 0}`;
      if (!ids.has(e.from) || !ids.has(e.to) || seen.has(key)) continue;
      seen.add(key);
      edges.push(e);
    }
    return { workspaceId: ws, source: "neo4j", nodes, edges, counts: countKinds(nodes) };
  } finally {
    await session.close();
  }
}

export async function handleGraph(): Promise<Response> {
  try {
    return Response.json(apiOk(await readWorkspaceGraph()));
  } catch (e) {
    const code: ErrorCode = e instanceof DomainError ? e.code : "BACKEND_UNAVAILABLE";
    return Response.json(apiFail(code, "Workspace graph unavailable."), { status: 503 });
  }
}
