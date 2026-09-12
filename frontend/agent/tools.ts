/**
 * Harness tools. One definition serves three runtimes: the browser stub planner, the server
 * Qoder Agent SDK planner (wrapped as in-process MCP tools) and tests. Data tools read through
 * the typed RecallClient (mock or live routes); UI tools only queue actions for the browser.
 * The agent may create an issue when the user explicitly asks (create_issue); it never closes,
 * assigns, transitions or confirms causes.
 */
import { z } from "zod";
import type { Issue, ReferenceCatalog } from "@/contracts/issues";
import { EV_DEMO } from "@/contracts/issues";
import { EV_TRACE_DEMO, CURRENT_REVISION_ALIAS } from "@/contracts/recall";
import { adjacency, describeSubgraph, nodeById, vehiclesContaining, type WorkspaceGraph } from "../features/recall/graph/model";
import type { RecallClient } from "../features/recall/api/types";
import { CIRCUITS, PARTS, SKETCH_VEHICLES, entityIdFor, searchCircuits, searchParts, slotById, slotForEntityId, slotsForCircuit, wiresForCircuit, wiresForSlot, type PartSlot } from "../features/recall/sketches/car3d";
import { faultZonesFor, matchFaultZones } from "../features/recall/sketches/faultZones";
import type { AgentContext, UiAction } from "./types";

export type ToolContext = {
  client: RecallClient;
  catalog: ReferenceCatalog | null;
  context: AgentContext;
  ui: UiAction[];
};

export type ToolResult = { text: string; data?: unknown; ok?: boolean };

export type ToolDef<S extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  description: string;
  input: S;
  readOnly: boolean;
  execute: (ctx: ToolContext, input: z.infer<z.ZodObject<S>>) => Promise<ToolResult>;
};

const def = <S extends z.ZodRawShape>(t: ToolDef<S>): ToolDef<S> => t;

function vehicleFor(ctx: ToolContext, buildId?: string | null) {
  const id = buildId ?? ctx.context.vehicleBuildId ?? SKETCH_VEHICLES[0]!.buildId;
  return SKETCH_VEHICLES.find((v) => v.buildId === id) ?? { buildId: id, entityId: id, suffix: id.slice(-4), style: "sedan" as const, modelName: "Vehicle", platform: "EV-PLATFORM-1", note: "" };
}

function teamName(ctx: ToolContext, id: string | null) {
  return ctx.catalog?.teams.find((t) => t.id === id)?.name ?? id ?? "unassigned";
}
function supplierName(ctx: ToolContext, id: string | null | undefined) {
  return ctx.catalog?.suppliers.find((t) => t.id === id)?.name ?? id ?? "unknown supplier";
}

async function openIssuesFor(ctx: ToolContext, entityId: string): Promise<Issue[]> {
  const r = await ctx.client.listIssues({ entityId, limit: 50 });
  return r.ok ? r.data.items : [];
}

function describeSlot(slot: PartSlot, entityId: string): string {
  return `${slot.label} (${entityId}, ${slot.side === "C" ? "centre" : slot.side}, ${slot.zone})`;
}

/** Resolve "entityId or slot" inputs to a concrete entity on the current vehicle. */
function resolvePart(ctx: ToolContext, input: { entityId?: string | null; slot?: string | null; query?: string | null; vehicleBuildId?: string | null }): { slot: PartSlot; entityId: string; suffix: string } | null {
  const v = vehicleFor(ctx, input.vehicleBuildId);
  if (input.entityId) {
    const hit = slotForEntityId(input.entityId);
    if (hit) return { slot: hit.slot, entityId: input.entityId, suffix: hit.suffix };
  }
  if (input.slot) {
    const s = slotById(input.slot);
    if (s) return { slot: s, entityId: entityIdFor(s, v.suffix), suffix: v.suffix };
  }
  if (input.query) {
    const m = searchParts(input.query, 1)[0];
    if (m) return { slot: m.slot, entityId: entityIdFor(m.slot, v.suffix), suffix: v.suffix };
  }
  return null;
}

export const findPart = def({
  name: "find_part",
  description: "Find parts on the current vehicle by name, synonym or side (e.g. 'right front tire', 'ignition switch', 'orange cable'). Returns entity ids, sourcing and open-issue counts.",
  input: { query: z.string().describe("Free text naming a part, optionally with a side"), vehicleBuildId: z.string().nullable().optional().describe("Vehicle build id; defaults to the one on screen") },
  readOnly: true,
  async execute(ctx, { query, vehicleBuildId }) {
    const v = vehicleFor(ctx, vehicleBuildId);
    const matches = searchParts(query, 5);
    if (!matches.length) return { text: `No part matched "${query}". Try a part name such as wheel, headlamp, charge port, start switch or battery.`, data: [], ok: false };
    const rows = [];
    for (const m of matches) {
      const entityId = entityIdFor(m.slot, v.suffix);
      const issues = await openIssuesFor(ctx, entityId);
      rows.push({ slot: m.slot.slot, label: m.slot.label, entityId, side: m.slot.side, zone: m.slot.zone, system: m.slot.system, sourcing: m.slot.sourcing, openIssues: issues.filter((i) => i.status !== "closed").length, matchedOn: m.matchedOn });
    }
    const top = rows[0]!;
    return { text: `Best match on ${v.buildId}: ${top.label} (${top.entityId}), ${top.sourcing === "supplier" ? "bought from supplier" : top.sourcing === "in_house" ? "made in-house" : "unknown origin"}, ${top.openIssues} open issue(s).${rows.length > 1 ? ` Other candidates: ${rows.slice(1).map((r) => `${r.label} (${r.entityId})`).join(", ")}.` : ""}`, data: rows };
  },
});

