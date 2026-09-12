/**
 * Graph view: the recorded relationships as a force-directed diagram (suppliers, lots, parts,
 * vehicles, customers, issues, current causes, fixes, teams). Focus on any node to see its
 * neighbourhood; open issues and parts from here; add a supplier through the catalog route.
 * Layout is computed in the browser; the data is exactly what GET /api/graph returned.
 */
"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useWorkspace } from "../../features/recall/context";
import type { ClientError } from "../../features/recall/api/types";
import { adjacency, GRAPH_KINDS, nodeById, subgraph, type GraphKind, type GraphNode, type WorkspaceGraph } from "../../features/recall/graph/model";
import { Banner, ErrorBanner, KV, Loading } from "./primitives";

const KIND_STYLE: Record<GraphKind, { color: string; r: number; label: string }> = {
  Supplier: { color: "var(--rr-supplier)", r: 11, label: "Supplier" },
  SupplierLot: { color: "#4aa3d6", r: 7, label: "Supplier lot" },
  MfgLot: { color: "var(--rr-inhouse)", r: 7, label: "In-house lot" },
  Entity: { color: "#d4d4dc", r: 5, label: "Part / vehicle" },
  Customer: { color: "var(--rr-ok)", r: 10, label: "Customer" },
  Issue: { color: "var(--rr-blocking)", r: 9, label: "Issue" },
  Cause: { color: "var(--rr-unknown)", r: 6, label: "Current cause" },
  Fix: { color: "#5fd39b", r: 6, label: "Fix" },
  Team: { color: "#f0abfc", r: 8, label: "Team" },
  Station: { color: "#7a7a88", r: 5, label: "Station" },
  ProcessStep: { color: "#7a7a88", r: 5, label: "Process step" },
  DefectCode: { color: "#b0b0bb", r: 5, label: "Defect code" },
};
const DEFAULT_KINDS: GraphKind[] = ["Supplier", "SupplierLot", "MfgLot", "Entity", "Customer", "Issue", "Cause", "Fix", "Team"];
const W = 1000;
const H = 640;

type Pos = { x: number; y: number };

/** Deterministic force layout (Fruchterman-Reingold style) sized for a few hundred nodes. */
function layout(nodes: GraphNode[], edges: WorkspaceGraph["edges"], focusId: string | null): Map<string, Pos> {
  const n = nodes.length;
  const pos = new Map<string, Pos>();
  if (!n) return pos;
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let h = 2166136261;
    for (const ch of nodes[i]!.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
    const rad = 120 + ((h >>> 8) % 1000) / 1000 * 200;
    x[i] = W / 2 + Math.cos(a) * rad;
    y[i] = H / 2 + Math.sin(a) * rad;
  }
  const links = edges.map((e) => [idx.get(e.from)!, idx.get(e.to)!] as const).filter(([a, b]) => a !== undefined && b !== undefined);
  const k = Math.sqrt((W * H) / Math.max(n, 1)) * 0.55;
  const iterations = n > 250 ? 120 : 220;
  let temp = W / 8;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const focusIdx = focusId ? idx.get(focusId) : undefined;
  for (let it = 0; it < iterations; it++) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = x[i]! - x[j]!;
        let ddy = y[i]! - y[j]!;
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 1) { ddx = (Math.random() - 0.5); ddy = (Math.random() - 0.5); d2 = 1; }
        const f = (k * k) / d2;
        dx[i] = dx[i]! + ddx * f; dy[i] = dy[i]! + ddy * f;
        dx[j] = dx[j]! - ddx * f; dy[j] = dy[j]! - ddy * f;
      }
    }
    for (const [a, b] of links) {
      const ddx = x[a]! - x[b]!;
      const ddy = y[a]! - y[b]!;
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      const f = (d * d) / k / d;
      dx[a] = dx[a]! - ddx * f; dy[a] = dy[a]! - ddy * f;
      dx[b] = dx[b]! + ddx * f; dy[b] = dy[b]! + ddy * f;
    }
    for (let i = 0; i < n; i++) {
      // gravity to the centre keeps disconnected pieces on screen
      dx[i] = dx[i]! - (x[i]! - W / 2) * 0.03;
      dy[i] = dy[i]! - (y[i]! - H / 2) * 0.03;
      const d = Math.sqrt(dx[i]! * dx[i]! + dy[i]! * dy[i]!) || 1;
      const step = Math.min(d, temp);
      x[i] = x[i]! + (dx[i]! / d) * step;
      y[i] = y[i]! + (dy[i]! / d) * step;
      if (focusIdx === i) { x[i] = W / 2; y[i] = H / 2; }
      x[i] = Math.max(24, Math.min(W - 24, x[i]!));
      y[i] = Math.max(24, Math.min(H - 24, y[i]!));
    }
    temp *= 0.96;
  }
  for (let i = 0; i < n; i++) pos.set(nodes[i]!.id, { x: x[i]!, y: y[i]! });
  return pos;
}

