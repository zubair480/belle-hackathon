"use client";
/**
 * Vehicles view: three model cards, the 3D sketch stage with camera/wiring/marker controls and
 * the provenance rail. Explorer state (vehicle, selection, markers, circuit, wiring) is owned by
 * the workspace so the chat harness can drive the same screen.
 */
import { useEffect, useMemo, useState } from "react";
import type { SourcingType } from "@/contracts/common";
import type { Issue } from "@/contracts/issues";
import { useWorkspace, type CameraPreset } from "../../features/recall/context";
import type { EntityContext } from "@/contracts/common";
import type { ClientError as ClientErr, PlatformDesign as DesignDto } from "../../features/recall/api/types";
import { CAMERA_PRESETS, CIRCUITS, DEFAULT_CAMERA, PARTS, SKETCH_VEHICLES, SYSTEMS, WIRES, ZONES, bodyLines, describeWire, entityIdFor, isExteriorSlot, project, slotById, slotForEntityId, wiresForSlot, type SketchVehicle } from "../../features/recall/sketches/car3d";
import { PartPanel, type PartLoad } from "./PartPanel";
import { Banner } from "./primitives";
import { VehicleSketch3D, type HotspotInfo, type HoverDetail, type HoverTarget } from "./VehicleSketch3D";

export type VehicleExplorerProps = { instantZoom?: boolean };

function ModelThumb({ style }: { style: SketchVehicle["style"] }) {
  const cam = { ...DEFAULT_CAMERA, scale: 0.13 };
  const lines = bodyLines(style).filter((l) => !l.cls || l.cls === "thin");
  return (
    <svg viewBox="0 0 1000 560" aria-hidden="true">
      {lines.map((l, i) => (
        <path key={i} d={l.points.map((p, j) => { const s = project(p, cam); return `${j === 0 ? "M" : "L"} ${s.x.toFixed(0)} ${s.y.toFixed(0)}`; }).join(" ")} fill="none" stroke="#fff" strokeWidth={l.cls === "thin" ? 2 : 4} strokeLinecap="round" strokeLinejoin="round" opacity={l.cls === "thin" ? 0.5 : 0.95} />
      ))}
    </svg>
  );
}

const PRESET_LABELS: Record<CameraPreset, string> = { iso: "Iso", left: "Left", right: "Right", front: "Front", rear: "Rear", top: "Top" };