export const focusPart = def({
  name: "focus_part",
  description: "Zoom the 3D sketch onto a part and load its provenance (supplier batch and receipt, or in-house lot, work order, process and team) plus its containment path.",
  input: { entityId: z.string().nullable().optional(), slot: z.string().nullable().optional(), query: z.string().nullable().optional(), vehicleBuildId: z.string().nullable().optional() },
  readOnly: true,
  async execute(ctx, input) {
    const p = resolvePart(ctx, input);
    if (!p) return { text: "Could not resolve which part to focus.", ok: false };
    const v = vehicleFor(ctx, input.vehicleBuildId);
    if (v.buildId !== ctx.context.vehicleBuildId) ctx.ui.push({ type: "select_vehicle", buildId: v.buildId });
    ctx.ui.push({ type: "focus_part", entityId: p.entityId, slot: p.slot.slot });
    const r = await ctx.client.getEntityContext(p.entityId);
    if (!r.ok) return { text: `Zoomed to ${describeSlot(p.slot, p.entityId)}. The backend has no record for it (${r.error.code}); no provenance shown.`, ok: false };
    const o = r.data.entity.origin;
    const prov =
      o?.sourcingType === "supplier"
        ? `Bought from ${supplierName(ctx, o.supplierId)}, batch ${o.supplierBatchCode}, receipt evidence ${o.evidenceIds.join(", ") || "none"}`
        : o?.sourcingType === "in_house"
          ? `Made in-house: lot ${o.manufacturingLotCode}, work order ${o.workOrderId}, process ${o.processStepId}, team ${teamName(ctx, o.manufacturingTeamId)} (producer, not a confirmed cause)`
          : "Origin not recorded (unknown)";
    const path = [r.data.entity.id, ...r.data.currentParents.map((x) => x.id)].join(" -> ");
    return { text: `Zoomed to ${describeSlot(p.slot, p.entityId)}. ${prov}. Containment: ${path}${r.data.currentParents.length ? "" : " (not currently installed)"}.`, data: { entityId: p.entityId, slot: p.slot.slot, origin: o, path } };
  },
});

export const listIssuesForPart = def({
  name: "list_issues_for_part",
  description: "List issues linked to a part (open and closed) with status, reporter and assignee.",
  input: { entityId: z.string().nullable().optional(), slot: z.string().nullable().optional(), query: z.string().nullable().optional(), vehicleBuildId: z.string().nullable().optional() },
  readOnly: true,
  async execute(ctx, input) {
    const p = resolvePart(ctx, input);
    if (!p) return { text: "Could not resolve the part.", ok: false };
    const issues = await openIssuesFor(ctx, p.entityId);
    if (!issues.length) return { text: `No issues are linked to ${describeSlot(p.slot, p.entityId)}.`, data: [] };
    const lines = issues.map((i) => `${i.id} [${i.status}] ${i.title}; reported by ${teamName(ctx, i.reportingTeamId)}, assigned ${teamName(ctx, i.assignedTeamId)}`);
    return { text: `${issues.length} issue(s) on ${p.slot.label} (${p.entityId}):\n- ${lines.join("\n- ")}`, data: issues.map((i) => ({ id: i.id, status: i.status, title: i.title })) };
  },
});

export const traceCircuit = def({
  name: "trace_circuit",
  description: "Trace an electrical circuit by name or symptom (ignition/start, charging, HV traction, lighting, steering, CAN). Highlights its wires and parts on the sketch and lists them with connectors and harness.",
  input: { query: z.string().describe("Circuit name, id or symptom such as 'ignition does not respond'"), vehicleBuildId: z.string().nullable().optional() },
  readOnly: true,
  async execute(ctx, { query, vehicleBuildId }) {
    const v = vehicleFor(ctx, vehicleBuildId);
    const circuits = searchCircuits(query);
    const circuit = circuits[0] ?? CIRCUITS.find((c) => c.id === query.toUpperCase()) ?? null;
    if (!circuit) return { text: `No circuit matched "${query}". Known circuits: ${CIRCUITS.map((c) => c.name).join(", ")}.`, ok: false };
    if (v.buildId !== ctx.context.vehicleBuildId) ctx.ui.push({ type: "select_vehicle", buildId: v.buildId });
    ctx.ui.push({ type: "show_wiring", on: true });
    ctx.ui.push({ type: "highlight_circuit", circuitId: circuit.id });
    const wires = wiresForCircuit(circuit.id);
    const parts = slotsForCircuit(circuit.id);
    const first = parts.find((p) => p.slot === "start-switch") ?? parts[0];
    if (first) ctx.ui.push({ type: "focus_part", entityId: entityIdFor(first, v.suffix), slot: first.slot });
    const partIssues: string[] = [];
    for (const p of parts) {
      const id = entityIdFor(p, v.suffix);
      const issues = (await openIssuesFor(ctx, id)).filter((i) => i.status !== "closed");
      if (issues.length) partIssues.push(`${p.label} (${id}): ${issues.map((i) => i.id).join(", ")}`);
    }
    const wireLines = wires.map((w) => `${w.id} ${w.signal}: ${slotById(w.from)?.label} -> ${slotById(w.to)?.label}${w.harness ? ` via ${slotById(w.harness)?.label}` : ""} (${w.voltageClass}, ${w.gauge}, ${w.color}${w.fromConnector ? `, ${w.fromConnector}` : ""}${w.toConnector ? ` -> ${w.toConnector}` : ""})`);
    return {
      text: `Circuit ${circuit.name} (${circuit.id}) on ${v.buildId}: ${circuit.description}\nParts: ${parts.map((p) => `${p.label} [${entityIdFor(p, v.suffix)}]`).join(", ")}.\nWires:\n- ${wireLines.join("\n- ")}${partIssues.length ? `\nOpen issues on this circuit: ${partIssues.join("; ")}` : "\nNo open issues on parts of this circuit."}`,
      data: { circuit, wires: wires.map((w) => w.id), parts: parts.map((p) => ({ slot: p.slot, entityId: entityIdFor(p, v.suffix) })) },
    };
  },
});

export const wiresOfPart = def({
  name: "wires_of_part",
  description: "List the wires and circuits connected to a part, with connectors, gauge and colour.",
  input: { entityId: z.string().nullable().optional(), slot: z.string().nullable().optional(), query: z.string().nullable().optional() },
  readOnly: true,
  async execute(ctx, input) {
    const p = resolvePart(ctx, input);
    if (!p) return { text: "Could not resolve the part.", ok: false };
    const wires = wiresForSlot(p.slot.slot);
    if (!wires.length) return { text: `${p.slot.label} has no wires in the platform wiring design.`, data: [] };
    ctx.ui.push({ type: "show_wiring", on: true });
    return { text: `${wires.length} wire(s) on ${p.slot.label}:\n- ${wires.map((w) => `${w.id} (${CIRCUITS.find((c) => c.id === w.circuitId)?.name}) ${w.signal}: ${slotById(w.from)?.label} -> ${slotById(w.to)?.label}, ${w.voltageClass} ${w.gauge} ${w.color}`).join("\n- ")}`, data: wires.map((w) => w.id) };
  },
});

