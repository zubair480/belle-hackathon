// @vitest-environment jsdom
/**
 * Graph view and graph-backed agent tools, driven by the mock store (same WorkspaceGraph shape as
 * the Neo4j route): focus/neighbourhood, supplier creation through the catalog route, and the
 * supplier_exposure / related_issues / create_issue tools.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EV_DEMO } from "@/contracts/issues";
import { createMockClient } from "../../features/recall/api/mockClient";
import { RecallWorkspace } from "../../features/recall";
import { adjacency, describeSubgraph, subgraph, vehiclesContaining } from "../../features/recall/graph/model";
import { runTool, type ToolContext } from "../../agent/tools";

afterEach(cleanup);

function mock() {
  return createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
}

describe("graph model", () => {
  it("builds a supplier -> lot -> part -> vehicle -> customer chain from the mock store", async () => {
    const { client } = mock();
    const g = await client.getGraph();
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.data.source).toBe("mock");
    const adj = adjacency(g.data);
    const lots = (adj.get(EV_DEMO.suppliers.connector) ?? []).filter((x) => x.edge.type === "SUPPLIED_BY");
    expect(lots.length).toBeGreaterThan(0);
    expect(vehiclesContaining(g.data, adj, EV_DEMO.entities.connector)).toContain(EV_DEMO.entities.vehicle);
    const s = subgraph(g.data, EV_DEMO.suppliers.connector, 2);
    expect(s.nodes.some((n) => n.kind === "SupplierLot")).toBe(true);
    expect(describeSubgraph(g.data, EV_DEMO.suppliers.connector, 1)).toMatch(/SUPPLIED_BY/);
  });
});

describe("graph view", () => {
  it("lists suppliers, focuses on click and records a new supplier through the catalog route", async () => {
    const { client } = mock();
    render(<RecallWorkspace client={client} initialView="graph" instantZoom />);
    const suppliers = await screen.findByTestId("graph-suppliers");
    expect(within(suppliers).getByText(/Demo Connector Supplier/)).toBeInTheDocument();
    fireEvent.click(within(suppliers).getByText(/Demo Connector Supplier/));
    const focus = await screen.findByTestId("graph-focus");
    expect(within(focus).getByText(EV_DEMO.suppliers.connector)).toBeInTheDocument();
    expect(within(screen.getByTestId("graph-neighbours")).getAllByText(/SUPPLIED_BY/).length).toBeGreaterThan(0);
    // add a supplier
    fireEvent.change(screen.getByTestId("supplier-name"), { target: { value: "Demo Brake Supplier" } });
    fireEvent.change(screen.getByTestId("supplier-id"), { target: { value: "SUP-BRAKES" } });
    fireEvent.click(screen.getByTestId("supplier-save"));
    await waitFor(() => expect(screen.getByText(/Supplier SUP-BRAKES \(Demo Brake Supplier\) recorded/)).toBeInTheDocument());
    const cat = await client.getCatalog();
    expect(cat.ok && cat.data.suppliers.some((s) => s.id === "SUP-BRAKES")).toBe(true);
  });
});

describe("graph tools", () => {
  async function ctxFor() {
    const { client } = mock();
    const catalog = await client.getCatalog();
    const ctx: ToolContext = { client, catalog: catalog.ok ? catalog.data : null, context: { vehicleBuildId: "DEMO-EV-005", selectedEntityId: null, view: "vehicles", openIssueId: null }, ui: [] };
    return { ctx, client };
  }
  it("supplier_exposure walks lots, parts, vehicles and issues and focuses the graph", async () => {
    const { ctx } = await ctxFor();
    const r = await runTool(ctx, "supplier_exposure", { query: "connector supplier" });
    expect(r.record.ok).toBe(true);
    expect(r.result.text).toMatch(/recorded lot\(s\)/);
    expect(r.result.text).toMatch(/Vehicles currently containing those parts/);
    expect(r.result.text).toMatch(/linked is not confirmed|Confirmed causes naming this supplier/);
    expect(ctx.ui).toContainEqual({ type: "focus_graph", id: EV_DEMO.suppliers.connector });
  });
  it("related_issues reports issues on the same lot and part number", async () => {
    const { ctx } = await ctxFor();
    const r = await runTool(ctx, "related_issues", { entityId: EV_DEMO.entities.bracket });
    expect(r.record.ok).toBe(true);
    expect(r.result.text).toMatch(/in-house lot|supplier lot/);
    expect(r.result.text).toMatch(/Issues on sibling parts from the same lot/);
  });
  it("customers_supplied lists distributors that received vehicles with the defect and keeps the user on screen", async () => {
    const { ctx } = await ctxFor();
    const r = await runTool(ctx, "customers_supplied", { issueId: "ISS-LAMP-002" });
    expect(r.record.ok).toBe(true);
    expect(r.result.text).toMatch(/Distributors \/ customers that received them/);
    expect(r.result.text).toMatch(/Demo Dealer North \(CUST-DEALER-N\): DEMO-EV-007/);
    expect(ctx.ui).toEqual([]);
  });
  it("create_issue saves through the issue API and opens it; unknown suppliers are refused", async () => {
    const { ctx, client } = await ctxFor();
    const bad = await runTool(ctx, "create_issue", { title: "Test", description: "desc", entityIds: [EV_DEMO.entities.connector], linkedSupplierIds: ["SUP-NOPE"] });
    expect(bad.record.ok).toBe(false);
    const r = await runTool(ctx, "create_issue", { title: "Assistant-created connector issue", description: "Pins bent on inspection", severity: "major", entityIds: [EV_DEMO.entities.connector], linkedSupplierIds: [EV_DEMO.suppliers.connector] });
    expect(r.record.ok).toBe(true);
    const id = (r.result.data as { id: string }).id;
    const detail = await client.getIssue(id);
    expect(detail.ok && detail.data.issue.status === "open" && detail.data.issue.entityIds.includes(EV_DEMO.entities.vehicle)).toBe(true);
    expect(ctx.ui).toContainEqual({ type: "open_issue", issueId: id });
    expect(r.result.text).toMatch(/context, not fault/);
  });
});
