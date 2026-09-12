// @vitest-environment jsdom
/**
 * Behaviour added for the integrated run against the real routes (mocks disabled):
 * - the mode badge reads GET /api/health and names the backend (double vs Neo4j),
 * - vehicles (origin null) are labelled neutrally, never as "Unknown origin",
 * - sketch-only ids that return NOT_FOUND show an explicit "no backend record" state,
 * - the stub planner answers "which vehicles contain parts from the bracket lot of BRKT-0005" with a trace,
 * - INVALID_REFERENCE on create lists the unknown ids and offers to drop them,
 * - the URL hash round-trips the open issue and tab.
 * A mock-backed client stands in for the routes; the labels under test do not depend on the data source.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EV_DEMO } from "@/contracts/issues";
import { runStubTurn } from "../../agent/stubPlanner";
import type { ToolContext } from "../../agent/tools";
import { clientFail, clientOk, type BackendHealth, type RecallClient } from "../../features/recall/api";
import { createMockClient } from "../../features/recall/api/mockClient";
import { RecallWorkspace, parseRouteHash, routeToHash } from "../../features/recall/RecallWorkspace";

afterEach(cleanup);

const health = (over: Partial<BackendHealth> = {}): BackendHealth => ({ ok: true, contractVersion: "assembly-quality-v4", servicesMode: "double", servicesRegistered: true, aiProvider: "stub", ...over });

/** A client that behaves like the live HTTP client (mode "live", health report) but answers from the mock store. */
function liveLike(over: Partial<RecallClient> = {}) {
  const { client, controls } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
  const live: RecallClient = { ...client, mode: "live", modeLabel: "Live API", getHealth: async () => clientOk(health()), ...over };
  return { client: live, controls };
}

describe("backend mode badge", () => {
  it("labels the service double as demo data behind real routes, never as Neo4j", async () => {
    const { client } = liveLike();
    render(<RecallWorkspace client={client} initialView="issues" instantZoom />);
    const badge = await screen.findByTestId("mode-badge");
    await waitFor(() => expect(badge).toHaveTextContent("Live API · demo data (service double)"));
    expect(badge).toHaveAttribute("data-services-mode", "double");
    expect(badge).not.toHaveTextContent(/neo4j/i);
    expect(screen.getByTestId("ai-provider-badge")).toHaveTextContent("AI: stub");
    expect(screen.getByText(/Demo data \(service double\)\./).closest(".rrx-banner")).toHaveTextContent(/not Neo4j/);
    expect(screen.queryByText(/Sample data \(mock mode\)/)).not.toBeInTheDocument();
  });

  it("labels graph services as Neo4j and unwired services as an error", async () => {
    const graph = liveLike({ getHealth: async () => clientOk(health({ servicesMode: "graph", aiProvider: "none" })) });
    const g = render(<RecallWorkspace client={graph.client} initialView="issues" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("mode-badge")).toHaveTextContent("Live API · Neo4j graph services"));
    expect(screen.getByTestId("mode-badge")).toHaveAttribute("data-services-mode", "graph");
    expect(screen.queryByText(/service double/)).not.toBeInTheDocument();
    g.unmount();

    const unwired = liveLike({ getHealth: async () => clientOk(health({ servicesMode: "graph", servicesRegistered: false })) });
    const u = render(<RecallWorkspace client={unwired.client} initialView="issues" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("mode-badge")).toHaveTextContent("graph services not wired"));
    expect(screen.getByRole("alert")).toHaveTextContent(/Backend services not wired/);
    u.unmount();

    const down = liveLike({ getHealth: async () => clientFail("NETWORK", "Backend unavailable: fetch failed") });
    render(<RecallWorkspace client={down.client} initialView="issues" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("mode-badge")).toHaveTextContent("backend unreachable"));
    expect(screen.getByText(/GET \/api\/health failed/)).toBeInTheDocument();
  });

  it("keeps the mock label in mock mode without calling health", async () => {
    const { client } = createMockClient({ latencyMs: 0 });
    render(<RecallWorkspace client={client} initialView="issues" instantZoom />);
    expect(screen.getByTestId("mode-badge")).toHaveTextContent("Sample data (mock mode)");
    expect(screen.getByTestId("mode-badge")).toHaveAttribute("data-services-mode", "mock");
  });
});

