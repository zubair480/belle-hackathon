// @vitest-environment jsdom
/** Exterior-only sketch, real tap sequence, wire routing helpers, and the New Issue dialog behaviour. */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockClient } from "../../features/recall/api/mockClient";
import { RecallWorkspace } from "../../features/recall";
import { WIRES, isExteriorEntity, isExteriorSlot, wireLane, wirePath, wireWidth } from "../../features/recall/sketches/car3d";

afterEach(cleanup);

function mount(opts: { chatOpen?: boolean } = {}) {
  const { client, controls } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
  render(<RecallWorkspace client={client} instantZoom chatOpen={opts.chatOpen ?? false} />);
  return { client, controls };
}

describe("exterior classification and wiring helpers", () => {
  it("classifies exterior vs interior slots and entity ids", () => {
    expect(isExteriorSlot("door-FL")).toBe(true);
    expect(isExteriorSlot("charge-connector")).toBe(true);
    expect(isExteriorSlot("start-switch")).toBe(false);
    expect(isExteriorEntity("LAMP-0005-R")).toBe(true);
    expect(isExteriorEntity("SEAT-0005-FL")).toBe(false);
    expect(isExteriorEntity("NOPE-1")).toBe(false);
  });

  it("routes wires with lanes so parallel wires in one harness do not overlap, and widths follow gauge", () => {
    const w10 = WIRES.find((w) => w.id === "W-010")!;
    const w11 = WIRES.find((w) => w.id === "W-011")!;
    expect(wireLane(w10).count).toBeGreaterThan(1);
    expect(wireLane(w10).index).not.toBe(wireLane(w11).index);
    const p10 = wirePath(w10, "sedan");
    const p11 = wirePath(w11, "sedan");
    expect(p10.length).toBeGreaterThanOrEqual(5);
    expect(p10[2]!.join(",")).not.toBe(p11[2]!.join(","));
    expect(wireWidth(WIRES.find((w) => w.id === "W-020")!)).toBeGreaterThan(wireWidth(w11));
  });
});

describe("exterior-only sketch and tap-to-zoom", () => {
  it("draws exterior parts only; interior parts are not on the sketch but still open in the rail", async () => {
    mount();
    expect(screen.getByTestId("hotspot-door-FL")).toBeInTheDocument();
    expect(screen.getByTestId("hotspot-headlamp-L")).toBeInTheDocument();
    expect(screen.queryByTestId("hotspot-seat-FL")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hotspot-start-switch")).not.toBeInTheDocument();
    expect(screen.queryByTestId("partlist-start-switch")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Exterior parts on this sketch/)).toBeInTheDocument());
  });

  it("a real tap (pointerdown, pointerup, click on the part) zooms in; a drag does not deselect", async () => {
    mount();
    const sketch = screen.getByTestId("vehicle-sketch");
    const lamp = screen.getByTestId("hotspot-headlamp-L");
    fireEvent.pointerDown(sketch, { button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(sketch, { clientX: 300, clientY: 300 });
    fireEvent.click(lamp);
    await waitFor(() => expect(sketch).toHaveAttribute("data-zoomed", "true"));
    expect(lamp).toHaveAttribute("data-selected", "true");
    // Drag: pointer moves far, then the click that follows must not clear the selection.
    fireEvent.pointerDown(sketch, { button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(sketch, { clientX: 380, clientY: 320 });
    fireEvent.pointerUp(sketch, { clientX: 380, clientY: 320 });
    fireEvent.click(sketch);
    expect(screen.getByTestId("hotspot-headlamp-L")).toHaveAttribute("data-selected", "true");
    // A plain tap on the background deselects.
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.pointerDown(sketch, { button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(sketch, { clientX: 300, clientY: 300 });
    fireEvent.click(sketch);
    await waitFor(() => expect(sketch).toHaveAttribute("data-zoomed", "false"));
  });

  it("the assistant focusing an interior part shows its record with an interior note and no zoom", async () => {
    mount({ chatOpen: true });
    const chat = await screen.findByTestId("agent-chat");
    fireEvent.change(within(chat).getByTestId("chat-input"), { target: { value: "show me the driver seat" } });
    fireEvent.click(within(chat).getByTestId("chat-send"));
    await within(chat).findByTestId("toolcall-focus_part");
    const panel = await screen.findByTestId("part-detail");
    expect(panel).toHaveTextContent("Driver seat");
    expect(panel).toHaveTextContent("Interior part: recorded, not drawn on the exterior sketch");
    expect(screen.getByTestId("vehicle-sketch")).toHaveAttribute("data-zoomed", "false");
  });
});

describe("New issue dialog", () => {
  it("opens with sections and a live summary, closes on Escape, and prefilled items are described", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/Exterior parts on this sketch/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hotspot-charge-port-module"));
    fireEvent.click(await screen.findByRole("button", { name: /Report issue on this part/ }));
    const form = await screen.findByTestId("new-issue-form");
    expect(within(form).getByText("1 · What happened")).toBeInTheDocument();
    expect(within(form).getByText("4 · Marked items and part")).toBeInTheDocument();
    const chips = within(form).getByTestId("entity-chips");
    expect(chips).toHaveTextContent("CPM-0005");
    expect(chips).toHaveTextContent("Charge-port module");
    expect(chips).toHaveTextContent("Demo Sedan · vehicle");
    expect(within(form).getByTestId("submit-issue")).toBeDisabled();
    fireEvent.change(within(form).getByLabelText(/Title/), { target: { value: "Charge door not flush" } });
    expect(within(form).getByTestId("submit-issue")).toBeEnabled();
    fireEvent.click(within(form).getByRole("radio", { name: "Critical" }));
    expect(within(form).getByTestId("ni-summary")).toHaveTextContent("DEMO-EV-005");
    expect(within(form).getByTestId("ni-summary")).toHaveTextContent("Critical");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("new-issue-form")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
  });
});