export function GraphView() {
  const ws = useWorkspace();
  const [graph, setGraph] = useState<WorkspaceGraph | null>(null);
  const [error, setError] = useState<ClientError | null>(null);
  const [tick, setTick] = useState(0);
  const [depth, setDepth] = useState(2);
  const [kinds, setKinds] = useState<Set<GraphKind>>(new Set(DEFAULT_KINDS));
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState({ name: "", id: "" });
  const [supplierMsg, setSupplierMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const focus = ws.graphFocus;

  useEffect(() => {
    let on = true;
    setGraph(null);
    setError(null);
    ws.client.getGraph().then((r) => {
      if (!on) return;
      if (r.ok) setGraph(r.data);
      else setError(r.error);
    });
    return () => {
      on = false;
    };
  }, [ws.client, tick]);

  const view = useMemo(() => {
    if (!graph) return null;
    const base = focus && nodeById(graph, focus) ? subgraph(graph, focus, depth) : { ...graph, hops: {} as Record<string, number> };
    const nodes = base.nodes.filter((n) => kinds.has(n.kind) || n.id === focus);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = base.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes, edges, hops: base.hops, truncated: false };
  }, [graph, focus, depth, kinds]);

  const positions = useMemo(() => (view ? layout(view.nodes, view.edges, focus) : new Map<string, Pos>()), [view, focus]);
  const adj = useMemo(() => (graph ? adjacency(graph) : null), [graph]);
  const focusNode = graph && focus ? nodeById(graph, focus) : null;
  const matches = useMemo(() => {
    if (!graph || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return graph.nodes.filter((n) => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)).slice(0, 8);
  }, [graph, query]);

  const suppliers = useMemo(() => (graph ? graph.nodes.filter((n) => n.kind === "Supplier").sort((a, b) => a.label.localeCompare(b.label)) : []), [graph]);
  const supplierStats = (id: string) => {
    if (!adj || !graph) return "";
    const lots = (adj.get(id) ?? []).filter((x) => x.edge.type === "SUPPLIED_BY").length;
    const linked = (adj.get(id) ?? []).filter((x) => x.edge.type === "LINKS_SUPPLIER").length;
    const confirmed = (adj.get(id) ?? []).filter((x) => x.edge.type === "RESPONSIBLE_SUPPLIER" && nodeById(graph, x.other)?.props.state === "confirmed").length;
    return `${lots} lot(s) · ${linked} linked issue(s) · ${confirmed} confirmed cause(s)`;
  };

  const toggleKind = (k: GraphKind) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const openNode = (n: GraphNode) => {
    if (n.kind === "Issue") ws.openIssue(n.id);
    else if (n.kind === "Entity") ws.openEntity(n.id);
    else if (n.kind === "Cause" || n.kind === "Fix") { const iid = n.props.issueId; if (typeof iid === "string") ws.openIssue(iid); }
  };
  const submitSupplier = async (e: FormEvent) => {
    e.preventDefault();
    const name = newSupplier.name.trim();
    if (!name) return;
    setSupplierMsg(null);
    const r = await ws.client.upsertCatalogItem("suppliers", { name, active: true, ...(newSupplier.id.trim() ? { id: newSupplier.id.trim() } : {}) });
    if (r.ok) {
      setSupplierMsg({ kind: "ok", text: `Supplier ${r.data.id} (${r.data.name}) recorded. Link it to an issue from the New Issue form; it appears in the graph once linked or once a lot is recorded against it.` });
      setNewSupplier({ name: "", id: "" });
      ws.refreshCatalog();
      setTick((t) => t + 1);
      ws.openGraph(r.data.id);
    } else setSupplierMsg({ kind: "error", text: `${r.error.code}: ${r.error.message}` });
  };

  const hoverNode = hover && graph ? nodeById(graph, hover) : null;
  const neighboursOf = (id: string) => {
    if (!adj || !graph) return [] as Array<{ type: string; node: GraphNode; out: boolean; removed: boolean }>;
    return (adj.get(id) ?? []).map((x) => ({ type: x.edge.type, node: nodeById(graph, x.other)!, out: x.out, removed: x.edge.removed })).filter((x) => x.node);
  };

  return (
    <div className="rrx-split rrx-split--wide" data-testid="graph-view">
      <div>
        <div className="rrx-card" style={{ marginBottom: 10 }}>
          <div className="rrx-row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <strong>Recorded relationships</strong>
            {graph ? <span className="rrx-muted rrx-small">{graph.source === "neo4j" ? "Neo4j graph" : "mock store"} · {graph.nodes.length} nodes · {graph.edges.length} relationships{focusNode ? ` · showing ${view?.nodes.length ?? 0} within ${depth} hop(s) of ${focusNode.id}` : ""}</span> : null}
            <span style={{ flex: 1 }} />
            <label className="rrx-small rrx-muted">
              Depth{" "}
              <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} data-testid="graph-depth">
                {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <input className="rrx-input" style={{ width: 220 }} placeholder="Find node (id or name)" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="graph-search" />
            {focus ? <button type="button" className="rrx-btn rrx-btn--sm rrx-btn--ghost" onClick={() => ws.openGraph(null)}>Whole graph</button> : null}
          </div>
          {matches.length ? (
            <div className="rrx-chips" style={{ marginTop: 8 }}>
              {matches.map((m) => (
                <button key={m.id} type="button" className="rrx-chip" onClick={() => { ws.openGraph(m.id); setQuery(""); }}>
                  {m.kind} · {m.label} <span className="rrx-mono rrx-muted">{m.id}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="rrx-chips" style={{ marginTop: 8 }}>
            {GRAPH_KINDS.map((k) => (
              <button key={k} type="button" className="rrx-chip" aria-pressed={kinds.has(k)} style={{ opacity: kinds.has(k) ? 1 : 0.45 }} onClick={() => toggleKind(k)} data-testid={`graph-kind-${k}`}>
                <span className="rrx-legend-swatch" style={{ background: KIND_STYLE[k].color }} /> {KIND_STYLE[k].label}
              </button>
            ))}
          </div>
        </div>
        <div className="rrx-stage" style={{ position: "relative", minHeight: 420 }}>
          {error ? <ErrorBanner error={error} onRetry={() => setTick((t) => t + 1)} /> : null}
          {!graph && !error ? <Loading label="Reading the recorded graph" /> : null}
          {view ? (
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", background: "#000", borderRadius: "var(--rr-radius)" }} data-testid="graph-svg">
              {view.edges.map((e, i) => {
                const a = positions.get(e.from);
                const b = positions.get(e.to);
                if (!a || !b) return null;
                const dim = hover ? hover !== e.from && hover !== e.to : false;
                return <line key={`${e.from}-${e.type}-${e.to}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeOpacity={dim ? 0.08 : e.removed ? 0.18 : 0.35} strokeDasharray={e.removed ? "4 4" : undefined} strokeWidth={e.type === "INSTALLED_IN" ? 0.8 : 1.2}><title>{`${e.from} -${e.type}-> ${e.to}`}</title></line>;
              })}
              {view.nodes.map((n) => {
                const p = positions.get(n.id);
                if (!p) return null;
                const st = KIND_STYLE[n.kind];
                const isFocus = n.id === focus;
                const isVehicle = n.kind === "Entity" && n.props.kind === "vehicle";
                const r = isFocus ? st.r + 5 : isVehicle ? 9 : st.r;
                const showLabel = isFocus || n.kind !== "Entity" || isVehicle || view.nodes.length <= 60 || hover === n.id;
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer" }} onClick={() => ws.openGraph(n.id)} onDoubleClick={() => openNode(n)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} data-testid={`graph-node-${n.id}`}>
                    {isFocus ? <circle r={r + 6} fill="none" stroke="#fff" strokeOpacity={0.6} strokeDasharray="3 3" /> : null}
                    <circle r={r} fill={st.color} fillOpacity={n.kind === "Issue" && n.props.status === "closed" ? 0.45 : 0.95} stroke="#000" strokeWidth={1} />
                    <title>{`${n.kind}: ${n.label}\n${n.id}${n.sub ? `\n${n.sub}` : ""}`}</title>
                    {showLabel ? <text y={r + 11} textAnchor="middle" fontSize={n.kind === "Entity" ? 9 : 10} fill="#e8e8ee" style={{ pointerEvents: "none" }}>{n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label}</text> : null}
                  </g>
                );
              })}
            </svg>
          ) : null}
          {hoverNode ? (
            <div className="rrx-graph-tip" style={{ left: 12, bottom: 12, maxWidth: 420 }} data-testid="graph-hover">
              <strong>{hoverNode.kind}</strong> · {hoverNode.label} <span className="rrx-mono rrx-muted">{hoverNode.id}</span>
              {hoverNode.sub ? <div className="rrx-muted rrx-small">{hoverNode.sub}</div> : null}
              <div className="rrx-muted rrx-small">{neighboursOf(hoverNode.id).length} relationship(s) · click to focus · double-click to open</div>
            </div>
          ) : null}
        </div>
        <p className="rrx-muted rrx-small" style={{ marginTop: 8 }}>
          Every node and line is a recorded fact from the graph database; a linked supplier or producing team is context, not a confirmed cause. Confirmed causes appear as their own nodes pointing at the responsible team or supplier.
        </p>
      </div>
      <aside className="rrx-panel" aria-label="Graph focus and suppliers">
        {focusNode ? (
          <section className="rrx-card rrx-panel-section" data-testid="graph-focus">
            <div className="rrx-card-head">
              <div>
                <h3 style={{ marginBottom: 2 }}>{focusNode.label}</h3>
                <div className="rrx-muted rrx-small">{KIND_STYLE[focusNode.kind].label} · <span className="rrx-mono">{focusNode.id}</span></div>
              </div>
              {focusNode.kind === "Issue" || focusNode.kind === "Entity" || focusNode.kind === "Cause" || focusNode.kind === "Fix" ? (
                <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => openNode(focusNode)}>Open</button>
              ) : null}
            </div>
            <KV rows={Object.entries(focusNode.props).filter(([, v]) => v !== null && v !== "").slice(0, 8).map(([k, v]) => [k, String(v)])} />
            <div className="rrx-label" style={{ marginTop: 10 }}>Relationships ({neighboursOf(focusNode.id).length})</div>
            <ul className="rrx-partlist" data-testid="graph-neighbours">
              {neighboursOf(focusNode.id).slice(0, 40).map((x, i) => (
                <li key={`${x.type}-${x.node.id}-${i}`} onClick={() => ws.openGraph(x.node.id)}>
                  <span className="rrx-dot" style={{ color: KIND_STYLE[x.node.kind].color }} />
                  <span className="rrx-part-name">
                    <span className="rrx-muted rrx-small">{x.out ? `${x.type} →` : `← ${x.type}`}{x.removed ? " (removed)" : ""}</span> {x.node.label}
                  </span>
                  <span className="rrx-part-id rrx-mono">{x.node.id}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="rrx-card rrx-panel-section">
            <h3>Suppliers</h3>
            <p className="rrx-muted rrx-small">Click a supplier to see its lots, the parts made from them, the vehicles those parts sit in, the customers who received them, and every issue that links or blames it.</p>
            <ul className="rrx-partlist" data-testid="graph-suppliers">
              {suppliers.map((s) => (
                <li key={s.id} onClick={() => ws.openGraph(s.id)}>
                  <span className="rrx-dot" style={{ color: KIND_STYLE.Supplier.color }} />
                  <span className="rrx-part-name">{s.label}<div className="rrx-muted rrx-small">{supplierStats(s.id)}</div></span>
                  <span className="rrx-part-id rrx-mono">{s.id}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="rrx-card rrx-panel-section">
          <h3>Add a supplier</h3>
          <form onSubmit={submitSupplier} className="rrx-graph-form" data-testid="add-supplier">
            <label className="rrx-field">
              <span>Name</span>
              <input className="rrx-input" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} placeholder="e.g. Demo Brake Supplier" data-testid="supplier-name" />
            </label>
            <label className="rrx-field">
              <span>Id (optional)</span>
              <input className="rrx-input rrx-mono" value={newSupplier.id} onChange={(e) => setNewSupplier({ ...newSupplier, id: e.target.value })} placeholder="SUP-BRAKES" data-testid="supplier-id" />
            </label>
            <div className="rrx-row">
              <button type="submit" className="rrx-btn rrx-btn--primary rrx-btn--sm" disabled={!newSupplier.name.trim()} data-testid="supplier-save">Record supplier</button>
            </div>
            {supplierMsg ? <Banner kind={supplierMsg.kind === "ok" ? "ok" : "error"}>{supplierMsg.text}</Banner> : null}
          </form>
        </section>
      </aside>
    </div>
  );
}
