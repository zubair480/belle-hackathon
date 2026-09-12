"use client";
/**
 * RecallWorkspace: the EV assembly quality workspace shell. Vehicles (3D sketch explorer),
 * Issues, Resolutions, Team/Supplier Insights and the assistant chat. Explorer state lives
 * here so the agent's UI actions and the screens share it. Mock mode is announced visibly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReferenceCatalog } from "@/contracts/issues";
import { CONTRACT_VERSION } from "@/contracts/common";
import "../../components/recall/recall.css";
import { AgentChat } from "../../components/recall/AgentChat";
import { IssueBoard } from "../../components/recall/IssueBoard";
import { IssueDetailView, type IssueDetailTab } from "../../components/recall/IssueDetail";
import { InsightsView } from "../../components/recall/InsightsView";
import { NewIssueForm } from "../../components/recall/NewIssueForm";
import { VehicleExplorer } from "../../components/recall/VehicleExplorer";
import { Banner, Dialog, ErrorBanner, Loading } from "../../components/recall/primitives";
import type { AgentContext, UiAction } from "../../agent/types";
import { getDefaultClient, type RecallClient } from "./api";
import { WorkspaceContext, type ExplorerState, type NewIssuePrefill, type WorkspaceApi, type WorkspaceView } from "./context";
import { makeLookup } from "./format";
import { SKETCH_VEHICLES, slotForEntityId } from "./sketches/car3d";
import { GraphView } from "../../components/recall/GraphView";
import type { BackendHealth as HealthDto, ClientResult as Result, RecallClient as ClientT } from "./api/types";

export type RecallWorkspaceProps = {
  /** Injected client (tests / integration). Defaults to env-selected live or mock client. */
  client?: RecallClient;
  initialView?: WorkspaceView;
  /** Disables the sketch zoom tween (tests). */
  instantZoom?: boolean;
  /** Start with the assistant panel open. */
  chatOpen?: boolean;
};

type Route = { view: WorkspaceView; issueId: string | null; issueTab: IssueDetailTab };

const NAV: Array<{ id: WorkspaceView; label: string }> = [
  { id: "vehicles", label: "Vehicles" },
  { id: "issues", label: "Issues" },
  { id: "resolutions", label: "Resolutions" },
  { id: "insights", label: "Team & supplier insights" },
  { id: "graph", label: "Graph" },
];

/** Mock-mode label is opt-in (NEXT_PUBLIC_RECALL_SHOW_MODE=true); the screens carry no mock/sample wording by default. */
const SHOW_MODE = process.env.NEXT_PUBLIC_RECALL_SHOW_MODE === "true";

/**
 * Backend badge (live client): reads GET /api/health and names the data source the way the server
 * reports it. A reachable HTTP route alone is not "Neo4j": the badge says "Neo4j graph" only when
 * graph services are registered and Neo4j is configured; the in-memory double is labelled as such.
 */
function BackendBadge({ client }: { client: ClientT }) {
  const [health, setHealth] = useState<Result<HealthDto> | null>(null);
  useEffect(() => {
    if (client.mode === "mock") return;
    let on = true;
    client.getHealth().then((r) => {
      if (on) setHealth(r);
    });
    return () => {
      on = false;
    };
  }, [client]);
  if (client.mode === "mock") {
    return SHOW_MODE ? <span className="rrx-badge rrx-badge--warning" data-testid="mode-badge">{client.modeLabel}</span> : null;
  }
  if (!health) return <span className="rrx-badge" data-testid="backend-badge">Checking backend</span>;
  if (!health.ok) {
    return <span className="rrx-badge rrx-badge--blocking" data-testid="backend-badge" title={`${health.error.code}: ${health.error.message}`}>Backend unreachable</span>;
  }
  const h = health.data;
  const graph = h.servicesMode === "graph" && h.servicesRegistered && h.neo4jConfigured;
  const label = graph ? "Neo4j graph" : h.servicesMode === "double" ? "Service double · demo data" : `Backend: ${h.servicesMode}${h.servicesRegistered ? "" : " (not registered)"}`;
  const title = `services=${h.servicesMode} · registered=${h.servicesRegistered ? "yes" : "no"} · Neo4j ${h.neo4jConfigured ? "configured" : "not configured"} · workspace=${h.workspaceId ?? "n/a"}`;
  return <span className={`rrx-badge ${graph ? "rrx-badge--ok" : "rrx-badge--warning"}`} data-testid="backend-badge" title={title}>{label}</span>;
}

const INITIAL_EXPLORER: ExplorerState = { vehicleBuildId: SKETCH_VEHICLES[0]!.buildId, selectedEntityId: null, markers: [], circuitId: null, wiring: false, markMode: false, cameraRequest: null };

