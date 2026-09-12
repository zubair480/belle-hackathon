// @vitest-environment jsdom
/**
 * Agent harness tests: the deterministic stub planner drives the same tools the Qoder planner
 * gets, and the workspace applies its UI actions (zoom, markers, wiring, issue drafts).
 * These do not exercise the Qoder Agent SDK itself (no credential in tests).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { runStubTurn } from "../../agent/stubPlanner";
import { ALL_TOOLS, runTool, type ToolContext } from "../../agent/tools";
import { AgentChatResponseSchema } from "../../agent/types";
import { createMockClient } from "../../features/recall/api/mockClient";
import { RecallWorkspace } from "../../features/recall";
import { searchParts, slotsForCircuit } from "../../features/recall/sketches/car3d";

afterEach(cleanup);

async function ctxFor(vehicle = "DEMO-EV-005"): Promise<ToolContext> {
  const { client } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
  const catalog = await client.getCatalog();
  return { client, catalog: catalog.ok ? catalog.data : null, context: { vehicleBuildId: vehicle, selectedEntityId: null, view: "vehicles", openIssueId: null }, ui: [] };
}

describe("part search and circuits", () => {
  it("resolves sides and synonyms: 'right front tire' is the front right wheel", () => {
    expect(searchParts("the right front tire has an issue")[0]?.slot.slot).toBe("wheel-FR");
    expect(searchParts("left headlight")[0]?.slot.slot).toBe("headlamp-L");
    expect(searchParts("ignition switch")[0]?.slot.slot).toBe("start-switch");
    expect(searchParts("engine")[0]?.slot.slot).toBe("front-drive-unit");
    expect(slotsForCircuit("C-START").map((p) => p.slot)).toEqual(expect.arrayContaining(["fuse-box", "start-switch", "bcm", "vcu", "hv-junction", "lv-harness-cabin"]));
  });
});

describe("stub planner tool loop", () => {
  it("zooms to the tire, lists its issue and returns a schema-valid response", async () => {
    const ctx = await ctxFor();
    const r = await runStubTurn(ctx, { messages: [{ role: "user", content: "The right front tire has an issue" }], context: ctx.context, sessionId: null });
    expect(AgentChatResponseSchema.safeParse(r).success).toBe(true);
    expect(r.provider.mode).toBe("stub");
    expect(r.toolCalls.map((t) => t.name)).toEqual(["focus_part", "list_issues_for_part"]);
    expect(r.uiActions).toContainEqual({ type: "focus_part", entityId: "WHL-0005-FR", slot: "wheel-FR" });
    expect(r.reply).toContain("Front right wheel and tire (WHL-0005-FR");
    expect(r.reply).toContain("Bought from Demo Wheel and Tire Supplier");
    expect(r.reply).toContain("ISS-TIRE-007");
  });

  it("traces the ignition circuit on DEMO-EV-007, highlights it and reports the open no-wake issue", async () => {
    const ctx = await ctxFor();
    const r = await runStubTurn(ctx, { messages: [{ role: "user", content: "Ignition does not respond on DEMO-EV-007" }], context: ctx.context, sessionId: null });
    expect(r.toolCalls.map((t) => t.name)).toEqual(["select_vehicle", "trace_circuit"]);
    expect(r.uiActions).toContainEqual({ type: "select_vehicle", buildId: "DEMO-EV-007" });
    expect(r.uiActions).toContainEqual({ type: "highlight_circuit", circuitId: "C-START" });
    expect(r.uiActions).toContainEqual({ type: "focus_part", entityId: "STSW-0007", slot: "start-switch" });
    expect(r.reply).toContain("W-011");
    expect(r.reply).toContain("X-BCM-A");
    expect(r.reply).toContain("ISS-IGN-006");
  });

  it("reports which businesses received parts from the same connector batch", async () => {
    const ctx = await ctxFor();
    const r = await runStubTurn(ctx, { messages: [{ role: "user", content: "Who did we supply with the charge connector from this batch?" }], context: ctx.context, sessionId: null });
    expect(r.toolCalls.map((t) => t.name)).toContain("impact_of_part");
    expect(r.reply).toContain("supplier batch DEMO-SUP-LOT-01");
    expect(r.reply).toContain("Demo Fleet Operator A (DEMO-EV-002, DEMO-EV-003)");
    expect(r.reply).toContain("no hold or customer notice is applied");
  });

  it("marks parts and wires and opens an issue draft without saving anything", async () => {
    const ctx = await ctxFor();
    const before = (await ctx.client.listIssues({})).ok ? 1 : 0;
    const r1 = await runStubTurn(ctx, { messages: [{ role: "user", content: "Circle the mounting bracket" }], context: ctx.context, sessionId: null });
    expect(r1.uiActions).toContainEqual({ type: "mark", entityId: "BRKT-0005", slot: "charge-bracket", wireId: null, note: expect.any(String) });
    const ctx2 = await ctxFor();
    const r2 = await runStubTurn(ctx2, { messages: [{ role: "user", content: "mark the ignition wiring" }], context: ctx2.context, sessionId: null });
    expect(r2.uiActions.filter((a) => a.type === "mark" && a.wireId).length).toBeGreaterThan(3);
    const ctx3 = await ctxFor();
    ctx3.context.selectedEntityId = "BRKT-0005";
    const r3 = await runStubTurn(ctx3, { messages: [{ role: "user", content: "open an issue for this" }], context: ctx3.context, sessionId: null });
    expect(r3.uiActions.some((a) => a.type === "open_new_issue" && a.entityIds.includes("BRKT-0005") && a.entityIds.includes("DEMO-EV-005"))).toBe(true);
    const after = await ctx3.client.listIssues({});
    expect(after.ok && after.data.total).toBe(8);
    expect(before).toBe(1);
  });

  it("every tool rejects invalid input without throwing", async () => {
    const ctx = await ctxFor();
    for (const t of ALL_TOOLS) {
      const r = await runTool(ctx, t.name, { preset: 42, issueId: 7, query: null, buildId: 3 });
      expect(typeof r.result.text).toBe("string");
    }
    const unknown = await runTool(ctx, "nope", {});
    expect(unknown.record.ok).toBe(false);
  });
});

describe("workspace + chat integration", () => {
  function mount() {
    const { client, controls } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
    render(<RecallWorkspace client={client} instantZoom chatOpen />);
    return { client, controls };
  }

  it("chat message zooms the 3D sketch onto the tire and shows the tool chips", async () => {
    mount();
    const chat = await screen.findByTestId("agent-chat");
    fireEvent.change(within(chat).getByTestId("chat-input"), { target: { value: "the right front tire has an issue" } });
    fireEvent.click(within(chat).getByTestId("chat-send"));
    await within(chat).findByTestId("toolcall-focus_part");
    expect(within(chat).getByTestId("toolcall-list_issues_for_part")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("hotspot-wheel-FR")).toHaveAttribute("data-selected", "true"));
    expect(screen.getByTestId("vehicle-sketch")).toHaveAttribute("data-zoomed", "true");
    const panel = await screen.findByTestId("part-detail");
    expect(within(panel).getByText("Front right wheel and tire")).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByTestId("part-issue-ISS-TIRE-007")).toBeInTheDocument());
  });

  it("ignition question switches vehicle, shows wiring with the start circuit highlighted", async () => {
    mount();
    const chat = await screen.findByTestId("agent-chat");
    fireEvent.change(within(chat).getByTestId("chat-input"), { target: { value: "Ignition does not respond on DEMO-EV-007" } });
    fireEvent.click(within(chat).getByTestId("chat-send"));
    await within(chat).findByTestId("toolcall-trace_circuit");
    await waitFor(() => expect(screen.getByRole("tab", { name: /DEMO-EV-007/ })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByTestId("circuit-select")).toHaveValue("C-START");
    expect(screen.getByTestId("wire-W-011")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("wire-W-020")).toHaveAttribute("data-active", "false");
    await waitFor(() => expect(screen.getByTestId("hotspot-start-switch")).toHaveAttribute("data-selected", "true"));
    const panel = await screen.findByTestId("part-detail");
    await waitFor(() => expect(within(panel).getByTestId("part-issue-ISS-IGN-006")).toBeInTheDocument());
    expect(within(panel).getByTestId("part-wires")).toHaveTextContent("W-011");
  });

  it("agent markers feed the New Issue draft, and a multi-issue door lists both issues", async () => {
    mount();
    const chat = await screen.findByTestId("agent-chat");
    fireEvent.change(within(chat).getByTestId("chat-input"), { target: { value: "Circle the mounting bracket and the charge connector" } });
    fireEvent.click(within(chat).getByTestId("chat-send"));
    await within(chat).findAllByTestId("toolcall-mark");
    const markers = await screen.findByTestId("markers");
    expect(markers).toHaveTextContent("Markers (2)");
    fireEvent.click(within(markers).getByTestId("report-marked"));
    const form = await screen.findByTestId("new-issue-form");
    expect(within(form).getByTestId("entity-chips")).toHaveTextContent("BRKT-0005");
    expect(within(form).getByTestId("entity-chips")).toHaveTextContent("CONN-0005");
    fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("tab", { name: /DEMO-EV-006/ }));
    await waitFor(() => expect(screen.getByText(/DEMOVIN0000000006/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hotspot-door-FL"));
    const panel = await screen.findByTestId("part-detail");
    await waitFor(() => expect(within(panel).getByTestId("part-issues")).toHaveTextContent("Issues on this part (2)"));
    fireEvent.click(within(panel).getByTestId("part-issue-ISS-DOOR-005"));
    const detail = await screen.findByTestId("issue-detail");
    expect(within(detail).getByText("Front left door seal wind noise on DEMO-EV-006")).toBeInTheDocument();
  });

  it("mark mode places a user marker on tap and camera presets change the view", async () => {
    mount();
    fireEvent.click(screen.getByTestId("toggle-mark"));
    expect(screen.getByTestId("vehicle-sketch")).toHaveAttribute("data-mark-mode", "true");
    fireEvent.click(screen.getByTestId("hotspot-headlamp-L"));
    const markers = await screen.findByTestId("markers");
    expect(markers).toHaveTextContent("Left headlamp");
    expect(screen.getByTestId("vehicle-sketch")).toHaveAttribute("data-zoomed", "false");
    fireEvent.click(screen.getByTestId("camera-top"));
    fireEvent.click(screen.getByTestId("toggle-wiring"));
    expect(screen.getByTestId("wire-W-001")).toBeInTheDocument();
  });
});
