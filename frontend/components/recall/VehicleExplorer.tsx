"use client";
/**
 * Vehicles view: three model cards, the animated sketch stage and the provenance rail.
 * Part records are fetched per entity from the API; sketch geometry is UI-only.
 */
import { useEffect, useMemo, useState } from "react";
import type { SourcingType } from "@/contracts/common";
import type { Issue } from "@/contracts/issues";
import { useWorkspace } from "../../features/recall/context";
import { SKETCH_VEHICLES, allParts, modelById, type SketchVehicle } from "../../features/recall/sketches/models";
import { PartPanel, type PartLoad } from "./PartPanel";
import { Banner } from "./primitives";
import { VehicleSketch, type HotspotInfo } from "./VehicleSketch";

export type VehicleExplorerProps = { focusEntityId?: string | null; instantZoom?: boolean };

function ModelThumb({ modelId }: { modelId: string }) {
  const m = modelById(modelId);
  return (
    <svg viewBox="0 0 1000 480" aria-hidden="true">
      {m.lines.slice(0, 5).map((l, i) => (
        <path key={i} d={l.d} fill="none" stroke="#fff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      ))}
    </svg>
  );
}

export function VehicleExplorer({ focusEntityId = null, instantZoom = false }: VehicleExplorerProps) {
  const ws = useWorkspace();
  const initialVehicle = useMemo(() => {
    if (focusEntityId) {
      for (const v of SKETCH_VEHICLES) {
        if (v.entityId === focusEntityId) return v;
        if (allParts(modelById(v.modelId)).some((p) => p.part.entityId(v.suffix) === focusEntityId)) return v;
      }
    }
    return SKETCH_VEHICLES[0]!;
  }, [focusEntityId]);
  const [vehicle, setVehicle] = useState<SketchVehicle>(initialVehicle);
  const [selected, setSelected] = useState<string | null>(focusEntityId && focusEntityId !== initialVehicle.entityId ? focusEntityId : null);
  const [filter, setFilter] = useState<SourcingType | "all">("all");
  const [contexts, setContexts] = useState<Record<string, PartLoad | undefined>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const model = modelById(vehicle.modelId);

  useEffect(() => {
    setVehicle(initialVehicle);
    setSelected(focusEntityId && focusEntityId !== initialVehicle.entityId ? focusEntityId : null);
  }, [initialVehicle, focusEntityId]);

  // Load every drawn part's record (plus the vehicle) for the current vehicle.
  useEffect(() => {
    let cancelled = false;
    const ids = [vehicle.entityId, ...allParts(model).map((p) => p.part.entityId(vehicle.suffix))];
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
  }, [vehicle, model, ws.client]);

  const info = useMemo(() => {
    const out: Record<string, HotspotInfo> = {};
    for (const [id, c] of Object.entries(contexts)) {
      if (!c) continue;
      out[id] = {
        sourcing: c.status === "ready" ? (c.data?.entity.origin?.sourcingType ?? "unknown") : null,
        recorded: c.status !== "error",
        openIssueCount: issues.filter((i) => i.status !== "closed" && i.entityIds.includes(id)).length,
      };
    }
    return out;
  }, [contexts, issues]);

  const selectedLabel = selected ? allParts(model).find((p) => p.part.entityId(vehicle.suffix) === selected)?.part.label : null;

  return (
    <div>
      <div className="rrx-models" role="tablist" aria-label="Vehicle models">
        {SKETCH_VEHICLES.map((v) => (
          <button
            key={v.buildId}
            type="button"
            className="rrx-model"
            role="tab"
            aria-selected={v.buildId === vehicle.buildId}
            aria-pressed={v.buildId === vehicle.buildId}
            onClick={() => {
              setVehicle(v);
              setSelected(null);
            }}
          >
            <ModelThumb modelId={v.modelId} />
            <strong>
              {modelById(v.modelId).name} · {v.buildId}
            </strong>
            <span>{v.note}</span>
          </button>
        ))}
      </div>
      <div className="rrx-split rrx-split--wide">
        <div>
          <div className="rrx-stage">
            <VehicleSketch model={model} suffix={vehicle.suffix} info={info} selectedEntityId={selected} onSelect={setSelected} sourcingFilter={filter} instant={instantZoom} />
            <div className="rrx-stage-hud">
              <span className="rrx-badge rrx-badge--muted">{model.name}</span>
              {selectedLabel ? <span className="rrx-badge rrx-badge--accent">Zoomed: {selectedLabel}</span> : <span className="rrx-muted rrx-small">Tap a part to zoom in</span>}
            </div>
            <div className="rrx-stage-hud-right">
              {selected ? (
                <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => setSelected(null)}>
                  Reset view
                </button>
              ) : null}
            </div>
            <div className="rrx-stage-legend" aria-hidden="true">
              <span><span className="rrx-legend-swatch" style={{ background: "var(--rr-supplier)" }} />Bought from supplier</span>
              <span><span className="rrx-legend-swatch" style={{ background: "var(--rr-inhouse)" }} />Made in-house</span>
              <span><span className="rrx-legend-swatch" style={{ background: "var(--rr-unknown)" }} />Unknown origin</span>
              <span><span className="rrx-legend-swatch" style={{ background: "var(--rr-blocking)" }} />Open issue</span>
            </div>
          </div>
          <p className="rrx-muted rrx-small" style={{ marginTop: 8 }}>
            Sketches are illustrative line art for the synthetic demo vehicles; part provenance, containment and issues come from the recorded data. One bounded charge-port path is modeled in depth; the other parts show sourcing only.
          </p>
          {issuesError ? <Banner kind="error">Issue list unavailable for this vehicle: {issuesError}</Banner> : null}
        </div>
        <PartPanel vehicle={vehicle} model={model} contexts={contexts} issues={issues} selectedEntityId={selected} onSelect={setSelected} sourcingFilter={filter} onFilter={setFilter} />
      </div>
    </div>
  );
}