export const impactOfPart = def({
  name: "impact_of_part",
  description: "For a part with an issue, find every recorded vehicle that contains parts from the same supplier batch or manufacturing lot, and which customers (fleets, dealers) received them. Uses the assembly trace; a proposed hold is not an applied hold.",
  input: { entityId: z.string().nullable().optional(), slot: z.string().nullable().optional(), query: z.string().nullable().optional(), vehicleBuildId: z.string().nullable().optional() },
  readOnly: true,
  async execute(ctx, input) {
    const p = resolvePart(ctx, input);
    if (!p) return { text: "Could not resolve the part.", ok: false };
    const rec = await ctx.client.getEntityContext(p.entityId);
    if (!rec.ok) return { text: `No backend record for ${p.entityId} (${rec.error.code}).`, ok: false };
    const o = rec.data.entity.origin;
    const root =
      // Roots use the canonical production lot id (ProductionOrigin.productionLotId), never the display batch code.
      o?.sourcingType === "supplier" && o.productionLotId ? { kind: "supplier_batch" as const, id: o.productionLotId } : o?.sourcingType === "in_house" && o.productionLotId ? { kind: "manufacturing_lot" as const, id: o.productionLotId } : { kind: "component_serial" as const, id: p.entityId };
    const r = await ctx.client.runTrace(`INC-${p.entityId}`, { contractVersion: "assembly-quality-v4", revisionId: CURRENT_REVISION_ALIAS, root, scope: { ...EV_TRACE_DEMO.scope, trackedPartNumber: rec.data.entity.partNumber, configurationAsOf: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") } });
    if (!r.ok) return { text: `Trace unavailable (${r.error.code}: ${r.error.message}).`, ok: false };
    const t = r.data;
    const vehicles = t.rows.filter((row) => row.entityKind === "vehicle");
    const current = vehicles.filter((row) => row.currentContainment);
    const custName = (id: string | null) => t.customers.find((c) => c.id === id)?.name ?? id ?? "not shipped";
    const shipped = current.filter((row) => row.locationState === "shipped");
    const byCustomer = new Map<string, string[]>();
    for (const row of shipped) byCustomer.set(custName(row.customerId), [...(byCustomer.get(custName(row.customerId)) ?? []), row.buildId ?? row.entityId]);
    // Display the batch/lot code operators know; the trace root itself uses the canonical lot id.
    const rootLabel = root.kind === "supplier_batch" ? `supplier batch ${o?.supplierBatchCode ?? root.id} (${supplierName(ctx, o?.supplierId)})` : root.kind === "manufacturing_lot" ? `in-house lot ${o?.manufacturingLotCode ?? root.id}` : `serial ${root.id}`;
    const lines = [
      `Root: ${rootLabel}.`,
      `Vehicles currently containing parts from it: ${current.length} (${t.counts.currentOnsiteVehicleCount} on site, ${t.counts.currentShippedVehicleCount} shipped). Historical-only: ${t.counts.historicalOnlyVehicleCount}. Quarantined components: ${t.counts.quarantinedComponentCount}. Unresolved origin: ${t.counts.unresolvedOnlyVehicleCount}.`,
      current.length ? `On site: ${current.filter((x) => x.locationState !== "shipped").map((x) => x.buildId).join(", ") || "none"}.` : "",
      byCustomer.size ? `Businesses you supplied to: ${[...byCustomer.entries()].map(([c, ids]) => `${c} (${ids.join(", ")})`).join("; ")}.` : "No shipped vehicle currently contains a part from this root.",
      `Grounding candidates are a review list only; no hold or customer notice is applied by this tool.`,
    ].filter(Boolean);
    return { text: lines.join("\n"), data: { root, counts: t.counts, customers: t.customers, vehicles: vehicles.map((v) => ({ id: v.entityId, current: v.currentContainment, historical: v.historicalContainment, location: v.locationState, customer: v.customerId })) } };
  },
});

export const markTool = def({
  name: "mark",
  description: "Draw a marker (circle) on the sketch on a part or a wire so it is included when an issue is opened. Use for 'circle the connector' or 'mark the wires the fault could be in'.",
  input: { entityId: z.string().nullable().optional(), slot: z.string().nullable().optional(), query: z.string().nullable().optional(), wireId: z.string().nullable().optional(), note: z.string().default("") },
  readOnly: false,
  async execute(ctx, input) {
    if (input.wireId) {
      ctx.ui.push({ type: "show_wiring", on: true });
      ctx.ui.push({ type: "mark", entityId: null, slot: null, wireId: input.wireId, note: input.note, zoneId: null, zoneLabel: null });
      return { text: `Marked wire ${input.wireId}.` };
    }
    const p = resolvePart(ctx, input);
    if (!p) return { text: "Could not resolve what to mark.", ok: false };
    ctx.ui.push({ type: "mark", entityId: p.entityId, slot: p.slot.slot, wireId: null, note: input.note, zoneId: null, zoneLabel: null });
    return { text: `Marked ${p.slot.label} (${p.entityId}).` };
  },
});

export const locateFault = def({
  name: "locate_fault",
  description: "Given a part and the symptom described, point to the specific location(s) inside that part where the fault is most likely (e.g. bracket flange for a misaligned charge port, vent membrane for a fogged headlamp, upper seal for door wind noise). Zooms to the part and places a labelled marker on each likely location. Design knowledge, not a confirmed cause.",
  input: { entityId: z.string().nullable().optional(), slot: z.string().nullable().optional(), query: z.string().nullable().optional(), symptom: z.string().describe("The observed problem in the user's words"), vehicleBuildId: z.string().nullable().optional() },
  readOnly: false,
  async execute(ctx, input) {
    const p = resolvePart(ctx, { ...input, query: input.query ?? input.symptom });
    if (!p) return { text: "Could not resolve which part the symptom is about.", ok: false };
    const zones = faultZonesFor(p.slot.slot);
    if (!zones.length) return { text: `${p.slot.label} (${p.entityId}) has no fault-location map on the exterior sketch; interior parts are recorded but not drawn.`, ok: false };
    const v = vehicleFor(ctx, input.vehicleBuildId);
    if (v.buildId !== ctx.context.vehicleBuildId) ctx.ui.push({ type: "select_vehicle", buildId: v.buildId });
    const last = ctx.ui[ctx.ui.length - 1];
    if (!(last && last.type === "focus_part" && last.entityId === p.entityId)) ctx.ui.push({ type: "focus_part", entityId: p.entityId, slot: p.slot.slot });
    const hits = matchFaultZones(p.slot.slot, input.symptom, 2);
    for (const zone of hits) ctx.ui.push({ type: "mark", entityId: p.entityId, slot: p.slot.slot, wireId: null, note: `Agent: ${zone.why}`, zoneId: zone.id, zoneLabel: zone.label });
    const matched = zones.some((zn) => zn.symptoms.test(input.symptom));
    return {
      text: `${matched ? "Likely location(s)" : "No symptom match; default location"} on ${p.slot.label} (${p.entityId}) for "${input.symptom}": ${hits.map((zn) => `${zn.label} (${zn.why})`).join("; ")}. Other places to check: ${zones.filter((zn) => !hits.includes(zn)).map((zn) => zn.label).join(", ") || "none"}. This is design knowledge to guide inspection, not a confirmed cause.`,
      data: { entityId: p.entityId, slot: p.slot.slot, zones: hits.map((zn) => zn.id) },
    };
  },
});

export const openIssueTool = def({
  name: "open_issue",
  description: "Open an existing issue by id in the workspace.",
  input: { issueId: z.string() },
  readOnly: true,
  async execute(ctx, { issueId }) {
    const r = await ctx.client.getIssue(issueId);
    if (!r.ok) return { text: `Issue ${issueId} not found (${r.error.code}).`, ok: false };
    ctx.ui.push({ type: "open_issue", issueId });
    return { text: `Opened ${issueId}: ${r.data.issue.title} [${r.data.issue.status}].` };
  },
});

export const draftIssueTool = def({
  name: "draft_issue",
  description: "Open the New Issue form prefilled with the marked or named parts and a note. The user reviews and saves; the agent never saves an issue itself.",
  input: { entityIds: z.array(z.string()).default([]), query: z.string().nullable().optional(), title: z.string().nullable().optional(), note: z.string().default("") },
  readOnly: false,
  async execute(ctx, input) {
    const ids = [...input.entityIds];
    if (!ids.length && input.query) {
      const p = resolvePart(ctx, { query: input.query });
      if (p) ids.push(p.entityId);
    }
    const v = vehicleFor(ctx, null);
    if (!ids.includes(v.entityId)) ids.push(v.entityId);
    ctx.ui.push({ type: "open_new_issue", entityIds: ids, title: input.title ?? null, note: input.note });
    return { text: `Opened a New Issue draft for ${ids.join(", ")}. Review and save it yourself; nothing is stored until you do.` };
  },
});

export const similarResolutionsTool = def({
  name: "similar_resolutions",
  description: "Retrieve prior verified fixes compatible with an issue, with match reasons and applicability warnings.",
  input: { issueId: z.string() },
  readOnly: true,
  async execute(ctx, { issueId }) {
    const r = await ctx.client.findSimilarResolutions(issueId);
    if (!r.ok) return { text: `Could not search (${r.error.code}).`, ok: false };
    if (!r.data.results.length) return { text: `No compatible prior fix for ${issueId}.`, data: [] };
    return { text: r.data.results.map((x) => `${x.sourceFixRevisionId} from ${x.sourceIssueId}: ${x.fixSummary}. Match: ${x.matchReasons.join("; ")}. Limits: ${x.applicabilityWarnings.join("; ") || "none"}. ${x.verificationId === "NONE" ? "Unverified suggestion." : `Verified ${x.verifiedAt}.`}`).join("\n"), data: r.data.results };
  },
});

export const cameraTool = def({
  name: "set_camera",
  description: "Rotate the 3D sketch to a preset view: iso, left, right, front, rear or top.",
  input: { preset: z.enum(["iso", "left", "right", "front", "rear", "top"]) },
  readOnly: true,
  async execute(ctx, { preset }) {
    ctx.ui.push({ type: "camera", preset });
    return { text: `Camera set to ${preset} view.` };
  },
});

export const selectVehicleTool = def({
  name: "select_vehicle",
  description: "Switch the sketch to another recorded vehicle by build id (e.g. DEMO-EV-006).",
  input: { buildId: z.string() },
  readOnly: true,
  async execute(ctx, { buildId }) {
    const v = SKETCH_VEHICLES.find((x) => x.buildId.toLowerCase() === buildId.toLowerCase());
    if (!v) return { text: `Vehicle ${buildId} is not one of the sketched vehicles (${SKETCH_VEHICLES.map((x) => x.buildId).join(", ")}).`, ok: false };
    ctx.ui.push({ type: "select_vehicle", buildId: v.buildId });
    return { text: `Showing ${v.buildId} (${v.modelName}).` };
  },
});


// ---------- graph relationship tools ----------

async function loadGraph(ctx: ToolContext): Promise<{ ok: true; g: WorkspaceGraph } | { ok: false; text: string }> {
  const r = await ctx.client.getGraph();
  if (!r.ok) return { ok: false, text: `Recorded graph unavailable (${r.error.code}: ${r.error.message}).` };
  return { ok: true, g: r.data };
}

function resolveSupplier(ctx: ToolContext, g: WorkspaceGraph, input: { supplierId?: string | null; query?: string | null }): string | null {
  const suppliers = g.nodes.filter((n) => n.kind === "Supplier");
  if (input.supplierId && suppliers.some((s) => s.id === input.supplierId)) return input.supplierId;
  const q = (input.query ?? input.supplierId ?? "").toLowerCase().trim();
  if (!q) return null;
  const byName = suppliers.find((s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) ?? ctx.catalog?.suppliers.find((s) => s.name.toLowerCase().includes(q));
  if (byName) return byName.id;
  // "harness supplier" -> part slots supplied by that supplier
  const slot = searchParts(q, 1)[0]?.slot;
  return slot?.sourcing === "supplier" && slot.supplierId ? slot.supplierId : null;
}

export const graphNeighbours = def({
  name: "graph_neighbours",
  description: "Walk the recorded relationship graph around any id (supplier, lot, part, vehicle, customer, issue, cause, fix, team) up to N hops and list the recorded relationships (the Graph view, if the user opens it, will be focused on it; the user is not moved there).",
  input: { id: z.string(), depth: z.number().int().min(1).max(4).default(2) },
  readOnly: true,
  async execute(ctx, { id, depth }) {
    const r = await loadGraph(ctx);
    if (!r.ok) return { text: r.text, ok: false };
    const g = r.g;
    const hit = nodeById(g, id) ?? g.nodes.find((n) => n.id.toLowerCase() === id.toLowerCase()) ?? g.nodes.find((n) => n.label.toLowerCase() === id.toLowerCase());
    if (!hit) return { text: `${id} is not in the recorded graph (${g.nodes.length} nodes, source ${g.source}).`, ok: false };
    ctx.ui.push({ type: "focus_graph", id: hit.id });
    return { text: describeSubgraph(g, hit.id, depth) };
  },
});

export const supplierExposure = def({
  name: "supplier_exposure",
  description: "For a supplier: its recorded lots, the parts from those lots, the vehicles currently containing them (on site vs shipped, with customers), the issues that link or affect them, and whether any confirmed cause names the supplier. Use for 'what else is affected by supplier X'.",
  input: { supplierId: z.string().nullable().optional(), query: z.string().nullable().optional() },
  readOnly: true,
  async execute(ctx, input) {
    const r = await loadGraph(ctx);
    if (!r.ok) return { text: r.text, ok: false };
    const g = r.g;
    const sid = resolveSupplier(ctx, g, input);
    if (!sid) return { text: `No recorded supplier matches ${input.supplierId ?? input.query ?? "(empty)"}. Recorded suppliers: ${g.nodes.filter((n) => n.kind === "Supplier").map((n) => `${n.label} (${n.id})`).join(", ")}.`, ok: false };
    const adj = adjacency(g);
    const sup = nodeById(g, sid)!;
    const lots = (adj.get(sid) ?? []).filter((x) => x.edge.type === "SUPPLIED_BY").map((x) => x.other);
    const parts = lots.flatMap((lot) => (adj.get(lot) ?? []).filter((x) => x.edge.type === "FROM_SUPPLIER_LOT").map((x) => x.other));
    const vehicles = new Map<string, string[]>();
    for (const p of parts) for (const v of vehiclesContaining(g, adj, p)) vehicles.set(v, [...(vehicles.get(v) ?? []), p]);
    const shipped: string[] = [];
    const onsite: string[] = [];
    for (const v of vehicles.keys()) {
      const cust = (adj.get(v) ?? []).filter((x) => x.edge.type === "SHIPPED_TO").map((x) => nodeById(g, x.other)?.label ?? x.other);
      if (cust.length) shipped.push(`${v} -> ${cust.join(", ")}`);
      else onsite.push(v);
    }
    const partSet = new Set(parts);
    const issuesAffecting = g.nodes.filter((n) => n.kind === "Issue" && (adj.get(n.id) ?? []).some((x) => x.edge.type === "AFFECTS" && partSet.has(x.other)));
    const issuesLinking = g.nodes.filter((n) => n.kind === "Issue" && (adj.get(n.id) ?? []).some((x) => x.edge.type === "LINKS_SUPPLIER" && x.other === sid));
    const causes = (adj.get(sid) ?? []).filter((x) => x.edge.type === "RESPONSIBLE_SUPPLIER").map((x) => nodeById(g, x.other)).filter((c): c is NonNullable<typeof c> => Boolean(c));
    const confirmed = causes.filter((c) => c.props.state === "confirmed");
    const fmtIssues = (list: typeof issuesAffecting) => list.map((i) => `${i.id} [${i.props.status}/${i.props.severity}] ${i.label}`).join("; ") || "none";
    ctx.ui.push({ type: "focus_graph", id: sid });
    const lines = [
      `${sup.label} (${sid}): ${lots.length} recorded lot(s) (${lots.map((l) => nodeById(g, l)?.label ?? l).join(", ") || "none"}), ${parts.length} part(s) from them.`,
      `Vehicles currently containing those parts: ${vehicles.size} (${onsite.length} on site: ${onsite.join(", ") || "none"}; ${shipped.length} shipped: ${shipped.join("; ") || "none"}).`,
      `Issues affecting those parts: ${issuesAffecting.length}. ${fmtIssues(issuesAffecting)}`,
      `Issues linking this supplier as context: ${issuesLinking.length}. ${fmtIssues(issuesLinking)}`,
      confirmed.length ? `Confirmed causes naming this supplier: ${confirmed.length} (${confirmed.map((c) => `${c.id} on ${c.props.issueId}`).join(", ")}).` : `No confirmed cause names this supplier${causes.length ? ` (${causes.length} hypothesis/rejected assessment(s) only)` : ""}; linked is not confirmed.`,
    ];
    return { text: lines.join("\n"), data: { supplierId: sid, lots, parts, vehicles: [...vehicles.keys()], issues: issuesAffecting.map((i) => i.id) } };
  },
});

export const relatedIssues = def({
  name: "related_issues",
  description: "Find issues related to a part through the recorded graph: issues on parts from the same supplier lot or in-house lot, issues on the same part number on other vehicles, and issues on the same vehicle. Use to identify whether a symptom is a one-off or a pattern.",
  input: { entityId: z.string().nullable().optional(), slot: z.string().nullable().optional(), query: z.string().nullable().optional(), vehicleBuildId: z.string().nullable().optional() },
  readOnly: true,
  async execute(ctx, input) {
    const p = input.entityId || input.slot || input.query ? resolvePart(ctx, input) : ctx.context.selectedEntityId ? resolvePart(ctx, { entityId: ctx.context.selectedEntityId }) : null;
    if (!p) return { text: "Name a part (entity id, slot or words) to look for related issues.", ok: false };
    const r = await loadGraph(ctx);
    if (!r.ok) return { text: r.text, ok: false };
    const g = r.g;
    const adj = adjacency(g);
    const me = nodeById(g, p.entityId);
    if (!me) return { text: `${p.entityId} has no record in the graph; related issues cannot be derived from it.`, ok: false };
    const lot = (adj.get(p.entityId) ?? []).find((x) => x.edge.type === "FROM_SUPPLIER_LOT" || x.edge.type === "PRODUCED_IN");
    const siblings = lot ? (adj.get(lot.other) ?? []).filter((x) => (x.edge.type === "FROM_SUPPLIER_LOT" || x.edge.type === "PRODUCED_IN") && x.other !== p.entityId).map((x) => x.other) : [];
    const samePn = g.nodes.filter((n) => n.kind === "Entity" && n.props.partNumber === me.props.partNumber && n.id !== p.entityId).map((n) => n.id);
    const vehicle = vehiclesContaining(g, adj, p.entityId)[0] ?? vehicleFor(ctx, input.vehicleBuildId).entityId;
    const issuesOn = (ids: string[]) => {
      const set = new Set(ids);
      return g.nodes.filter((n) => n.kind === "Issue" && (adj.get(n.id) ?? []).some((x) => x.edge.type === "AFFECTS" && set.has(x.other)));
    };
    const fmt = (list: ReturnType<typeof issuesOn>) => list.map((i) => `${i.id} [${i.props.status}/${i.props.severity}] ${i.label}`).join("; ") || "none";
    const own = issuesOn([p.entityId]);
    const lotIssues = issuesOn(siblings).filter((i) => !own.includes(i));
    const pnIssues = issuesOn(samePn).filter((i) => !own.includes(i) && !lotIssues.includes(i));
    const vehicleIssues = issuesOn([vehicle]).filter((i) => !own.includes(i));
    const causeOf = (i: (typeof own)[number]) => (adj.get(i.id) ?? []).filter((x) => x.edge.type === "ASSESSES").map((x) => nodeById(g, x.other)).filter(Boolean).map((c) => `${c!.props.state} ${c!.props.causeType}`).join(", ");
    const lotLabel = lot ? `${lot.edge.type === "FROM_SUPPLIER_LOT" ? "supplier lot" : "in-house lot"} ${nodeById(g, lot.other)?.label ?? lot.other}` : "no recorded lot";
    const pattern = lotIssues.length + own.length >= 2 ? `Pattern: ${own.length + lotIssues.length} issue(s) across parts from the same lot; treat the lot as a candidate, not a confirmed cause.` : lotIssues.length === 0 && pnIssues.length === 0 ? "No other issue on the same lot or part number: looks like a one-off so far." : `Same part number elsewhere: ${pnIssues.length} issue(s); same lot: ${lotIssues.length}.`;
    ctx.ui.push({ type: "focus_graph", id: p.entityId });
    return {
      text: [
        `${describeSlot(p.slot, p.entityId)} · ${lotLabel} · ${siblings.length} sibling part(s) from that lot · ${samePn.length} other part(s) with part number ${String(me.props.partNumber)}.`,
        `Issues on this part: ${own.length}. ${own.map((i) => `${i.id} [${i.props.status}] ${i.label}${causeOf(i) ? ` (cause: ${causeOf(i)})` : ""}`).join("; ") || "none"}`,
        `Issues on sibling parts from the same lot: ${lotIssues.length}. ${fmt(lotIssues)}`,
        `Issues on the same part number on other vehicles: ${pnIssues.length}. ${fmt(pnIssues)}`,
        `Other issues on vehicle ${vehicle}: ${vehicleIssues.length}. ${fmt(vehicleIssues)}`,
        pattern,
      ].join("\n"),
    };
  },
});

export const customersSupplied = def({
  name: "customers_supplied",
  description: "Who received vehicles with a defect: for an issue (default: the open issue on screen), a part, a defect code or a vehicle, list the distributors/dealers/fleet customers that were shipped vehicles carrying the affected parts, plus vehicles still on site, plus customers exposed through sibling parts from the same lot with no issue reported yet. Use for 'which distributors/customers/dealers did we supply cars with this defect to'.",
  input: { issueId: z.string().nullable().optional(), entityId: z.string().nullable().optional(), query: z.string().nullable().optional(), defectCode: z.string().nullable().optional(), vehicleBuildId: z.string().nullable().optional() },
  readOnly: true,
  async execute(ctx, input) {
    const r = await loadGraph(ctx);
    if (!r.ok) return { text: r.text, ok: false };
    const g = r.g;
    const adj = adjacency(g);
    const issueNodes = g.nodes.filter((n) => n.kind === "Issue");
    // 1. which issues are "these defects"
    let issues = issueNodes.filter((n) => n.id === (input.issueId ?? ctx.context.openIssueId));
    let basis = issues.length ? `issue ${issues[0]!.id}` : "";
    if (!issues.length && input.defectCode) {
      issues = issueNodes.filter((n) => n.props.defectCode === input.defectCode);
      basis = `defect code ${input.defectCode}`;
    }
    let partIds: string[] = [];
    if (!issues.length && (input.entityId || input.query)) {
      const p = resolvePart(ctx, input);
      if (p) {
        partIds = [p.entityId];
        issues = issueNodes.filter((n) => (adj.get(n.id) ?? []).some((x) => x.edge.type === "AFFECTS" && x.other === p.entityId));
        basis = `part ${p.entityId}`;
      }
    }
    if (!issues.length && !partIds.length) {
      const v = vehicleFor(ctx, input.vehicleBuildId);
      issues = issueNodes.filter((n) => n.props.status !== "closed" && (adj.get(n.id) ?? []).some((x) => x.edge.type === "AFFECTS" && (x.other === v.entityId || vehiclesContaining(g, adj, x.other).includes(v.entityId))));
      basis = `open issues on ${v.buildId}`;
    }
    if (!issues.length && !partIds.length) return { text: `No recorded issue matches (${basis || "nothing specified"}). Name an issue id, a part or a defect code.`, ok: false };
    // widen to every issue with the same defect codes (same defect on other vehicles)
    const codes = new Set(issues.map((i) => i.props.defectCode).filter((c): c is string => typeof c === "string"));
    const sameDefect = issueNodes.filter((n) => !issues.includes(n) && typeof n.props.defectCode === "string" && codes.has(n.props.defectCode));
    const allIssues = [...issues, ...sameDefect];
    // 2. affected parts and vehicles
    const affected = new Map<string, Set<string>>(); // vehicle -> issue ids
    const note = (vehicle: string, issueId: string) => affected.set(vehicle, new Set([...(affected.get(vehicle) ?? []), issueId]));
    for (const i of allIssues) {
      for (const { edge, other } of adj.get(i.id) ?? []) {
        if (edge.type !== "AFFECTS") continue;
        const n = nodeById(g, other);
        if (!n) continue;
        if (n.props.kind === "vehicle") note(other, i.id);
        else { partIds.push(other); for (const v of vehiclesContaining(g, adj, other)) note(v, i.id); }
      }
    }
    // 3. same-lot exposure without a reported issue
    const exposure = new Map<string, Set<string>>(); // vehicle -> lot labels
    for (const p of new Set(partIds)) {
      const lot = (adj.get(p) ?? []).find((x) => x.edge.type === "FROM_SUPPLIER_LOT" || x.edge.type === "PRODUCED_IN");
      if (!lot) continue;
      const lotLabel = nodeById(g, lot.other)?.label ?? lot.other;
      for (const { edge, other } of adj.get(lot.other) ?? []) {
        if (edge.type !== "FROM_SUPPLIER_LOT" && edge.type !== "PRODUCED_IN") continue;
        for (const v of vehiclesContaining(g, adj, other)) if (!affected.has(v)) exposure.set(v, new Set([...(exposure.get(v) ?? []), lotLabel]));
      }
    }
    // 4. customers
    const customerOf = (v: string) => (adj.get(v) ?? []).filter((x) => x.edge.type === "SHIPPED_TO" && x.out).map((x) => ({ id: x.other, name: nodeById(g, x.other)?.label ?? x.other }));
    const byCustomer = new Map<string, { name: string; vehicles: string[] }>();
    const onsite: string[] = [];
    for (const v of affected.keys()) {
      const cs = customerOf(v);
      if (!cs.length) { onsite.push(v); continue; }
      for (const c of cs) byCustomer.set(c.id, { name: c.name, vehicles: [...(byCustomer.get(c.id)?.vehicles ?? []), v] });
    }
    const exposedByCustomer = new Map<string, { name: string; vehicles: string[] }>();
    for (const v of exposure.keys()) for (const c of customerOf(v)) exposedByCustomer.set(c.id, { name: c.name, vehicles: [...(exposedByCustomer.get(c.id)?.vehicles ?? []), v] });
    const issueLine = (id: string) => { const n = nodeById(g, id); return n ? `${id} (${n.label}, ${n.props.status})` : id; };
    const lines = [
      `Basis: ${basis}${sameDefect.length ? ` plus ${sameDefect.length} other issue(s) with the same defect code` : ""}. Issues: ${allIssues.map((i) => i.id).join(", ")}.`,
      `Vehicles carrying the affected parts: ${affected.size} (${[...affected.keys()].join(", ") || "none"}).`,
      byCustomer.size
        ? `Distributors / customers that received them (${byCustomer.size}):\n${[...byCustomer.entries()].map(([id, c]) => `- ${c.name} (${id}): ${c.vehicles.map((v) => `${v} [${[...(affected.get(v) ?? [])].map(issueLine).join("; ")}]`).join("; ")}`).join("\n")}`
        : "No affected vehicle has been shipped: no distributor or customer received one.",
      onsite.length ? `Still on site (not shipped): ${onsite.join(", ")}.` : "",
      exposedByCustomer.size ? `Exposure without a reported issue (same lot as the affected parts): ${[...exposedByCustomer.entries()].map(([id, c]) => `${c.name} (${id}): ${c.vehicles.join(", ")}`).join("; ")}.` : exposure.size ? `Same-lot exposure without a reported issue, all on site: ${[...exposure.keys()].join(", ")}.` : "",
      "Recorded shipments only; this is a review list, not a notice or hold, and a linked supplier is not a confirmed cause.",
    ].filter(Boolean);
    return { text: lines.join("\n"), data: { issues: allIssues.map((i) => i.id), customers: [...byCustomer.entries()].map(([id, c]) => ({ id, ...c })), onsite, exposed: [...exposedByCustomer.entries()].map(([id, c]) => ({ id, ...c })) } };
  },
});

function agentIdempotencyKey(parts: string[]): string {
  let h = 2166136261;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `agent-${(h >>> 0).toString(16)}-${Date.now().toString(36)}`;
}

export const createIssueTool = def({
  name: "create_issue",
  description: "Create and save a new issue through the issue API (only when the user explicitly asks to create/open/log/raise an issue). Marks the named parts, records the reporting team and returns the saved issue id. Never closes, assigns or confirms anything.",
  input: {
    title: z.string().min(3).max(140),
    description: z.string().min(3).max(2000),
    severity: z.enum(["minor", "major", "critical"]).default("major"),
    entityIds: z.array(z.string()).default([]),
    query: z.string().nullable().optional(),
    partNumber: z.string().nullable().optional(),
    defectCode: z.string().nullable().optional(),
    linkedSupplierIds: z.array(z.string()).default([]),
    reportingTeamId: z.string().nullable().optional(),
    detectionStationId: z.string().nullable().optional(),
    processStepId: z.string().nullable().optional(),
  },
  readOnly: false,
  async execute(ctx, input) {
    const ids = [...input.entityIds];
    if (!ids.length && input.query) {
      const p = resolvePart(ctx, { query: input.query });
      if (p) ids.push(p.entityId);
    }
    if (!ids.length && ctx.context.selectedEntityId) ids.push(ctx.context.selectedEntityId);
    const v = vehicleFor(ctx, null);
    if (!ids.includes(v.entityId) && ids.some((id) => slotForEntityId(id)?.suffix === v.suffix)) ids.push(v.entityId);
    const cat = ctx.catalog;
    const team = input.reportingTeamId && cat?.teams.some((t) => t.id === input.reportingTeamId) ? input.reportingTeamId : cat?.teams.some((t) => t.id === EV_DEMO.teams.finalInspection) ? EV_DEMO.teams.finalInspection : cat?.teams[0]?.id;
    if (!team) return { text: "Cannot create an issue: no reporting team in the reference catalog.", ok: false };
    const badSuppliers = input.linkedSupplierIds.filter((s) => !cat?.suppliers.some((x) => x.id === s));
    if (badSuppliers.length) return { text: `Unknown supplier id(s): ${badSuppliers.join(", ")}. Use recorded supplier ids only.`, ok: false };
    const defect = input.defectCode && cat?.defectCodes.some((d) => d.id === input.defectCode) ? input.defectCode : null;
    const first = ids.map((id) => slotForEntityId(id)).find(Boolean);
    const partNumber = input.partNumber ?? first?.slot.partNumber ?? null;
    const partRevision = input.partNumber ? null : (first?.slot.partRevision ?? null);
    const r = await ctx.client.createIssue({
      idempotencyKey: agentIdempotencyKey([input.title, ...ids]),
      title: input.title,
      description: `${input.description}\n\nCreated by the assistant on the user's request.`,
      origin: "manual",
      detectedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      reportingTeamId: team,
      assignedTeamId: null,
      detectionStationId: input.detectionStationId && cat?.stations.some((s) => s.id === input.detectionStationId) ? input.detectionStationId : null,
      processStepId: input.processStepId && cat?.processSteps.some((s) => s.id === input.processStepId) ? input.processStepId : null,
      entityIds: ids,
      partNumber,
      partRevision,
      linkedSupplierIds: input.linkedSupplierIds,
      defectCode: defect,
      severity: input.severity,
      evidenceIds: [],
      newEvidence: [],
    });
    if (!r.ok) return { text: `Issue not created (${r.error.code}: ${r.error.message}).`, ok: false };
    ctx.ui.push({ type: "open_issue", issueId: r.data.id });
    return { text: `Created ${r.data.id} "${r.data.title}" [${r.data.status}, v${r.data.version}] reported by ${teamName(ctx, team)}; marked ${ids.join(", ") || "no items"}${input.linkedSupplierIds.length ? `; linked supplier(s) ${input.linkedSupplierIds.join(", ")} (context, not fault)` : ""}${input.defectCode && !defect ? `; defect code ${input.defectCode} not in catalog, left empty` : ""}.`, data: r.data };
  },
});

export const ALL_TOOLS: ToolDef[] = [findPart, focusPart, listIssuesForPart, locateFault, traceCircuit, wiresOfPart, impactOfPart, graphNeighbours, supplierExposure, relatedIssues, customersSupplied, markTool, openIssueTool, draftIssueTool, createIssueTool, similarResolutionsTool, cameraTool, selectVehicleTool] as unknown as ToolDef[];

export function toolByName(name: string): ToolDef | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

/** Validate input against the tool's zod shape and run it; never throws. */
export async function runTool(ctx: ToolContext, name: string, rawInput: unknown): Promise<{ record: { name: string; input: Record<string, unknown>; summary: string; ok: boolean; detail: string | null }; result: ToolResult }> {
  const t = toolByName(name);
  if (!t) return { record: { name, input: {}, summary: `unknown tool ${name}`, ok: false, detail: null }, result: { text: `Unknown tool ${name}.`, ok: false } };
  const parsed = z.object(t.input).safeParse(rawInput ?? {});
  if (!parsed.success) return { record: { name, input: (rawInput as Record<string, unknown>) ?? {}, summary: "invalid input", ok: false, detail: null }, result: { text: `Invalid input for ${name}: ${parsed.error.issues.map((i) => i.message).join("; ")}`, ok: false } };
  try {
    const result = await t.execute(ctx, parsed.data);
    const ok = result.ok !== false;
    return { record: { name, input: parsed.data as Record<string, unknown>, summary: result.text.split("\n")[0]!.slice(0, 140), ok, detail: result.text.slice(0, 4000) }, result: { ...result, ok } };
  } catch (e) {
    return { record: { name, input: parsed.data as Record<string, unknown>, summary: "tool failed", ok: false, detail: null }, result: { text: `Tool ${name} failed: ${e instanceof Error ? e.message : String(e)}`, ok: false } };
  }
}

export const SYSTEM_PROMPT = `You are the RecallRadius assembly-quality assistant for an EV plant. You help operators and quality engineers locate parts on the 3D vehicle sketch, trace wiring circuits, read part provenance (supplier batch vs in-house lot), list linked issues, find prior verified fixes and see which vehicles and customers are affected by a suspect batch or lot.
When the user describes a problem on a part, call locate_fault with their words so the sketch marks where inside the part to look, then list_issues_for_part.
The recorded relationship graph (supplier -> lot -> part -> vehicle -> customer; issue -> parts / linked suppliers / teams; cause -> responsible team or supplier; fix -> issue) is available through graph_neighbours, supplier_exposure and related_issues: use them to identify whether a symptom is a pattern (same lot, same part number, same supplier) and to explain exposure. When the user asks which distributors, dealers, fleets or customers received vehicles with a defect, call customers_supplied and answer with that list (customer, vehicles, issue); do not send the user to another screen.
Rules: use the tools for every factual statement; never invent part ids, suppliers, customers or causes. A linked supplier or producing team is not a confirmed cause. You may mark parts and open a prefilled issue draft (draft_issue). Create and save an issue with create_issue ONLY when the user explicitly asks you to create, open, log or raise one; otherwise use draft_issue. You never close, assign or transition issues and never confirm a cause. Keep answers short and operational. All data in this demo is synthetic.
Answer format (always): plain text only, no markdown (no **, no #, no tables, no code fences). First line: the direct answer in one sentence. Then one "- " bullet per item, restating ids, names, vehicles, customers and statuses exactly as the tool results give them, in a consistent order. Last line: what is not confirmed or what the list is not (e.g. "review list, not a notice; linked supplier is not a confirmed cause"). Do not paste raw tool output; normalise it into that structure.`;
