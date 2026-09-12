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
import { CAMERA_PRESETS, CIRCUITS, DEFAULT_CAMERA, PARTS, SKETCH_VEHICLES, WIRES, bodyLines, entityIdFor, project, slotById, type SketchVehicle } from "../../features/recall/sketches/car3d";
import { PartPanel, type PartLoad } from "./PartPanel";
import { Banner } from "./primitives";
import { VehicleSketch3D, type HotspotInfo } from "./VehicleSketch3D";

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

  useEffect(() => {
    let cancelled = false;
    const ids = [vehicle.entityId, ...PARTS.map((p) => entityIdFor(p, vehicle.suffix))];
    setContexts(Object.fromEntries(ids.map((id) => [id, { status: "loading", data: null, error: null } as PartLoad])));
    Promise.all(
      ids.map(async (id) => {
        const r = await ws.client.getEntityContext(id);
        return [id, r.ok ? ({ status: "ready", data: r.data, error: null } as PartLoad) : ({ status: "error", data: null, error: r.error } as PartLoad)] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setContexts(Object.fromEntries(entries));
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
      out[id] = { sourcing: c.status === "ready" ? (c.data?.entity.origin?.sourcingType ?? "unknown") : null, recorded: c.status !== "error", openIssueCount: issues.filter((i) => i.status !== "closed" && i.entityIds.includes(id)).length };
    }
    return out;
  }, [contexts, issues]);

  const selectedSlot = ex.selectedEntityId ? PARTS.find((p) => entityIdFor(p, vehicle.suffix) === ex.selectedEntityId) : null;
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
              wiring={ex.wiring}
              markMode={ex.markMode}
              onMark={addMarker}
              onWireSelect={(wireId) => {
                const w = WIRES.find((x) => x.id === wireId);
                if (!w) return;
                setWireInfo(`${w.id} · ${CIRCUITS.find((c) => c.id === w.circuitId)?.name} · ${w.signal}: ${slotById(w.from)?.label} → ${slotById(w.to)?.label}${w.harness ? ` via ${slotById(w.harness)?.label}` : ""} · ${w.voltageClass} ${w.gauge} ${w.color}${w.fromConnector ? ` · ${w.fromConnector}` : ""}${w.toConnector ? ` → ${w.toConnector}` : ""}`);
              }}
              cameraRequest={ex.cameraRequest}
              instant={instantZoom}
            />
            <div className="rrx-stage-hud">
              <span className="rrx-badge rrx-badge--muted">{vehicle.modelName} · 3D</span>
              {selectedSlot ? <span className="rrx-badge rrx-badge--accent">Zoomed: {selectedSlot.label}</span> : <span className="rrx-muted rrx-small">Drag to rotate · wheel to zoom · tap a part</span>}
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
          {ex.wiring ? (
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
          <p className="rrx-muted rrx-small" style={{ marginTop: 8 }}>
            Wireframe is illustrative geometry for the synthetic platform; part positions, wiring paths and colours come from the platform design data, while provenance, containment and issues come from the recorded backend data. Left/right follow the driver's seat on the left.
          </p>
          {issuesError ? <Banner kind="error">Issue list unavailable for this vehicle: {issuesError}</Banner> : null}
        </div>
        <PartPanel vehicle={vehicle} contexts={contexts} issues={issues} sourcingFilter={filter} onFilter={setFilter} />
      </div>
    </div>
  );
}
