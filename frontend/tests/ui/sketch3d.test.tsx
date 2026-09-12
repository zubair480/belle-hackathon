// @vitest-environment jsdom
/**
 * 3D sketch behaviour: body styles, tap-to-zoom disclosure of wires and child parts,
 * hover tooltips for components and wires, and the seeded issues on each vehicle.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockClient } from "../../features/recall/api/mockClient";
import { RecallWorkspace } from "../../features/recall";
import { SKETCH_VEHICLES, bodyLines, wiresNear } from "../../features/recall/sketches/car3d";

afterEach(cleanup);

function mount() {
  const { client, controls } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
  render(<RecallWorkspace client={client} instantZoom />);
  return { client, controls };
}

describe("body styles", () => {
  it("offers a sedan, an SUV and a sports car with distinct geometry", () => {
    expect(SKETCH_VEHICLES.map((v) => v.style)).toEqual(["sedan", "suv", "sports"]);
    const roofOf = (style: "sedan" | "suv" | "sports") => Math.max(...bodyLines(style).flatMap((l) => l.points.map((p) => p[2])));
    expect(roofOf("suv")).toBeGreaterThan(roofOf("sedan"));
    expect(roofOf("sedan")).toBeGreaterThan(roofOf("sports"));
  });

  it("wiresNear returns the wires attached to the charge-port module and its children", () => {
    const ids = wiresNear(["charge-port-module", "charge-connector", "charge-bracket"]).map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(["W-030", "W-034"]));
    expect(ids).not.toContain("W-010");
  });
});

describe("zoom disclosure and hover details", () => {
  it("shows no wires at full view, reveals attached wires and children after tapping the charge port", async () => {
    mount();
    const sketch = screen.getByTestId("vehicle-sketch");
    await waitFor(() => expect(screen.getByText(/Exterior parts on this sketch/)).toBeInTheDocument());
    expect(sketch).toHaveAttribute("data-wires-visible", "0");
    expect(screen.queryByTestId("hotspot-charge-connector")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("hotspot-charge-port-module"));
    await waitFor(() => expect(sketch).toHaveAttribute("data-zoomed", "true"));
    expect(Number(sketch.getAttribute("data-wires-visible"))).toBeGreaterThan(0);
    expect(screen.getByTestId("wire-W-030")).toBeInTheDocument();
    expect(screen.queryByTestId("wire-W-010")).not.toBeInTheDocument();
    expect(screen.getByTestId("hotspot-charge-connector")).toBeInTheDocument();
    expect(screen.getByTestId("hotspot-charge-bracket")).toBeInTheDocument();
  });

  it("hovering a wire says where it comes from and goes to; hovering a part says what it is and its origin", async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/Exterior parts on this sketch/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hotspot-charge-port-module"));
    const wire = await screen.findByTestId("wire-W-034");
    fireEvent.pointerEnter(wire, { clientX: 100, clientY: 100 });
    const tip = await screen.findByTestId("sketch-tooltip");
    expect(tip).toHaveTextContent("W-034 · CP / PP pilot");
    expect(tip).toHaveTextContent("From Charge connector (X-CONN-CP)");
    expect(tip).toHaveTextContent("To On-board charger (X-OBC-AC)");
    expect(tip).toHaveTextContent("Circuit Charging (C-CHARGE)");
    expect(tip).toHaveTextContent("On this vehicle: CONN-0005 → OBC-0005");
    // Wires are drawn above the parts so a real pointer can reach them.
    const wiresGroup = wire.parentElement!;
    const partGroup = screen.getByTestId("hotspot-charge-port-module");
    expect(partGroup.compareDocumentPosition(wire) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wiresGroup).toBe(partGroup.parentElement);
    expect(screen.getByTestId("wire-info")).toHaveTextContent("W-034 · CP / PP pilot");
    fireEvent.pointerLeave(wire);
    await waitFor(() => expect(screen.queryByTestId("sketch-tooltip")).not.toBeInTheDocument());

    fireEvent.pointerEnter(screen.getByTestId("hotspot-charge-connector"), { clientX: 120, clientY: 120 });
    const tip2 = await screen.findByTestId("sketch-tooltip");
    expect(tip2).toHaveTextContent("Charge connector · CONN-0005");
    expect(tip2).toHaveTextContent("Charging · Rear quarter, left");
    await waitFor(() => expect(screen.getByTestId("sketch-tooltip")).toHaveTextContent("Bought from Demo Connector Supplier · batch DEMO-SUP-LOT-01"));
    expect(tip2).toHaveTextContent("ratedCurrent: 500 A DC (demo)");
    expect(tip2).toHaveTextContent("W-030 DC+ / DC- from inlet");
  });

  it("the SUV and the sports car carry their own seeded issues", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: /DEMO-EV-006/ }));
    await waitFor(() => expect(screen.getByText(/DEMOVIN0000000006/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hotspot-mirror-R"));
    let panel = await screen.findByTestId("part-detail");
    await waitFor(() => expect(within(panel).getByTestId("part-issue-ISS-MIRROR-011")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hotspot-door-FL"));
    panel = await screen.findByTestId("part-detail");
    await waitFor(() => expect(within(panel).getByTestId("part-issues")).toHaveTextContent("Issues on this part (2)"));

    fireEvent.click(screen.getByRole("tab", { name: /DEMO-EV-007/ }));
    await waitFor(() => expect(screen.getByText(/DEMOVIN0000000007/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hotspot-headlamp-L"));
    panel = await screen.findByTestId("part-detail");
    await waitFor(() => expect(within(panel).getByTestId("part-issue-ISS-LAMP-002")).toBeInTheDocument());
    expect(within(panel).getByTestId("part-wires")).toHaveTextContent("W-051");
  });
});
