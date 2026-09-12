// @vitest-environment jsdom
/** Inside/Outside layers, wire routing helpers, and the New Issue dialog behaviour. */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockClient } from "../../features/recall/api/mockClient";
import { RecallWorkspace } from "../../features/recall";
import { WIRES, isExteriorSlot, layerForEntityId, wireLane, wirePath, wireWidth } from "../../features/recall/sketches/car3d";

afterEach(cleanup);

function mount(opts: { chatOpen?: boolean } = {}) {
  const { client, controls } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
  render(<RecallWorkspace client={client} instantZoom chatOpen={opts.chatOpen ?? false} />);
  return { client, controls };
}

describe("layers and wiring helpers", () => {
  it("classifies exterior vs interior slots and derives the layer from an entity id", () => {
    expect(isExteriorSlot("door-FL")).toBe(true);
    expect(isExteriorSlot("charge-connector")).toBe(true);
    expect(isExteriorSlot("start-switch")).toBe(false);
    expect(layerForEntityId("SEAT-0005-FL")).toBe("inside");
    expect(layerForEntityId("LAMP-0005-R")).toBe("outside");
    expect(layerForEntityId("NOPE-1")).toBeNull();
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

describe("Inside / Outside view", () => {
  it("outside shows exterior parts only; inside shows cabin and electrical parts only; selection switches layers", async () => {
    mount();
    const sketch = screen.getByTestId("vehicle-sketch");
    expect(sketch).toHaveAttribute("data-layer", "outside");
    expect(screen.getByTestId("hotspot-door-FL")).toBeInTheDocument();
    expect(screen.queryByTestId("hotspot-seat-FL")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hotspot-start-switch")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("layer-inside"));
    expect(sketch).toHaveAttribute("data-layer", "inside");
    expect(screen.getByTestId("hotspot-seat-FL")).toBeInTheDocument();
    expect(screen.getByTestId("hotspot-start-switch")).toBeInTheDocument();
    expect(screen.queryByTestId("hotspot-door-FL")).not.toBeInTheDocument();

    // Selecting an exterior part from the list switches back to outside.
    await waitFor(() => expect(screen.getByTestId("partlist-headlamp-L")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("partlist-headlamp-L"));
    await waitFor(() => expect(sketch).toHaveAttribute("data-layer", "outside"));
    expect(screen.getByTestId("hotspot-headlamp-L")).toHaveAttribute("data-selected", "true");
  });

  it("the assistant focusing an interior part switches to the inside view", async () => {
    mount({ chatOpen: true });
    const chat = await screen.findByTestId("agent-chat");
    fireEvent.change(within(chat).getByTestId("chat-input"), { target: { value: "show me the driver seat" } });
    fireEvent.click(within(chat).getByTestId("chat-send"));
    await within(chat).findByTestId("toolcall-focus_part");
    await waitFor(() => expect(screen.getByTestId("vehicle-sketch")).toHaveAttribute("data-layer", "inside"));
    await waitFor(() => expect(screen.getByTestId("hotspot-seat-FL")).toHaveAttribute("data-selected", "true"));
  });
});

describe("New issue dialog", () => {
  it("opens with sections and a live summary, closes on Escape, and prefilled items are described", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/Recorded parts on this sketch/)).toBeInTheDocument());
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