describe("vehicle identity and sketch-only slots", () => {
  it("labels a vehicle with origin null neutrally: build id, VIN not assigned, no origin record", async () => {
    const base = createMockClient({ latencyMs: 0 }).client;
    const { client } = liveLike({
      getEntityContext: async (id, asOf) => {
        const r = await base.getEntityContext(id, asOf);
        // The real double returns origin: null for vehicles.
        if (r.ok && r.data.entity.kind === "vehicle") return clientOk({ ...r.data, entity: { ...r.data.entity, origin: null, vehicle: { entityId: id, buildId: id, vin: null } } });
        return r;
      },
    });
    render(<RecallWorkspace client={client} initialView="vehicles" instantZoom />);
    const card = await screen.findByTestId("vehicle-card");
    await waitFor(() => expect(within(card).getByText("Backend record")).toBeInTheDocument());
    expect(card).toHaveTextContent("VIN not assigned");
    expect(card).toHaveTextContent("none for a vehicle build");
    expect(card).not.toHaveTextContent(/Unknown origin/);
    // The vehicle build never lands in the "Unknown origin" group of parts.
    const parts = screen.getByTestId("recorded-parts");
    expect(within(parts).queryByText("DEMO-EV-005")).not.toBeInTheDocument();
  });

  it("shows an explicit no-backend-record state for a sketch-only id and marks only the vehicle when reporting from it", async () => {
    const base = createMockClient({ latencyMs: 0 }).client;
    const { client } = liveLike({
      getEntityContext: async (id, asOf) => (id === "BATT-0005" ? clientFail("NOT_FOUND", "Entity BATT-0005 does not exist.") : base.getEntityContext(id, asOf)),
    });
    render(<RecallWorkspace client={client} initialView="vehicles" instantZoom />);
    await waitFor(() => expect(screen.getByTestId("hotspot-battery-pack")).toHaveAttribute("data-record", "absent"));
    expect(screen.getByTestId("hotspot-battery-pack")).toHaveAttribute("data-sourcing", "none");
    expect(screen.getByTestId("hotspot-battery-pack")).toHaveAttribute("aria-label", expect.stringContaining("no backend record"));
    // The reliable charge-port path is loaded and coloured from the record.
    await waitFor(() => expect(screen.getByTestId("hotspot-charge-port-module")).toHaveAttribute("data-record", "recorded"));
    expect(screen.getByTestId("hotspot-charge-port-module")).toHaveAttribute("data-sourcing", "in_house");

    fireEvent.click(screen.getByTestId("hotspot-battery-pack"));
    const detail = await screen.findByTestId("part-detail");
    await waitFor(() => expect(within(detail).getByTestId("part-absent")).toBeInTheDocument());
    expect(detail).toHaveTextContent("No backend record");
    expect(detail).not.toHaveTextContent(/Manufacturing lot|Supplier batch|Unknown origin/);
    expect(screen.getByTestId("recorded-parts")).toHaveTextContent("1 no backend record");
    expect(screen.getByTestId("absent-parts")).toHaveTextContent("BATT-0005");

    fireEvent.click(within(detail).getByRole("button", { name: /Report issue on this part/ }));
    const form = await screen.findByTestId("new-issue-form");
    const chips = within(form).getByTestId("entity-chips");
    expect(chips).toHaveTextContent("DEMO-EV-005");
    expect(chips).not.toHaveTextContent("BATT-0005");
    expect((within(form).getByLabelText(/Evidence 1 text/) as HTMLTextAreaElement).value).toContain("no entity record");
  });

  it("explains INVALID_REFERENCE from the server and can drop the unknown ids", async () => {
    const { client } = liveLike({ createIssue: async () => clientFail("INVALID_REFERENCE", "One or more linked ids do not exist in this workspace.", { invalid: ["entity:BATT-0005"] }) });
    render(<RecallWorkspace client={client} initialView="issues" instantZoom />);
    fireEvent.click(await screen.findByTestId("new-issue"));
    const form = await screen.findByTestId("new-issue-form");
    fireEvent.change(within(form).getByLabelText(/Title/), { target: { value: "Battery pack rattle" } });
    const entityInput = within(form).getByLabelText(/Marked items/);
    for (const id of ["BATT-0005", "DEMO-EV-005"]) {
      fireEvent.change(entityInput, { target: { value: id } });
      fireEvent.keyDown(entityInput, { key: "Enter" });
    }
    fireEvent.click(within(form).getByTestId("submit-issue"));
    await within(form).findByRole("alert");
    expect(form).toHaveTextContent("The server has no record for: entity:BATT-0005");
    fireEvent.click(within(form).getByTestId("remove-unknown-ids"));
    const chips = within(form).getByTestId("entity-chips");
    expect(chips).toHaveTextContent("DEMO-EV-005");
    expect(chips).not.toHaveTextContent("BATT-0005");
    expect(within(form).getByLabelText(/Title/)).toHaveValue("Battery pack rattle");
  });
});

