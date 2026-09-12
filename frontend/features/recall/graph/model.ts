/**
 * Workspace graph as the UI and the agent see it (Ali's lane). Nodes are the recorded things in
 * Zubair's graph model (suppliers, lots, entities, customers, issues, current causes, fixes, catalog
 * items); edges are the recorded relationships. Origin nodes are collapsed into
 * Entity -FROM_SUPPLIER_LOT/PRODUCED_IN-> lot edges for readability. Pure functions only; the server
 * reads Neo4j in server/graphRead.ts and the mock builds the same shape from its store.
 */
import { z } from "zod";

export const GRAPH_KINDS = ["Supplier", "SupplierLot", "MfgLot", "Entity", "Customer", "Issue", "Cause", "Fix", "Team", "Station", "ProcessStep", "DefectCode"] as const;
export type GraphKind = (typeof GRAPH_KINDS)[number];

export const GraphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(GRAPH_KINDS),
  label: z.string(),
  sub: z.string().nullable(),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export const GraphEdgeSchema = z.object({ from: z.string(), to: z.string(), type: z.string(), removed: z.boolean().default(false) });
export const WorkspaceGraphSchema = z.object({
  workspaceId: z.string().nullable(),
  source: z.enum(["neo4j", "mock"]),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  counts: z.record(z.string(), z.number()),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type WorkspaceGraph = z.infer<typeof WorkspaceGraphSchema>;

/** Relationship types the graph carries, in the direction they are stored. */
export const GRAPH_REL_TYPES = ["SUPPLIED_BY", "MADE_BY", "FROM_SUPPLIER_LOT", "PRODUCED_IN", "INSTALLED_IN", "SHIPPED_TO", "AFFECTS", "LINKS_SUPPLIER", "REPORTED_BY", "ASSIGNED_TO", "DETECTED_AT", "AT_STEP", "HAS_DEFECT", "ASSESSES", "RESPONSIBLE_TEAM", "RESPONSIBLE_SUPPLIER", "CAUSAL_STATION", "CAUSAL_STEP", "FIXES", "DERIVED_FROM"] as const;

export type Adjacency = Map<string, Array<{ edge: GraphEdge; other: string; out: boolean }>>;

export function adjacency(g: WorkspaceGraph): Adjacency {
  const adj: Adjacency = new Map();
  const push = (id: string, item: { edge: GraphEdge; other: string; out: boolean }) => adj.set(id, [...(adj.get(id) ?? []), item]);
  for (const e of g.edges) {
    push(e.from, { edge: e, other: e.to, out: true });
    push(e.to, { edge: e, other: e.from, out: false });
  }
  return adj;
}

/** Undirected breadth-first neighbourhood of `focusId` up to `depth` hops; the whole graph when focus is null. */
export function subgraph(g: WorkspaceGraph, focusId: string | null, depth: number): WorkspaceGraph & { hops: Record<string, number> } {
  if (!focusId) return { ...g, hops: {} };
  const adj = adjacency(g);
  const hops: Record<string, number> = { [focusId]: 0 };
  let frontier = [focusId];
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const { other } of adj.get(id) ?? []) if (hops[other] === undefined) { hops[other] = d; next.push(other); }
    frontier = next;
  }
  const keep = new Set(Object.keys(hops));
  const nodes = g.nodes.filter((n) => keep.has(n.id));
  const edges = g.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  return { ...g, nodes, edges, counts: countKinds(nodes), hops };
}

export function countKinds(nodes: GraphNode[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const n of nodes) c[n.kind] = (c[n.kind] ?? 0) + 1;
  return c;
}

export function nodeById(g: WorkspaceGraph, id: string): GraphNode | undefined {
  return g.nodes.find((n) => n.id === id);
}

/** Vehicles that currently contain `entityId` (following INSTALLED_IN up to 6 levels, active edges only). */
export function vehiclesContaining(g: WorkspaceGraph, adj: Adjacency, entityId: string): string[] {
  const out = new Set<string>();
  const seen = new Set<string>([entityId]);
  let frontier = [entityId];
  for (let i = 0; i < 6 && frontier.length; i++) {
    const next: string[] = [];
    for (const id of frontier) for (const { edge, other, out: isOut } of adj.get(id) ?? []) {
      if (edge.type !== "INSTALLED_IN" || !isOut || edge.removed || seen.has(other)) continue;
      seen.add(other);
      if (nodeById(g, other)?.props.kind === "vehicle") out.add(other);
      else next.push(other);
    }
    frontier = next;
  }
  return [...out];
}

/** Text rendering of a neighbourhood for the agent: one line per edge, nearest hops first. */
export function describeSubgraph(g: WorkspaceGraph, focusId: string, depth: number, limit = 60): string {
  const s = subgraph(g, focusId, depth);
  const focus = nodeById(g, focusId);
  if (!focus) return `${focusId} is not in the recorded graph.`;
  const name = (id: string) => {
    const n = nodeById(g, id);
    return n ? `${n.label} [${n.kind} ${n.id}]` : id;
  };
  const lines = s.edges
    .map((e) => ({ e, hop: Math.min(s.hops[e.from] ?? 99, s.hops[e.to] ?? 99) }))
    .sort((a, b) => a.hop - b.hop)
    .slice(0, limit)
    .map(({ e }) => `${name(e.from)} -${e.type}${e.removed ? " (removed)" : ""}-> ${name(e.to)}`);
  const more = s.edges.length > limit ? `\n... ${s.edges.length - limit} more relationship(s)` : "";
  return `${focus.label} [${focus.kind} ${focus.id}]: ${s.nodes.length - 1} connected node(s) within ${depth} hop(s) (${Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(", ")}).\n${lines.join("\n")}${more}`;
}
