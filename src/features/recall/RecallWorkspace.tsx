"use client";
/**
 * RecallWorkspace: the EV assembly quality workspace shell. Vehicles (sketch explorer),
 * Issues, Resolutions and Team/Supplier Insights. Mock mode is announced in a persistent banner.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReferenceCatalog } from "@/contracts/issues";
import { CONTRACT_VERSION } from "@/contracts/common";
import "@/components/recall/recall.css";
import { IssueBoard } from "@/components/recall/IssueBoard";
import { IssueDetailView, type IssueDetailTab } from "@/components/recall/IssueDetail";
import { InsightsView } from "@/components/recall/InsightsView";
import { NewIssueForm } from "@/components/recall/NewIssueForm";
import { VehicleExplorer } from "@/components/recall/VehicleExplorer";
import { Banner, ErrorBanner, Loading } from "@/components/recall/primitives";
import { getDefaultClient, type RecallClient } from "./api";
import { WorkspaceContext, type NewIssuePrefill, type WorkspaceApi, type WorkspaceView } from "./context";
import { makeLookup } from "./format";

export type RecallWorkspaceProps = {
  /** Injected client (tests / integration). Defaults to env-selected live or mock client. */
  client?: RecallClient;
  initialView?: WorkspaceView;
  /** Disables the sketch zoom tween (tests). */
  instantZoom?: boolean;
};

type Route = { view: WorkspaceView; issueId: string | null; issueTab: IssueDetailTab; entityId: string | null };

const NAV: Array<{ id: WorkspaceView; label: string }> = [
  { id: "vehicles", label: "Vehicles" },
  { id: "issues", label: "Issues" },
  { id: "resolutions", label: "Resolutions" },
  { id: "insights", label: "Team & supplier insights" },
];

export function RecallWorkspace({ client, initialView = "vehicles", instantZoom = false }: RecallWorkspaceProps) {
  const c = useMemo(() => client ?? getDefaultClient(), [client]);
  const [route, setRoute] = useState<Route>({ view: initialView, issueId: null, issueTab: "overview", entityId: null });
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

  const navigate = useCallback((view: WorkspaceView) => setRoute({ view, issueId: null, issueTab: "overview", entityId: null }), []);
  const openIssue = useCallback((issueId: string, tab?: string) => setRoute({ view: "issues", issueId, issueTab: (tab as IssueDetailTab) ?? "overview", entityId: null }), []);
  const openNewIssue = useCallback((prefill?: NewIssuePrefill) => setNewIssue({ open: true, prefill }), []);
  const openEntity = useCallback((entityId: string) => setRoute({ view: "vehicles", issueId: null, issueTab: "overview", entityId }), []);

  const api: WorkspaceApi = useMemo(
    () => ({ client: c, catalog, lookup: makeLookup(catalog), view: route.view, navigate, openIssue, openNewIssue, openEntity }),
    [c, catalog, route.view, navigate, openIssue, openNewIssue, openEntity],
  );

  return (
    <WorkspaceContext.Provider value={api}>
      <div className="rrx rrx-shell">
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
            <button type="button" className="rrx-btn rrx-btn--primary rrx-btn--sm" onClick={() => openNewIssue()} data-testid="topbar-new-issue">
              + New issue
            </button>
            <span className={`rrx-badge ${c.mode === "mock" ? "rrx-badge--warning" : "rrx-badge--ok"}`} data-testid="mode-badge">
              {c.modeLabel}
            </span>
            <span className="rrx-muted rrx-small rrx-mono">{CONTRACT_VERSION}</span>
          </div>
        </header>
        <main className="rrx-main">
          {c.mode === "mock" ? (
            <div style={{ marginBottom: 12 }}>
              <Banner kind="warning">
                <strong>Sample data (mock mode).</strong> All vehicles, parts, teams, suppliers and issues on this screen are synthetic development data served from an in-memory mock. Nothing here is a real factory record. Set NEXT_PUBLIC_RECALL_UI_MOCKS=false for the integrated demo.
              </Banner>
            </div>
          ) : null}
          {catalogError ? (
            <div style={{ marginBottom: 12 }}>
              <ErrorBanner error={{ code: catalogError.code as never, message: `Reference catalog unavailable: ${catalogError.message}` }} onRetry={() => setCatalogTick((t) => t + 1)} />
            </div>
          ) : null}
          {!catalog && !catalogError ? <Loading label="Loading reference catalog" /> : null}

          {route.view === "vehicles" ? <VehicleExplorer focusEntityId={route.entityId} instantZoom={instantZoom} /> : null}
          {route.view === "issues" ? route.issueId ? <IssueDetailView issueId={route.issueId} initialTab={route.issueTab} onBack={() => navigate("issues")} /> : <IssueBoard mode="issues" /> : null}
          {route.view === "resolutions" ? <IssueBoard mode="resolutions" /> : null}
          {route.view === "insights" ? <InsightsView /> : null}
        </main>

        {newIssue.open ? (
          <div className="rrx-overlay" role="presentation">
            <div className="rrx-dialog" role="dialog" aria-modal="true" aria-label="New issue">
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
            </div>
          </div>
        ) : null}
      </div>
    </WorkspaceContext.Provider>
  );
}