export function RecallWorkspace({ client, initialView = "vehicles", instantZoom = false, chatOpen: chatOpenInitial = false }: RecallWorkspaceProps) {
  const c = useMemo(() => client ?? getDefaultClient(), [client]);
  const [route, setRoute] = useState<Route>({ view: initialView, issueId: null, issueTab: "overview" });
  const [explorer, setExplorerState] = useState<ExplorerState>(INITIAL_EXPLORER);
  const [chatOpen, setChatOpen] = useState(chatOpenInitial);
  const [graphFocus, setGraphFocus] = useState<string | null>(null);
  const [newIssue, setNewIssue] = useState<{ open: boolean; prefill?: NewIssuePrefill }>({ open: false });
  const [catalog, setCatalog] = useState<ReferenceCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<{ code: string; message: string } | null>(null);
  const [catalogTick, setCatalogTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCatalogError(null);
    c.getCatalog().then((r) => {
      if (cancelled) return;
      if (r.ok) setCatalog(r.data);
      else setCatalogError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [c, catalogTick]);

  const setExplorer = useCallback((patch: Partial<ExplorerState> | ((s: ExplorerState) => Partial<ExplorerState>)) => {
    setExplorerState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  }, []);
  const navigate = useCallback((view: WorkspaceView) => setRoute({ view, issueId: null, issueTab: "overview" }), []);
  const openIssue = useCallback((issueId: string, tab?: string) => setRoute({ view: "issues", issueId, issueTab: (tab as IssueDetailTab) ?? "overview" }), []);
  const openNewIssue = useCallback((prefill?: NewIssuePrefill) => setNewIssue({ open: true, prefill }), []);
  const openEntity = useCallback(
    (entityId: string) => {
      const hit = slotForEntityId(entityId);
      const vehicle = SKETCH_VEHICLES.find((v) => v.entityId === entityId || (hit && v.suffix === hit.suffix));
      setRoute({ view: "vehicles", issueId: null, issueTab: "overview" });
      setExplorer((s) => ({ vehicleBuildId: vehicle?.buildId ?? s.vehicleBuildId, selectedEntityId: vehicle && vehicle.entityId === entityId ? null : entityId }));
    },
    [setExplorer],
  );

  const applyUiActions = useCallback(
    (actions: UiAction[]) => {
      for (const a of actions) {
        switch (a.type) {
          case "select_vehicle":
            setRoute({ view: "vehicles", issueId: null, issueTab: "overview" });
            setExplorer({ vehicleBuildId: a.buildId, selectedEntityId: null, circuitId: null });
            break;
          case "focus_part":
            setRoute({ view: "vehicles", issueId: null, issueTab: "overview" });
            setExplorer((s) => {
              const hit = slotForEntityId(a.entityId);
              const v = hit ? SKETCH_VEHICLES.find((x) => x.suffix === hit.suffix) : null;
              return { vehicleBuildId: v?.buildId ?? s.vehicleBuildId, selectedEntityId: a.entityId };
            });
            break;
          case "mark":
            setExplorer((s) => ({ markers: [...s.markers, { id: `M-${Date.now().toString(36)}-${s.markers.length + 1}`, entityId: a.entityId, slot: a.slot, wireId: a.wireId, note: a.note, source: "agent", zoneId: a.zoneId ?? null, zoneLabel: a.zoneLabel ?? null }] }));
            break;
          case "clear_marks":
            setExplorer({ markers: [] });
            break;
          case "highlight_circuit":
            setRoute((r) => (r.view === "vehicles" ? r : { view: "vehicles", issueId: null, issueTab: "overview" }));
            setExplorer({ circuitId: a.circuitId, wiring: true });
            break;
          case "show_wiring":
            setExplorer({ wiring: a.on });
            break;
          case "camera":
            setExplorer((s) => ({ cameraRequest: { preset: a.preset, seq: (s.cameraRequest?.seq ?? 0) + 1 } }));
            break;
          case "focus_graph":
            // Only sets the Graph view focus; never navigates away from what the user is looking at.
            setGraphFocus(a.id);
            break;
          case "open_issue":
            openIssue(a.issueId);
            break;
          case "open_new_issue":
            setExplorerState((s) => {
              const markerIds = s.markers.map((m) => m.entityId).filter((x): x is string => Boolean(x));
              const wireIds = s.markers.map((m) => m.wireId).filter((x): x is string => Boolean(x));
              const zones = s.markers.filter((m) => m.zoneLabel).map((m) => `${m.zoneLabel} (${m.entityId})`);
              setNewIssue({ open: true, prefill: { entityIds: [...new Set([...a.entityIds, ...markerIds])], title: a.title ?? undefined, contextNote: `${a.note}${zones.length ? ` Suspected locations: ${zones.join("; ")}.` : ""}${wireIds.length ? ` Wires under suspicion: ${wireIds.join(", ")}.` : ""}` } });
              return s;
            });
            break;
          case "navigate":
            navigate(a.view);
            break;
        }
      }
    },
    [setExplorer, openIssue, navigate],
  );

  const agentContext = useCallback((): AgentContext => ({ vehicleBuildId: explorer.vehicleBuildId, selectedEntityId: explorer.selectedEntityId, view: route.view, openIssueId: route.issueId }), [explorer.vehicleBuildId, explorer.selectedEntityId, route.view, route.issueId]);

  const openGraph = useCallback((focusId: string | null) => {
    setGraphFocus(focusId);
    navigate("graph");
  }, [navigate]);
  const refreshCatalog = useCallback(() => setCatalogTick((t) => t + 1), []);
  const api: WorkspaceApi = useMemo(
    () => ({ client: c, catalog, lookup: makeLookup(catalog), view: route.view, navigate, openIssue, openNewIssue, openEntity, graphFocus, openGraph, refreshCatalog, explorer, setExplorer, applyUiActions, agentContext, chatOpen, setChatOpen }),
    [c, catalog, route.view, navigate, openIssue, openNewIssue, openEntity, graphFocus, openGraph, refreshCatalog, explorer, setExplorer, applyUiActions, agentContext, chatOpen],
  );

  return (
    <WorkspaceContext.Provider value={api}>
      <div className={`rrx rrx-shell${chatOpen ? " rrx-with-chat" : ""}`}>
        <header className="rrx-topbar">
          <div className="rrx-brand">
            <strong>RecallRadius</strong>
            <span>EV assembly quality workspace</span>
          </div>
          <nav className="rrx-nav" aria-label="Workspace">
            {NAV.map((n) => (
              <button key={n.id} type="button" aria-current={route.view === n.id ? "page" : undefined} onClick={() => navigate(n.id)} data-testid={`nav-${n.id}`}>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="rrx-topbar-right">
            <button type="button" className={`rrx-btn rrx-btn--sm${chatOpen ? "" : " rrx-btn--ghost"}`} onClick={() => setChatOpen(!chatOpen)} aria-pressed={chatOpen} data-testid="toggle-chat">
              Assistant
            </button>
            <button type="button" className="rrx-btn rrx-btn--primary rrx-btn--sm" onClick={() => openNewIssue()} data-testid="topbar-new-issue">
              + New issue
            </button>
            <BackendBadge client={c} />
            <span className="rrx-muted rrx-small rrx-mono">{CONTRACT_VERSION}</span>
          </div>
        </header>
        <main className="rrx-main">
          {catalogError ? (
            <div style={{ marginBottom: 12 }}>
              <ErrorBanner error={{ code: catalogError.code as never, message: `Reference catalog unavailable: ${catalogError.message}` }} onRetry={() => setCatalogTick((t) => t + 1)} />
            </div>
          ) : null}
          {!catalog && !catalogError ? <Loading label="Loading reference catalog" /> : null}

          {route.view === "vehicles" ? <VehicleExplorer instantZoom={instantZoom} /> : null}
          {route.view === "issues" ? route.issueId ? <IssueDetailView issueId={route.issueId} initialTab={route.issueTab} onBack={() => navigate("issues")} /> : <IssueBoard mode="issues" /> : null}
          {route.view === "resolutions" ? <IssueBoard mode="resolutions" /> : null}
          {route.view === "insights" ? <InsightsView /> : null}
          {route.view === "graph" ? <GraphView /> : null}
        </main>
        {chatOpen ? <AgentChat /> : null}

        {newIssue.open ? (
          <Dialog label="New issue" onClose={() => setNewIssue({ open: false })} wide>
              {catalog ? (
                <NewIssueForm
                  prefill={newIssue.prefill}
                  onCancel={() => setNewIssue({ open: false })}
                  onCreated={(id) => {
                    setNewIssue({ open: false });
                    openIssue(id);
                  }}
                />
              ) : (
                <div className="rrx-stack">
                  <Banner kind="error">The reference catalog (teams, stations, defect codes) is not available, so the form cannot be submitted. Retry when the backend is back.</Banner>
                  <button type="button" className="rrx-btn" onClick={() => setNewIssue({ open: false })}>
                    Close
                  </button>
                </div>
              )}
          </Dialog>
        ) : null}
      </div>
    </WorkspaceContext.Provider>
  );
}
