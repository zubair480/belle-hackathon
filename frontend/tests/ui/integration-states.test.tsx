// @vitest-environment jsdom
/**
 * States that only matter once the UI runs against the real routes: the backend badge from
 * GET /api/health, sketch parts the vehicle record does not contain (no request, nothing invented),
 * a failed vehicle read (unavailable, not "not recorded"), the design-data source line and the
 * neutral vehicle-origin label. All driven through the mock client wrapped to look live.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clientFail, clientOk, type RecallClient } from "../../features/recall/api";
import { createMockClient } from "../../features/recall/api/mockClient";
import { RecallWorkspace } from "../../features/recall";

afterEach(cleanup);

function liveLike(overrides: Partial<RecallClient> = {}) {
  const { client, controls } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
  const live: RecallClient = { ...client, mode: "live", modeLabel: "Live API", ...overrides };
  return { live, controls };
}

describe("backend badge", () => {
  it("says Neo4j graph only when graph services are registered and Neo4j is configured", async () => {
    const { live } = liveLike({ getHealth: async () => clientOk({ ok: true, contractVersion: "assembly-quality-v4", servicesMode: "graph", servicesRegistered: true, neo4jConfigured: true, aiProvider: "none", workspaceId: "synthetic-ev-assembler" }) });
    render(<RecallWorkspace client={live} initialView="issues" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("backend-badge")).toHaveTextContent("Neo4j graph"));
  });
  it("labels the in-memory double as demo data", async () => {
    const { live } = liveLike({ getHealth: async () => clientOk({ ok: true, contractVersion: "assembly-quality-v4", servicesMode: "double", servicesRegistered: true, neo4jConfigured: false, aiProvider: "none", workspaceId: null }) });
    render(<RecallWorkspace client={live} initialView="issues" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("backend-badge")).toHaveTextContent("Service double · demo data"));
  });
  it("shows unreachable when health fails and never a success label", async () => {
    const { live } = liveLike({ getHealth: async () => clientFail("NETWORK", "Backend unavailable: fetch failed") });
    render(<RecallWorkspace client={live} initialView="issues" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("backend-badge")).toHaveTextContent("Backend unreachable"));
  });
  it("stays hidden in mock mode unless the opt-in flag is set", async () => {
    const { client } = createMockClient({ latencyMs: 0 });
    render(<RecallWorkspace client={client} initialView="issues" instantZoom />);
    await screen.findByTestId("nav-issues");
    expect(screen.queryByTestId("backend-badge")).toBeNull();
    expect(screen.queryByTestId("mode-badge")).toBeNull();
  });
});

describe("vehicle explorer against a partial backend record", () => {
  it("requests only parts the vehicle record contains and marks the rest as not in backend", async () => {
    const requested: string[] = [];
    const { live, controls } = liveLike();
    const base = live.getEntityContext;
    live.getEntityContext = async (id, asOf) => {
      requested.push(id);
      const r = await base(id, asOf);
      // Pretend the backend knows the vehicle but has no installations for it (like a sketch-only build).
      if (r.ok && r.data.entity.kind === "vehicle") return clientOk({ ...r.data, currentChildren: [], installations: [] });
      return r;
    };
    void controls;
    render(<RecallWorkspace client={live} initialView="vehicles" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("unrecorded-note")).toBeInTheDocument());
    // Only the vehicle itself was fetched; no request per sketch part.
    expect(requested.filter((id) => !/^DEMO-EV-/.test(id))).toEqual([]);
    expect(screen.getByTestId("unrecorded-note")).toHaveTextContent(/have no record in the backend/);
    expect(screen.queryByTestId("unavailable-note")).toBeNull();
  });
  it("reports a failed vehicle read as unavailable, not as not recorded", async () => {
    const { live } = liveLike({ getEntityContext: async () => clientFail("BACKEND_UNAVAILABLE", "Neo4j is not reachable") });
    render(<RecallWorkspace client={live} initialView="vehicles" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("unavailable-note")).toBeInTheDocument());
    expect(screen.queryByTestId("unrecorded-note")).toBeNull();
  });
  it("names the design data source and labels a vehicle without an origin record neutrally", async () => {
    const { live } = liveLike({
      getPlatformDesign: async () => clientOk({ platform: "EV-PLATFORM-1", revision: "v1", source: "neo4j", counts: { slots: 56, wires: 45, circuits: 12, connectors: 42 }, slotIds: [], wireIds: [], circuitIds: [] }),
    });
    const base = live.getEntityContext;
    // The graph seed records vehicles with `origin: null` (no final-assembly origin record).
    live.getEntityContext = async (id, asOf) => {
      const r = await base(id, asOf);
      return r.ok && r.data.entity.kind === "vehicle" ? clientOk({ ...r.data, entity: { ...r.data.entity, origin: null } }) : r;
    };
    render(<RecallWorkspace client={live} initialView="vehicles" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("design-source")).toHaveTextContent("Design data: Neo4j graph · EV-PLATFORM-1/v1 · 56 slots · 45 wires · 12 circuits"));
    // Every bundled wire is missing from that (empty) id list, and the drift is named rather than hidden.
    expect(screen.getByTestId("design-source")).toHaveTextContent(/bundled wire\(s\) missing from the graph/);
    await waitFor(() => expect(screen.getByTestId("vehicle-origin")).toHaveTextContent("Assembled here · no origin record"));
  });
  it("disables the wiring overlay when the design graph cannot be read", async () => {
    const { live } = liveLike({ getPlatformDesign: async () => clientFail("BACKEND_UNAVAILABLE", "Design graph unavailable.") });
    render(<RecallWorkspace client={live} initialView="vehicles" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("design-source")).toHaveTextContent(/Design graph unavailable \(BACKEND_UNAVAILABLE\)/));
  });
});
