// @vitest-environment jsdom
/**
 * Rendered workflow tests for RecallWorkspace against the labeled mock client.
 * They verify the UI behaviour (labels, states, error handling), not the real backend.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EV_DEMO } from "@/contracts/issues";
import { createMockClient } from "../../features/recall/api/mockClient";
import { RecallWorkspace } from "../../features/recall";

afterEach(cleanup);

type Controls = ReturnType<typeof createMockClient>["controls"];

function mount(initialView: "vehicles" | "issues" | "resolutions" | "insights" = "vehicles", seed?: (controls: Controls) => void) {
  const { client, controls } = createMockClient({ latencyMs: 0, now: () => "2026-09-12T12:00:00Z" });
  seed?.(controls);
  const utils = render(<RecallWorkspace client={client} initialView={initialView} instantZoom />);
  return { client, controls, ...utils };
}

function seedStoryIssue(controls: Controls) {
  return controls.server.createIssue({
    idempotencyKey: "seed-story-0001",
    title: "Charge-port connector misaligned on DEMO-EV-005",
    description: "Connector proud on the left.",
    origin: "manual",
    detectedAt: "2026-09-12T10:00:00Z",
    reportingTeamId: EV_DEMO.teams.finalInspection,
    assignedTeamId: EV_DEMO.teams.inHouseManufacturing,
    detectionStationId: EV_DEMO.stations.finalInspection,
    processStepId: EV_DEMO.processSteps.chargePortInstall,
    entityIds: [EV_DEMO.entities.module, EV_DEMO.entities.connector, EV_DEMO.entities.bracket, EV_DEMO.entities.vehicle],
    partNumber: EV_DEMO.parts.bracket,
    partRevision: "A",
    linkedSupplierIds: [EV_DEMO.suppliers.connector],
    defectCode: EV_DEMO.defectCodes.misalignment,
    severity: "major",
    evidenceIds: [],
    newEvidence: [],
  }).issue;
}

describe("vehicle explorer", () => {
  it("shows the mock banner, three models, and zooms into the charge port revealing connector and bracket provenance", async () => {
    mount("vehicles");
    expect(screen.getByTestId("mode-badge")).toHaveTextContent("Sample data (mock mode)");
    expect(screen.getAllByRole("tab", { name: /DEMO-EV-00[567]/ })).toHaveLength(3);
    await waitFor(() => expect(screen.getByText(/Recorded parts on this sketch/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Made in-house · /)).toBeInTheDocument());
    expect(screen.getByText(/Bought from supplier · /)).toBeInTheDocument();
    expect(screen.getByText(/Unknown origin · /)).toBeInTheDocument();

    const sketch = screen.getByTestId("vehicle-sketch");
    expect(sketch).toHaveAttribute("data-zoomed", "false");
    fireEvent.click(screen.getByTestId("hotspot-charge-port-module"));
    await waitFor(() => expect(sketch).toHaveAttribute("data-zoomed", "true"));
    expect(screen.getByTestId("hotspot-charge-connector")).toBeInTheDocument();
    const detail = screen.getByTestId("part-detail");
    expect(within(detail).getByText("Charge-port module")).toBeInTheDocument();
    await waitFor(() => expect(within(detail).getByText("Made in-house")).toBeInTheDocument());
    expect(within(detail).getByText(/producer, not a confirmed cause/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("hotspot-charge-connector"));
    await waitFor(() => expect(within(screen.getByTestId("part-detail")).getByText("Bought from supplier")).toBeInTheDocument());
    const conn = screen.getByTestId("part-detail");
    expect(within(conn).getByText("DEMO-SUP-LOT-01")).toBeInTheDocument();
    expect(within(conn).getByText("Demo Connector Supplier")).toBeInTheDocument();
    expect(within(conn).getByText(/no VIN yet/)).toBeInTheDocument();
    expect(within(conn).getByText(/EVID-SUP-RECEIPT-01/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("hotspot-charge-bracket"));
    const brkt = await screen.findByTestId("part-detail");
    await waitFor(() => expect(within(brkt).getByText("DEMO-MFG-LOT-01")).toBeInTheDocument());
    expect(within(brkt).getByText("WO-DEMO-0001")).toBeInTheDocument();
    expect(within(brkt).getAllByText(/Bracket forming/).length).toBeGreaterThan(0);
  });

  it("marks an unrecorded part honestly and shows replacement history on the crossover", async () => {
    mount("vehicles");
    fireEvent.click(screen.getByRole("tab", { name: /DEMO-EV-006/ }));
    await waitFor(() => expect(screen.getByText(/DEMOVIN0000000006/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hotspot-charge-port-module"));
    await waitFor(() => expect(screen.getByTestId("hotspot-charge-connector")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hotspot-charge-connector"));
    // CONN-0006 was removed and replaced; the sketch slot maps to the original serial, so history must show.
    const panel = await screen.findByTestId("part-detail");
    await waitFor(() => expect(within(panel).getByText(/Historical containment/)).toBeInTheDocument());
    expect(within(panel).getAllByText(/Removal is not engineering clearance/).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/not currently installed/)).toBeInTheDocument();
  });

  it("prefills a new issue from the selected part", async () => {
    mount("vehicles");
    fireEvent.click(screen.getByTestId("hotspot-charge-port-module"));
    await waitFor(() => expect(within(screen.getByTestId("part-detail")).getByText("Made in-house")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Report issue on this part/ }));
    const form = await screen.findByTestId("new-issue-form");
    const chips = within(form).getByTestId("entity-chips");
    expect(chips).toHaveTextContent("CPM-0005");
    expect(chips).toHaveTextContent("DEMO-EV-005");
    expect(within(form).getByLabelText(/Part number/)).toHaveValue("CP-MOD-300");
  });
});

describe("manual issue creation", () => {
  it("creates an issue without import or AI, opens the stored record, and survives reload", async () => {
    const { controls } = mount("issues");
    fireEvent.click(await screen.findByTestId("new-issue"));
    const form = await screen.findByTestId("new-issue-form");
    fireEvent.change(within(form).getByLabelText(/Title/), { target: { value: "Charge-port connector misaligned on DEMO-EV-005" } });
    fireEvent.change(within(form).getByLabelText(/Observed problem/), { target: { value: "Door not flush; connector proud on the left." } });
    fireEvent.change(within(form).getByLabelText(/Reporting team/), { target: { value: EV_DEMO.teams.finalInspection } });
    fireEvent.change(within(form).getByLabelText(/Detection station/), { target: { value: EV_DEMO.stations.finalInspection } });
    fireEvent.change(within(form).getByLabelText(/Defect code/), { target: { value: EV_DEMO.defectCodes.misalignment } });
    const entityInput = within(form).getByLabelText(/Marked items/);
    fireEvent.change(entityInput, { target: { value: "CPM-0005" } });
    fireEvent.keyDown(entityInput, { key: "Enter" });
    fireEvent.change(entityInput, { target: { value: "DEMO-EV-005" } });
    fireEvent.keyDown(entityInput, { key: "Enter" });
    fireEvent.click(within(form).getByTestId("submit-issue"));

    const detail = await screen.findByTestId("issue-detail");
    expect(within(detail).getByText("Charge-port connector misaligned on DEMO-EV-005")).toBeInTheDocument();
    expect(within(detail).getByText("Open")).toBeInTheDocument();
    const attr = within(detail).getByTestId("attribution");
    expect(attr).toHaveTextContent("Reported by");
    expect(attr).toHaveTextContent("Final Inspection");
    expect(attr).toHaveTextContent("Currently assigned to");
    expect(attr).toHaveTextContent("Unassigned");
    expect(attr).toHaveTextContent("Not confirmed");
    expect(within(detail).getByText(/no confirmed supplier fault/)).toBeInTheDocument();
    expect(within(detail).getByText(/saved v1/)).toBeInTheDocument();

    const stored = controls.server.listIssues({ text: "misaligned on DEMO-EV-005" }).items;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.origin).toBe("manual");
    expect(stored[0]?.entityIds).toEqual(["CPM-0005", "DEMO-EV-005"]);

    // Reopening fetches the stored record.
    fireEvent.click(screen.getByRole("button", { name: /← Issues/ }));
    await screen.findByTestId("issue-table");
    fireEvent.click(await screen.findByTestId(`issue-row-${stored[0]!.id}`));
    expect(await screen.findByText(/VIN not assigned/)).toBeInTheDocument();
  });

  it("keeps the draft and idempotency key when the backend is unavailable, then succeeds on retry", async () => {
    const { controls } = mount("issues");
    controls.failNext("createIssue", { code: "NETWORK", message: "Backend unavailable: fetch failed" });
    fireEvent.click(await screen.findByTestId("new-issue"));
    const form = await screen.findByTestId("new-issue-form");
    fireEvent.change(within(form).getByLabelText(/Title/), { target: { value: "Draft that must survive" } });
    fireEvent.click(within(form).getByTestId("submit-issue"));
    const alert = await within(form).findByRole("alert");
    expect(alert).toHaveTextContent("NETWORK");
    expect(alert).toHaveTextContent("Your draft is kept");
    expect(within(form).getByLabelText(/Title/)).toHaveValue("Draft that must survive");
    expect(controls.server.listIssues({ text: "survive" }).items).toHaveLength(0);
    fireEvent.click(within(form).getByTestId("submit-issue"));
    await screen.findByTestId("issue-detail");
    expect(controls.server.listIssues({ text: "survive" }).items).toHaveLength(1);
  });

  it("saves assignment edits and surfaces a stale-version conflict without losing input", async () => {
    let issue!: ReturnType<typeof seedStoryIssue>;
    const { controls } = mount("issues", (c) => {
      issue = seedStoryIssue(c);
    });
    fireEvent.click(await screen.findByTestId(`issue-row-${issue.id}`));
    const detail = await screen.findByTestId("issue-detail");
    const select = within(detail).getByTestId("assign-select");
    fireEvent.change(select, { target: { value: EV_DEMO.teams.assembly } });
    // Simulate a teammate's edit in between.
    controls.server.updateIssue(issue.id, { expectedVersion: 1, description: "changed elsewhere" });
    fireEvent.click(within(detail).getByTestId("save-issue"));
    const alert = await within(detail).findByRole("alert");
    expect(alert).toHaveTextContent("STALE_VERSION");
    expect(select).toHaveValue(EV_DEMO.teams.assembly);
    fireEvent.click(within(alert).getByRole("button", { name: /Reload latest/ }));
    await waitFor(() => expect(within(screen.getByTestId("issue-detail")).getByText(/saved v2/)).toBeInTheDocument());
  });
});

describe("investigation and resolution", () => {
  it("shows attribution labels on the prior closed issue: reporter, confirmed causal team, linked supplier not at fault", async () => {
    mount("issues");
    fireEvent.click(await screen.findByTestId(`issue-row-${EV_DEMO.priorIssueId}`));
    const detail = await screen.findByTestId("issue-detail");
    const attr = within(detail).getByTestId("attribution");
    expect(attr).toHaveTextContent("Reported byFinal Inspection");
    expect(attr).toHaveTextContent("Confirmed causal teamIn-house Manufacturing (bracket cell)");
    expect(attr).toHaveTextContent("Detected at stationFinal Inspection");
    expect(attr).toHaveTextContent("Confirmed causal station/process: Bracket Forming Cell / Bracket forming");
    expect(within(detail).getByText("Demo Connector Supplier")).toBeInTheDocument();
    expect(within(detail).getByText(/no confirmed supplier fault/)).toBeInTheDocument();

    fireEvent.click(within(detail).getByTestId("tab-investigation"));
    expect(within(screen.getByTestId("causes-confirmed")).getByText(/current primary cause/)).toBeInTheDocument();
    expect(within(screen.getByTestId("causes-rejected")).getByText(/Supplier component/)).toBeInTheDocument();
    expect(within(screen.getByTestId("causes-hypothesis")).getByText(/None recorded/)).toBeInTheDocument();
  });

  it("keeps a supplier hypothesis separate from confirmed fault on the headlamp issue", async () => {
    mount("issues");
    fireEvent.click(await screen.findByTestId("issue-row-ISS-LAMP-002"));
    const detail = await screen.findByTestId("issue-detail");
    expect(within(detail).getByText(/Suspected supplier cause \(hypothesis\): Demo Lighting Supplier/)).toBeInTheDocument();
    expect(within(detail).getByText(/no confirmed supplier fault/)).toBeInTheDocument();
    expect(within(detail).getByTestId("attribution")).toHaveTextContent("Not confirmed");
  });

  it("runs the full loop: prior verified fix -> proposed (not solved) -> apply -> verification -> close", async () => {
    let issue!: ReturnType<typeof seedStoryIssue>;
    const { controls } = mount("issues", (c) => {
      issue = seedStoryIssue(c);
    });
    fireEvent.click(await screen.findByTestId(`issue-row-${issue.id}`));
    const detail = await screen.findByTestId("issue-detail");
    fireEvent.click(within(detail).getByTestId("tab-resolution"));

    const similar = await screen.findByTestId(`similar-${EV_DEMO.priorVerifiedFixId}`);
    expect(similar).toHaveTextContent(/Verified 2026-08-23/);
    expect(similar).toHaveTextContent("same defect code CONNECTOR_MISALIGNED");
    expect(similar).toHaveTextContent(EV_DEMO.priorIssueId);
    expect(screen.getByTestId("close-issue")).toBeDisabled();

    fireEvent.click(within(similar).getByTestId(`reuse-${EV_DEMO.priorVerifiedFixId}`));
    const form = await screen.findByTestId("fix-form");
    expect(form).toHaveTextContent("Proposed from a verified prior resolution");
    await waitFor(() => expect(within(form).getByLabelText("Step 1")).toHaveValue("Remove charge-port module and bracket; tag bracket with issue id."));
    fireEvent.change(within(form).getByLabelText(/Summary/), { target: { value: "Re-form bracket flange on DEMO-EV-005 (from prior fix)" } });
    fireEvent.change(within(form).getByLabelText(/work-instruction/), { target: { value: "WI-BRKT-014 (placeholder)" } });
    fireEvent.click(within(form).getByTestId("save-fix"));

    const fixCard = await screen.findByText(/v1: Re-form bracket flange on DEMO-EV-005/);
    const card = fixCard.closest("[data-testid^='fix-']") as HTMLElement;
    expect(card).toHaveTextContent("Proposed");
    expect(card).toHaveTextContent("Proposed from a verified prior resolution");
    expect(card).not.toHaveTextContent(/^.*Verified$/);
    expect(screen.getByTestId("close-issue")).toBeDisabled();
    expect(within(card).getByText(/Start work on the issue before applying/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start work" }));
    await waitFor(() => expect(screen.getByTestId("status-actions")).toHaveTextContent("Status: In progress"));
    const fixId = card.getAttribute("data-testid")!.replace("fix-", "");
    fireEvent.click(await screen.findByTestId(`apply-${fixId}`));
    await waitFor(() => expect(screen.getByTestId("status-actions")).toHaveTextContent("Status: Pending verification"));
    expect(screen.getByTestId(`fix-${fixId}`)).toHaveTextContent("Applied (awaiting verification)");
    expect(screen.getByTestId("close-issue")).toBeDisabled();

    // A failed verification keeps the issue open for work.
    fireEvent.click(screen.getByTestId(`verify-${fixId}`));
    let vf = await screen.findByTestId("verification-form");
    fireEvent.change(within(vf).getByLabelText(/Outcome/), { target: { value: "fail" } });
    fireEvent.change(within(vf).getByLabelText(/Method/), { target: { value: "Alignment gauge" } });
    fireEvent.change(within(vf).getByLabelText(/Result notes/), { target: { value: "Still 0.8 mm proud" } });
    fireEvent.click(within(vf).getByTestId("save-verification"));
    await waitFor(() => expect(screen.getByText("Failed")).toBeInTheDocument());
    expect(screen.getByTestId(`fix-${fixId}`)).toHaveTextContent("1 failed verification(s); the issue stays open for work.");
    expect(screen.getByTestId("close-issue")).toBeDisabled();

    fireEvent.click(screen.getByTestId(`verify-${fixId}`));
    vf = await screen.findByTestId("verification-form");
    fireEvent.change(within(vf).getByLabelText(/Method/), { target: { value: "Alignment gauge, four points" } });
    fireEvent.change(within(vf).getByLabelText(/Result notes/), { target: { value: "Within 0.2 mm; door flush" } });
    fireEvent.click(within(vf).getByTestId("save-verification"));
    await waitFor(() => expect(screen.getByText("Passed")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("close-issue")).toBeEnabled());
    expect(screen.getByTestId(`fix-${fixId}`)).toHaveTextContent("Verified");
    fireEvent.click(screen.getByTestId("close-issue"));
    await waitFor(() => expect(screen.getByTestId("status-actions")).toHaveTextContent("Status: Closed"));

    // The graph now retrieves this resolution for a later issue.
    const later = controls.server.createIssue({
      idempotencyKey: "seed-later-0001",
      title: "Later bracket issue on DEMO-EV-006",
      description: "Same symptom on the next vehicle.",
      origin: "manual",
      detectedAt: "2026-09-12T13:00:00Z",
      reportingTeamId: EV_DEMO.teams.finalInspection,
      assignedTeamId: null,
      detectionStationId: EV_DEMO.stations.finalInspection,
      processStepId: EV_DEMO.processSteps.chargePortInstall,
      entityIds: ["BRKT-0006", "DEMO-EV-006"],
      partNumber: EV_DEMO.parts.bracket,
      partRevision: "A",
      linkedSupplierIds: [],
      defectCode: EV_DEMO.defectCodes.misalignment,
      severity: "major",
      evidenceIds: [],
      newEvidence: [],
    }).issue;
    const found = controls.server.findSimilarResolutions(later.id);
    expect(found.results.map((r) => r.sourceFixRevisionId)).toContain(fixId);
    expect(found.results.find((r) => r.sourceFixRevisionId === fixId)?.verificationId).not.toBe("NONE");
  });
});

describe("insights", () => {
  it("renders server counts, N/A rates without a cohort, and drills into the issues behind a metric", async () => {
    mount("insights");
    const teams = await screen.findByTestId("team-table");
    const row = within(teams).getByText("Final Inspection").closest("tr")!;
    expect(row).toHaveTextContent("6");
    expect(screen.getByTestId("rate-SUP-LAMP")).toHaveTextContent("N/A");
    expect(screen.getByTestId(`rate-${EV_DEMO.suppliers.connector}`)).toHaveTextContent("%");
    fireEvent.click(screen.getByTestId("metric-reported-by-final-inspection"));
    const dialog = await screen.findByTestId("drilldown");
    expect(dialog).toHaveTextContent("Reported by Final Inspection");
    await waitFor(() => expect(within(dialog).getAllByText(/Evidence:/)).toHaveLength(6));
    expect(dialog).toHaveTextContent(EV_DEMO.priorIssueId);
  });
});
