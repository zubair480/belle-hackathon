"use client";
/**
 * 3D wireframe EV sketch rendered in SVG from frontend/features/recall/sketches/car3d.ts.
 * Mild perspective, white lines on black; drag to rotate, wheel to zoom, tap a part to zoom onto
 * it. Two layers: "outside" (body shell + exterior parts) and "inside" (ghosted body + cabin,
 * electrical, powertrain). Only the active layer's parts are rendered and interactive. Zooming
 * onto a part reveals its children and attached wires; wires are smoothed routes with lane
 * offsets, connector dots and gauge-based thickness. Hovering shows a detail tooltip.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import type { SourcingType } from "@/contracts/common";
import type { CameraPreset, SketchMarker } from "../../features/recall/context";
import { CAMERA_PRESETS, DEFAULT_CAMERA, PARTS, VIEW, WIRES, bodyLines, boxEdges, cameraForPart, entityIdFor, isExteriorSlot, lerpCamera, partBox, project, slotForEntityId, wirePath, wireWidth, wiresNear, type BodyStyle, type Camera, type PartSlot, type Vec3, type ViewLayer } from "../../features/recall/sketches/car3d";

export type HotspotInfo = { sourcing: SourcingType | null; openIssueCount: number; recorded: boolean };
export type HoverTarget = { entityId?: string; wireId?: string };
export type HoverDetail = { title: string; lines: string[] } | null;

export type VehicleSketch3DProps = {
  style: BodyStyle;
  suffix: string;
  info: Record<string, HotspotInfo | undefined>;
  selectedEntityId: string | null;
  onSelect: (entityId: string | null) => void;
  sourcingFilter: SourcingType | "all";
  markers: SketchMarker[];
  circuitId: string | null;
  wiring: boolean;
  markMode: boolean;
  layer: ViewLayer;
  onMark: (target: { entityId: string | null; slot: string | null; wireId: string | null }) => void;
  onWireSelect?: (wireId: string) => void;
  hoverDetails?: (target: HoverTarget) => HoverDetail;
  cameraRequest: { preset: CameraPreset; seq: number } | null;
  instant?: boolean;
};

const DUR = 650;

type P2 = { x: number; y: number; depth: number };
const proj = (pts: Vec3[], cam: Camera): P2[] => pts.map((p) => project(p, cam));
const avgDepth = (pts: P2[]) => pts.reduce((a, p) => a + p.depth, 0) / Math.max(1, pts.length);
const polyD = (pts: P2[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
/** Smooth polyline through waypoints with quadratic curves (midpoint scheme). */
const smoothD = (pts: P2[]) => {
  if (pts.length < 3) return polyD(pts);
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i]!;
    const n = pts[i + 1]!;
    const mx = (c.x + n.x) / 2;
    const my = (c.y + n.y) / 2;
    d += ` Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
};
const depthOpacity = (depth: number) => 0.4 + 0.6 * (1 - Math.min(1, Math.max(0, (depth + 1400) / 2800)));

export function VehicleSketch3D(props: VehicleSketch3DProps) {
  const { style, suffix, info, selectedEntityId, onSelect, sourcingFilter, markers, circuitId, wiring, markMode, layer, onMark, onWireSelect, hoverDetails, cameraRequest, instant = false } = props;
  const [cam, setCam] = useState<Camera>(DEFAULT_CAMERA);
  const camRef = useRef<Camera>(DEFAULT_CAMERA);
  camRef.current = cam;
  const raf = useRef<number | null>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[]; kind: "part" | "wire"; id: string } | null>(null);

  const animateTo = useCallback(
    (target: Camera) => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (instant || typeof requestAnimationFrame === "undefined") {
        setCam(target);
        return;
      }
      const from = camRef.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / DUR);
        setCam(lerpCamera(from, target, t));
        if (t < 1) raf.current = requestAnimationFrame(step);
        else raf.current = null;
      };
      raf.current = requestAnimationFrame(step);
    },
    [instant],
  );
  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
  }, []);

  const selected = useMemo(() => (selectedEntityId ? slotForEntityId(selectedEntityId) : null), [selectedEntityId]);

  useEffect(() => {
    if (selected) animateTo(cameraForPart(selected.slot, style, camRef.current));
    else animateTo({ ...DEFAULT_CAMERA, yaw: camRef.current.yaw, pitch: camRef.current.pitch });
  }, [selected, style, animateTo]);

  const lastSeq = useRef<number>(-1);
  useEffect(() => {
    if (!cameraRequest || cameraRequest.seq === lastSeq.current) return;
    lastSeq.current = cameraRequest.seq;
    const p = CAMERA_PRESETS[cameraRequest.preset] ?? CAMERA_PRESETS.iso!;
    animateTo({ ...camRef.current, yaw: p.yaw, pitch: p.pitch, ...(selected ? {} : { scale: DEFAULT_CAMERA.scale, target: DEFAULT_CAMERA.target }) });
  }, [cameraRequest, animateTo, selected]);

  useEffect(() => {
    setCam((c) => ({ ...DEFAULT_CAMERA, yaw: c.yaw, pitch: c.pitch }));
    setTip(null);
  }, [suffix, style]);

  // ---- pointer interaction ----
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, yaw: camRef.current.yaw, pitch: camRef.current.pitch, moved: false };
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    setTip(null);
    setCam((c) => ({ ...c, yaw: d.yaw - dx * 0.006, pitch: Math.max(-0.3, Math.min(1.5, d.pitch + dy * 0.006)) }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setCam((c) => ({ ...c, scale: Math.max(0.06, Math.min(1.2, c.scale * (e.deltaY > 0 ? 0.9 : 1.1))) }));
  };
  const clickBackground = () => {
    if (drag.current?.moved) return;
    onSelect(null);
  };
  const tapPart = (slot: PartSlot, entityId: string) => {
    if (drag.current?.moved) return;
    if (markMode) onMark({ entityId, slot: slot.slot, wireId: null });
    else onSelect(entityId);
  };
  const key = (e: KeyboardEvent, slot: PartSlot, entityId: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tapPart(slot, entityId);
    }
    if (e.key === "Escape") onSelect(null);
  };
  const showTip = (kind: "part" | "wire", id: string, target: HoverTarget, e: { clientX: number; clientY: number }) => {
    const detail = hoverDetails?.(target) ?? null;
    if (!detail) return;
    const rect = wrap.current?.getBoundingClientRect();
    setTip({ kind, id, title: detail.title, lines: detail.lines, x: rect ? e.clientX - rect.left : 0, y: rect ? e.clientY - rect.top : 0 });
  };
  const moveTip = (e: { clientX: number; clientY: number }) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    setTip((t) => (t ? { ...t, x: e.clientX - rect.left, y: e.clientY - rect.top } : t));
  };

  // ---- geometry ----
  const body = useMemo(() => bodyLines(style), [style]);
  const zoomed = cam.scale > DEFAULT_CAMERA.scale * 1.35;
  const selectedTop = selected ? (selected.slot.parent ?? selected.slot.slot) : null;
  const neighbourhood = useMemo(() => {
    if (!selected) return [];
    const top = selected.slot.parent ?? selected.slot.slot;
    return [top, ...PARTS.filter((p) => p.parent === top).map((p) => p.slot)];
  }, [selected]);

  const inLayer = (p: PartSlot) => (layer === "outside" ? isExteriorSlot(p.slot) : !isExteriorSlot(p.slot));
  const visibleParts = PARTS.filter((p) => {
    if (!partBox(p.slot, style)) return false;
    if (!inLayer(p) && !(selectedTop && (p.slot === selectedTop || p.parent === selectedTop))) return false;
    if (!p.parent) return true;
    return selectedTop === p.parent || cam.scale > 0.45;
  });
  const visibleSlots = new Set(visibleParts.map((p) => p.slot));

  /** Global wiring shows everything; zooming onto a part reveals the wires attached to it and its children. */
  const wiresToShow = wiring ? WIRES : selected && zoomed ? wiresNear(neighbourhood) : [];
  const labelFor = (p: PartSlot, entityId: string, isSel: boolean, meta: HotspotInfo | undefined) =>
    isSel || hover === entityId || (meta?.openIssueCount ?? 0) > 0 || markers.some((m) => m.entityId === entityId) || cam.scale > 0.3 || (Boolean(selectedTop) && p.parent === selectedTop);
  const highlightedWireIds = new Set(markers.filter((m) => m.wireId).map((m) => m.wireId!));
  const bodyOpacityScale = layer === "inside" ? 0.22 : 1;

  return (
    <div className="rrx-sketch-wrap" ref={wrap}>
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={`${style} 3D sketch, ${layer} view`}
        data-testid="vehicle-sketch"
        data-zoomed={zoomed}
        data-mark-mode={markMode}
        data-layer={layer}
        data-wires-visible={wiresToShow.length}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          onPointerUp();
          setTip(null);
        }}
        onWheel={onWheel}
        onClick={clickBackground}
        onDoubleClick={() => animateTo({ ...DEFAULT_CAMERA })}
        style={{ cursor: markMode ? "crosshair" : drag.current ? "grabbing" : "grab" }}
      >
        <g key={`${style}-${suffix}-${layer}`} className={`rrx-layer rrx-layer--${layer}`}>
          {body.map((l, i) => {
            const pts = proj(l.points, cam);
            return <path key={i} d={polyD(pts)} className={`rrx-sketch-line${l.cls ? ` rrx-sketch-line--${l.cls}` : ""}`} style={{ opacity: (l.cls === "dashed" ? 0.5 : depthOpacity(avgDepth(pts))) * bodyOpacityScale }} vectorEffect="non-scaling-stroke" />;
          })}

          {wiresToShow.map((w) => {
            const pts3 = wirePath(w, style);
            if (pts3.length < 2) return null;
            const pts = proj(pts3, cam);
            const d = smoothD(pts);
            const inCircuit = circuitId ? w.circuitId === circuitId : true;
            const marked = highlightedWireIds.has(w.id);
            const hovered = tip?.kind === "wire" && tip.id === w.id;
            const cls = `rrx-wire rrx-wire--${w.voltageClass.toLowerCase()}${inCircuit ? " rrx-wire--active" : " rrx-wire--dim"}${marked ? " rrx-wire--marked" : ""}${hovered ? " rrx-wire--hover" : ""}`;
            const a = pts[1] ?? pts[0]!;
            const b = pts[pts.length - 2] ?? pts[pts.length - 1]!;
            const width = wireWidth(w);
            return (
              <g
                key={w.id}
                className="rrx-wire-group"
                data-testid={`wire-${w.id}`}
                data-active={inCircuit}
                onClick={(e) => {
                  e.stopPropagation();
                  if (drag.current?.moved) return;
                  if (markMode) onMark({ entityId: null, slot: null, wireId: w.id });
                  else onWireSelect?.(w.id);
                }}
                onPointerEnter={(e) => showTip("wire", w.id, { wireId: w.id }, e)}
                onPointerMove={moveTip}
                onPointerLeave={() => setTip((t) => (t?.id === w.id ? null : t))}
              >
                <path d={d} className="rrx-wire-hit" vectorEffect="non-scaling-stroke" />
                <path d={d} className={cls} style={{ opacity: inCircuit ? Math.max(0.55, depthOpacity(avgDepth(pts))) : 0.12, strokeWidth: hovered || marked ? width + 1.6 : width }} vectorEffect="non-scaling-stroke" />
                {inCircuit ? (
                  <>
                    <circle className="rrx-wire-end" cx={a.x} cy={a.y} r={2.6} />
                    <circle className="rrx-wire-end" cx={b.x} cy={b.y} r={2.6} />
                  </>
                ) : null}
              </g>
            );
          })}

          {visibleParts.map((p) => {
            const box = partBox(p.slot, style)!;
            const entityId = entityIdFor(p, suffix);
            const meta = info[entityId];
            const sourcing = meta?.sourcing ?? null;
            const dimmed = sourcingFilter !== "all" && (sourcing ?? "unknown") !== sourcingFilter;
            const isSel = selectedEntityId === entityId;
            const inNeighbourhood = neighbourhood.includes(p.slot);
            const featured = isSel || hover === entityId || (meta?.openIssueCount ?? 0) > 0 || markers.some((m) => m.entityId === entityId) || inNeighbourhood;
            const c = project(box.center, cam);
            const r = Math.max(9, Math.min(110, Math.max(box.size[0], box.size[1], box.size[2]) * cam.scale * 0.5));
            const edges = boxEdges(box).map((e) => proj(e.points, cam));
            const depthOp = depthOpacity(c.depth);
            const baseOp = featured || zoomed ? depthOp : layer === "inside" ? depthOp * 0.7 : depthOp * 0.5;
            const showLabel = labelFor(p, entityId, isSel, meta);
            return (
              <g
                key={p.slot}
                className="rrx-hotspot"
                data-selected={isSel}
                data-sourcing={sourcing ?? "unknown"}
                data-has-issue={(meta?.openIssueCount ?? 0) > 0}
                data-entity-id={entityId}
                data-testid={`hotspot-${p.slot}`}
                role="button"
                tabIndex={0}
                aria-label={`${p.label} (${entityId})`}
                aria-pressed={isSel}
                opacity={dimmed ? 0.18 : selected && !inNeighbourhood && zoomed ? Math.min(baseOp, 0.5) : baseOp}
                onClick={(e) => {
                  e.stopPropagation();
                  tapPart(p, entityId);
                }}
                onKeyDown={(e) => key(e, p, entityId)}
                onPointerEnter={(e) => {
                  setHover(entityId);
                  showTip("part", entityId, { entityId }, e);
                }}
                onPointerMove={moveTip}
                onPointerLeave={() => {
                  setHover((h) => (h === entityId ? null : h));
                  setTip((t) => (t?.id === entityId ? null : t));
                }}
              >
                {edges.map((e, i) => (
                  <path key={i} d={polyD(e)} className={`rrx-part-edge${isSel ? " rrx-part-edge--selected" : ""}${p.parent ? " rrx-part-edge--child" : ""}${inNeighbourhood && !isSel ? " rrx-part-edge--near" : ""}${featured ? " rrx-part-edge--featured" : ""}`} vectorEffect="non-scaling-stroke" />
                ))}
                <circle className="rrx-hot-hit" cx={c.x} cy={c.y} r={r} />
                {!isSel && (meta?.openIssueCount ?? 0) > 0 ? <circle className="rrx-hot-pulse" cx={c.x} cy={c.y} r={10} vectorEffect="non-scaling-stroke" /> : null}
                {isSel ? <circle className="rrx-hot-ring" cx={c.x} cy={c.y} r={r + 6} vectorEffect="non-scaling-stroke" /> : null}
                {showLabel ? (
                  <text className="rrx-hot-label" x={c.x + r * 0.7 + 4} y={c.y - 4} fontSize={12}>
                    {p.label}
                    {(meta?.openIssueCount ?? 0) > 0 ? <tspan fill="#ff6b7a"> · {meta!.openIssueCount} open</tspan> : null}
                  </text>
                ) : null}
              </g>
            );
          })}

          {markers.map((m, i) => {
            let center: Vec3 | null = null;
            if (m.entityId) {
              const hit = slotForEntityId(m.entityId);
              if (hit && !visibleSlots.has(hit.slot.slot) && !wiring) return null;
              center = hit ? (partBox(hit.slot.slot, style)?.center ?? null) : null;
            } else if (m.wireId) {
              const w = WIRES.find((x) => x.id === m.wireId);
              const pts = w ? wirePath(w, style) : [];
              if (pts.length >= 2) center = pts[Math.floor(pts.length / 2)]!;
            }
            if (!center) return null;
            const c = project(center, cam);
            return (
              <g key={m.id} className="rrx-marker" data-testid={`marker-${m.id}`} data-source={m.source}>
                <circle cx={c.x} cy={c.y} r={22} vectorEffect="non-scaling-stroke" />
                <circle cx={c.x} cy={c.y} r={30} className="rrx-marker-outer" vectorEffect="non-scaling-stroke" />
                <text x={c.x + 26} y={c.y + 30} fontSize={11}>
                  #{i + 1} {m.wireId ?? ""}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {tip ? (
        <div className={`rrx-tip rrx-tip--${tip.kind}`} style={{ left: tip.x + 14, top: tip.y + 14 }} role="tooltip" data-testid="sketch-tooltip">
          <strong>{tip.title}</strong>
          {tip.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