export function VehicleExplorer({ instantZoom = false }: VehicleExplorerProps) {
  const ws = useWorkspace();
  const ex = ws.explorer;
  const vehicle = SKETCH_VEHICLES.find((v) => v.buildId === ex.vehicleBuildId) ?? SKETCH_VEHICLES[0]!;
  const [filter, setFilter] = useState<SourcingType | "all">("all");
  const [contexts, setContexts] = useState<Record<string, PartLoad | undefined>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [wireInfo, setWireInfo] = useState<string | null>(null);
  const [design, setDesign] = useState<{ status: "loading" | "ready" | "error"; data: DesignDto | null; error: ClientErr | null }>({ status: "loading", data: null, error: null });
  /** Bundled wires the graph does not carry (the sketch draws the bundled design, so any drift is named). */
  const designDrift = useMemo(() => {
    if (design.status !== "ready" || !design.data) return null;
    const ids = new Set(design.data.wireIds);
    const missing = WIRES.filter((w) => !ids.has(w.id)).length;
    return missing ? `${missing} bundled wire(s) missing from the graph` : null;
  }, [design]);

  useEffect(() => {
    let cancelled = false;
    const sketchIds = PARTS.map((p) => entityIdFor(p, vehicle.suffix));
    setContexts(Object.fromEntries([vehicle.entityId, ...sketchIds].map((id) => [id, { status: "loading", data: null, error: null } as PartLoad])));
    setDesign({ status: "loading", data: null, error: null });
    // Vehicle record first, then only the parts the backend says are installed in it (children walked up to
    // three levels). Sketch parts the record does not contain are marked absent without a request; nothing is
    // invented for them. If the vehicle record itself fails, every part carries that error, not "absent".
    (async () => {
      const out: Record<string, PartLoad> = {};
      const v = await ws.client.getEntityContext(vehicle.entityId);
      out[vehicle.entityId] = v.ok ? { status: "ready", data: v.data, error: null } : { status: "error", data: null, error: v.error };
      const seen = new Set<string>([vehicle.entityId]);
      // Children = currently installed parts plus every part the record shows as installed there before
      // (removed/replaced parts keep their history and must stay visible).
      const childIds = (ctx: EntityContext, id: string) => [...new Set([...ctx.currentChildren.map((c) => c.id), ...ctx.installations.filter((i) => i.parentId === id).map((i) => i.childId)])];
      let queue: Array<{ id: string; depth: number }> = v.ok ? childIds(v.data, vehicle.entityId).map((id) => ({ id, depth: 1 })) : [];
      while (queue.length) {
        const batch = queue.filter((q) => !seen.has(q.id));
        queue = [];
        batch.forEach((q) => seen.add(q.id));
        const results = await Promise.all(batch.map(async (q) => ({ q, r: await ws.client.getEntityContext(q.id) })));
        for (const { q, r } of results) {
          out[q.id] = r.ok ? { status: "ready", data: r.data, error: null } : { status: "error", data: null, error: r.error };
          if (r.ok && q.depth < 3) for (const id of childIds(r.data, q.id)) if (!seen.has(id)) queue.push({ id, depth: q.depth + 1 });
        }
      }
      for (const id of sketchIds) if (!out[id]) out[id] = v.ok ? { status: "absent", data: null, error: null } : { status: "error", data: null, error: v.error };
      if (!cancelled) setContexts(out);
    })();
    ws.client.getPlatformDesign().then((r) => {
      if (!cancelled) setDesign(r.ok ? { status: "ready", data: r.data, error: null } : { status: "error", data: null, error: r.error });
    });
    ws.client.listIssues({ entityId: vehicle.entityId, limit: 200 }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setIssues(r.data.items);
        setIssuesError(null);
      } else {
        setIssues([]);
        setIssuesError(`${r.error.code}: ${r.error.message}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [vehicle, ws.client]);

  const info = useMemo(() => {
    const out: Record<string, HotspotInfo> = {};
    for (const [id, c] of Object.entries(contexts)) {
      if (!c) continue;
      out[id] = { sourcing: c.status === "ready" ? (c.data?.entity.origin?.sourcingType ?? "unknown") : null, recorded: c.status === "ready", openIssueCount: issues.filter((i) => i.status !== "closed" && i.entityIds.includes(id)).length };
    }
    return out;
  }, [contexts, issues]);

  const selectedSlot = ex.selectedEntityId ? PARTS.find((p) => entityIdFor(p, vehicle.suffix) === ex.selectedEntityId) : null;

  /** Tooltip content: what a component is for and where a wire goes. */
  const hoverDetails = (t: HoverTarget): HoverDetail => {
    if (t.wireId) {
      const w = WIRES.find((x) => x.id === t.wireId);
      if (!w) return null;
      const d = describeWire(w);
      const fromSlot = slotById(w.from);
      const toSlot = slotById(w.to);
      const ends = [fromSlot, toSlot].filter((x): x is NonNullable<typeof x> => Boolean(x)).map((x) => entityIdFor(x, vehicle.suffix));
      const endIssues = issues.filter((i) => i.status !== "closed" && i.entityIds.some((id) => ends.includes(id)));
      return {
        title: d.title,
        lines: [
          ...d.lines,
          `On this vehicle: ${ends.join(" → ")}`,
          endIssues.length ? `Open issues at the ends: ${endIssues.map((i) => i.id).join(", ")}` : "No open issues on the parts it joins",
          "Click to highlight its circuit · Mark mode to flag this wire",
        ],
      };
    }
    if (!t.entityId) return null;
    const hit = slotForEntityId(t.entityId);
    if (!hit) return null;
    const slot = hit.slot;
    const c = contexts[t.entityId];
    const o = c?.data?.entity.origin;
    const spec = Object.entries((slot.spec ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    const open = issues.filter((i) => i.status !== "closed" && i.entityIds.includes(t.entityId!));
    const wires = wiresForSlot(slot.slot);
    const lines = [
      `${SYSTEMS[slot.system] ?? slot.system} · ${ZONES[slot.zone] ?? slot.zone}${slot.side !== "C" ? ` · ${slot.side}` : ""}`,
      `Part ${slot.partNumber}${slot.partRevision ? ` rev ${slot.partRevision}` : ""}${slot.parent ? ` · inside ${slotById(slot.parent)?.label}` : ""}`,
      c?.status === "absent" ? "No backend record for this sketch part" : c?.status === "error" ? `Record unavailable (${c.error?.code ?? "error"})` : o?.sourcingType === "supplier" ? `Bought from ${ws.lookup.supplier(o.supplierId)} · batch ${o.supplierBatchCode}` : o?.sourcingType === "in_house" ? `Made in-house · lot ${o.manufacturingLotCode} · ${ws.lookup.process(o.processStepId)}` : "Unknown origin",
      ...spec.slice(0, 3),
      wires.length ? `${wires.length} wire(s): ${wires.slice(0, 3).map((w) => `${w.id} ${w.signal}`).join("; ")}${wires.length > 3 ? " …" : ""}` : "No wires in the wiring design",
      open.length ? `${open.length} open issue(s): ${open.map((i) => i.id).join(", ")}` : "No open issues",
      "Tap to zoom in and inspect",
    ];
    return { title: `${slot.label} · ${t.entityId}`, lines };
  };
  const setCamera = (preset: CameraPreset) => ws.setExplorer((s) => ({ cameraRequest: { preset, seq: (s.cameraRequest?.seq ?? 0) + 1 } }));
  const addMarker = (t: { entityId: string | null; slot: string | null; wireId: string | null }) =>
    ws.setExplorer((s) => ({ markers: [...s.markers, { id: `M-${Date.now().toString(36)}-${s.markers.length + 1}`, entityId: t.entityId, slot: t.slot, wireId: t.wireId, note: "", source: "user" }] }));
  const circuit = ex.circuitId ? CIRCUITS.find((c) => c.id === ex.circuitId) : null;

  return (
    <div>
      <div className="rrx-models" role="tablist" aria-label="Vehicle models">
        {SKETCH_VEHICLES.map((v) => (
          <button key={v.buildId} type="button" className="rrx-model" role="tab" aria-selected={v.buildId === vehicle.buildId} aria-pressed={v.buildId === vehicle.buildId} onClick={() => ws.setExplorer({ vehicleBuildId: v.buildId, selectedEntityId: null, markers: [], circuitId: null })}>
            <ModelThumb style={v.style} />
            <strong>
              {v.modelName} · {v.buildId}
            </strong>
            <span>{v.note}</span>
          </button>
        ))}
      </div>
      <div className="rrx-split rrx-split--wide">
        <div>
          <div className="rrx-stage rrx-stage--3d">
            <VehicleSketch3D
              style={vehicle.style}
              suffix={vehicle.suffix}
              info={info}
              selectedEntityId={ex.selectedEntityId}
              onSelect={(id) => ws.setExplorer({ selectedEntityId: id })}
              sourcingFilter={filter}
              markers={ex.markers}
              circuitId={ex.circuitId}
              wiring={ex.wiring && design.status === "ready"}
              markMode={ex.markMode}
              onMark={addMarker}
              onWireSelect={(wireId) => {
                const w = WIRES.find((x) => x.id === wireId);
                if (!w) return;
                const d = describeWire(w);
                setWireInfo(`${d.title} · ${d.lines.join(" · ")}`);
                ws.setExplorer({ wiring: true, circuitId: w.circuitId });
              }}
              hoverDetails={hoverDetails}
              onWireHover={(wireId) => {
                if (!wireId) return;
                const w = WIRES.find((x) => x.id === wireId);
                if (!w) return;
                const d = describeWire(w);
                setWireInfo(`${d.title} · ${d.lines.join(" · ")}`);
              }}
              cameraRequest={ex.cameraRequest}
              instant={instantZoom}
            />
            <div className="rrx-stage-hud">
              <span className="rrx-badge rrx-badge--muted">{vehicle.modelName} · 3D · exterior parts</span>
              {selectedSlot ? (
                isExteriorSlot(selectedSlot.slot) ? <span className="rrx-badge rrx-badge--accent">Zoomed: {selectedSlot.label} · attached wires shown · hover for details</span> : <span className="rrx-badge rrx-badge--warning">{selectedSlot.label}: interior part, recorded but not drawn on the exterior sketch</span>
              ) : (
                <span className="rrx-muted rrx-small">Drag to rotate · wheel to zoom · tap a part to inspect · hover for details</span>
              )}
            </div>
            <div className="rrx-stage-hud-right" role="group" aria-label="Sketch controls">
              {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((p) => (
                <button key={p} type="button" className="rrx-btn rrx-btn--sm rrx-btn--ghost" onClick={() => setCamera(p)} data-testid={`camera-${p}`}>
                  {PRESET_LABELS[p]}
                </button>
              ))}
              <button type="button" className={`rrx-btn rrx-btn--sm${ex.wiring ? "" : " rrx-btn--ghost"}`} aria-pressed={ex.wiring} onClick={() => ws.setExplorer({ wiring: !ex.wiring })} data-testid="toggle-wiring">
                Wiring
              </button>
              <button type="button" className={`rrx-btn rrx-btn--sm${ex.markMode ? " rrx-btn--danger" : " rrx-btn--ghost"}`} aria-pressed={ex.markMode} onClick={() => ws.setExplorer({ markMode: !ex.markMode })} data-testid="toggle-mark">
                {ex.markMode ? "Marking: tap parts/wires" : "Mark"}
              </button>
              {ex.selectedEntityId ? (
                <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => ws.setExplorer({ selectedEntityId: null })}>
                  Reset view
                </button>
              ) : null}
            </div>
            <div className="rrx-stage-legend" aria-hidden="true">
              <span><span className="rrx-legend-swatch" style={{ background: "var(--rr-supplier)" }} />Bought from supplier</span>
              <span><span className="rrx-legend-swatch" style={{ background: "var(--rr-inhouse)" }} />Made in-house</span>
              <span><span className="rrx-legend-swatch" style={{ background: "var(--rr-unknown)" }} />Unknown origin</span>
              <span><span className="rrx-legend-swatch" style={{ background: "var(--rr-blocking)" }} />Open issue / marker</span>
              {ex.wiring ? (
                <>
                  <span><span className="rrx-legend-swatch" style={{ background: "#fb923c" }} />HV wire</span>
                  <span><span className="rrx-legend-swatch" style={{ background: "#7dd3fc" }} />12 V wire</span>
                  <span><span className="rrx-legend-swatch" style={{ background: "#a7f3d0" }} />Signal / CAN</span>
                </>
              ) : null}
            </div>
          </div>
          {ex.wiring || wireInfo ? (
            <div className="rrx-row" style={{ marginTop: 8 }}>
              <label className="rrx-label" htmlFor="circuit-select">Circuit</label>
              <select id="circuit-select" value={ex.circuitId ?? ""} onChange={(e) => ws.setExplorer({ circuitId: e.target.value || null })} style={{ background: "#000", border: "1px solid var(--rr-border-strong)", borderRadius: 6, padding: "4px 8px" }} data-testid="circuit-select">
                <option value="">All circuits</option>
                {CIRCUITS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
              {circuit ? <span className="rrx-muted rrx-small">{circuit.description}</span> : null}
              {wireInfo ? <span className="rrx-small" data-testid="wire-info">{wireInfo}</span> : null}
            </div>
          ) : null}
          <p className="rrx-muted rrx-small" data-testid="design-source">
            {design.status === "ready" && design.data
              ? `Design data: ${design.data.source === "neo4j" ? "Neo4j graph" : "bundled JSON"} · ${design.data.platform}/${design.data.revision} · ${design.data.counts.slots} slots · ${design.data.counts.wires} wires · ${design.data.counts.circuits} circuits${designDrift ? ` · ${designDrift}` : ""}`
              : design.status === "error" && design.error
                ? `Design graph unavailable (${design.error.code}): wiring overlay disabled until the design dataset can be read`
                : "Loading design data"}
          </p>
          <p className="rrx-muted rrx-small" style={{ marginTop: 8 }}>
            Wireframe is illustrative geometry; part positions, wiring paths and colours come from the platform design data, while provenance, containment and issues come from the recorded data. Left/right follow the driver's seat on the left.
          </p>
          {issuesError ? <Banner kind="error">Issue list unavailable for this vehicle: {issuesError}</Banner> : null}
        </div>
        <PartPanel vehicle={vehicle} contexts={contexts} issues={issues} sourcingFilter={filter} onFilter={setFilter} />
      </div>
    </div>
  );
}