describe("stub planner against the trace route", () => {
  it("answers 'which vehicles contain parts from the bracket lot of BRKT-0005' with a trace-backed impact", async () => {
    const { client } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
    const catalog = await client.getCatalog();
    const ctx: ToolContext = { client, catalog: catalog.ok ? catalog.data : null, context: { vehicleBuildId: "DEMO-EV-005", selectedEntityId: null, view: "vehicles", openIssueId: null }, ui: [] };
    const r = await runStubTurn(ctx, { messages: [{ role: "user", content: "which vehicles contain parts from the bracket lot of BRKT-0005" }], context: ctx.context, sessionId: null });
    expect(r.toolCalls.map((t) => t.name)).toEqual(["focus_part", "list_issues_for_part", "impact_of_part"]);
    expect(r.toolCalls.find((t) => t.name === "focus_part")?.input).toEqual({ entityId: "BRKT-0005" });
    expect(r.toolCalls.every((t) => t.ok)).toBe(true);
    expect(r.reply).toContain("in-house lot DEMO-MFG-LOT-01");
    expect(r.reply).toMatch(/Vehicles currently containing parts from it: \d+/);
    expect(r.reply).toContain("no hold or customer notice is applied");
    expect(r.uiActions).toContainEqual({ type: "focus_part", entityId: "BRKT-0005", slot: "charge-bracket" });
  });

  it("switches vehicle when the named part belongs to another build", async () => {
    const { client } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
    const ctx: ToolContext = { client, catalog: null, context: { vehicleBuildId: "DEMO-EV-005", selectedEntityId: null, view: "vehicles", openIssueId: null }, ui: [] };
    const r = await runStubTurn(ctx, { messages: [{ role: "user", content: "show me WHL-0007-FR" }], context: ctx.context, sessionId: null });
    expect(r.uiActions).toContainEqual({ type: "select_vehicle", buildId: "DEMO-EV-007" });
    expect(r.uiActions).toContainEqual({ type: "focus_part", entityId: "WHL-0007-FR", slot: "wheel-FR" });
  });
});

describe("url hash routing", () => {
  it("round-trips view, issue id and tab", () => {
    expect(routeToHash({ view: "vehicles", issueId: null, issueTab: "overview" })).toBe("#/vehicles");
    expect(routeToHash({ view: "issues", issueId: EV_DEMO.priorIssueId, issueTab: "resolution" })).toBe(`#/issues/${EV_DEMO.priorIssueId}/resolution`);
    expect(parseRouteHash(`#/issues/${EV_DEMO.priorIssueId}/resolution`)).toEqual({ view: "issues", issueId: EV_DEMO.priorIssueId, issueTab: "resolution" });
    expect(parseRouteHash("#/issues/ISS-1")).toEqual({ view: "issues", issueId: "ISS-1", issueTab: "overview" });
    expect(parseRouteHash("#/insights")).toEqual({ view: "insights", issueId: null, issueTab: "overview" });
    expect(parseRouteHash("#/nope")).toBeNull();
    expect(parseRouteHash("")).toBeNull();
  });

  it("opens the issue named in the hash and writes the hash when navigating", async () => {
    const { client } = createMockClient({ latencyMs: 0 });
    window.history.replaceState(null, "", `#/issues/${EV_DEMO.priorIssueId}/resolution`);
    render(<RecallWorkspace client={client} instantZoom syncUrl />);
    const detail = await screen.findByTestId("issue-detail");
    expect(detail).toHaveTextContent(EV_DEMO.priorIssueId);
    expect(screen.getByTestId("tab-resolution")).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByTestId("nav-insights"));
    await waitFor(() => expect(window.location.hash).toBe("#/insights"));
    window.history.replaceState(null, "", window.location.pathname);
  });
});
