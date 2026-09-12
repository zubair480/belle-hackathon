"use client";
/**
 * 3D wireframe EV sketch rendered in SVG from frontend/features/recall/sketches/car3d.ts.
 * Mild perspective, white lines on black; drag to rotate, wheel to zoom, tap a part to zoom onto
 * it. Only exterior parts are drawn and interactive; interior parts stay in the records and the
 * rail. Zooming onto a part reveals its children and attached wires; wires are smoothed routes
 * with lane offsets, connector dots and gauge-based thickness, drawn above the parts so they can
 * be hovered. Hovering a part or a wire shows a detail tooltip.
 * Pointer capture starts only once a drag has moved, so a plain tap reaches the part's click.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import type { SourcingType } from "@/contracts/common";
import type { CameraPreset, SketchMarker } from "../../features/recall/context";
import { CAMERA_PRESETS, DEFAULT_CAMERA, PARTS, VIEW, WIRES, bodyLines, boxEdges, cameraForPart, entityIdFor, isExteriorSlot, lerpCamera, partBox, project, slotForEntityId, wirePath, wireWidth, wiresNear, type BodyStyle, type Camera, type PartSlot, type Vec3 } from "../../features/recall/sketches/car3d";
import { faultZonePosition } from "../../features/recall/sketches/faultZones";

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
  onMark: (target: { entityId: string | null; slot: string | null; wireId: string | null }) => void;
  onWireSelect?: (wireId: string) => void;
  /** Called with the hovered wire id, or null when the pointer leaves it. */
  onWireHover?: (wireId: string | null) => void;
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
/** Convex hull (monotone chain) of projected box corners: the exact tap area of a part. */
function hull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function VehicleSketch3D(props: VehicleSketch3DProps) {
  const { style, suffix, info, selectedEntityId, onSelect, sourcingFilter, markers, circuitId, wiring, markMode, onMark, onWireSelect, onWireHover, hoverDetails, cameraRequest, instant = false } = props;
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

  const selectedAny = useMemo(() => (selectedEntityId ? slotForEntityId(selectedEntityId) : null), [selectedEntityId]);
  /** Only exterior parts have a drawn position to zoom onto. */
  const selected = selectedAny && isExteriorSlot(selectedAny.slot.parent ?? selectedAny.slot.slot) ? selectedAny : null;

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
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      d.moved = true;
      // Capture only once a real drag has started so a plain tap still delivers its click to the part.
      (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
    }
    if (!d.moved) return;
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    setTip(null);
    setCam((c) => ({ ...c, yaw: d.yaw - dx * 0.006, pitch: Math.max(-0.3, Math.min(1.5, d.pitch + dy * 0.006)) }));
  };
  const onPointerUp = () => {
    // Keep the drag record until the click that follows pointerup has been evaluated.
    const d = drag.current;
    if (d?.moved) setTimeout(() => { if (drag.current === d) drag.current = null; }, 0);
    else drag.current = null;
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

  const visibleParts = PARTS.filter((p) => {
    if (!partBox(p.slot, style) || !isExteriorSlot(p.slot)) return false;
    if (!p.parent) return true;
    return selectedTop === p.parent || cam.scale > 0.45;
  });
  const visibleSlots = new Set(visibleParts.map((p) => p.slot));
  // Far parts first, near parts last (on top), so a tap lands on the part actually in front.
  const orderedParts = [...visibleParts].sort((a, b) => project(partBox(b.slot, style)!.center, cam).depth - project(partBox(a.slot, style)!.center, cam).depth);

  /** Global wiring shows everything; zooming onto a part reveals the wires attached to it and its children. */
  const wiresToShow = wiring ? WIRES : selected && zoomed ? wiresNear(neighbourhood) : [];
  const labelFor = (p: PartSlot, entityId: string, isSel: boolean, meta: HotspotInfo | undefined) =>
    isSel || hover === entityId || (meta?.openIssueCount ?? 0) > 0 || markers.some((m) => m.entityId === entityId) || cam.scale > 0.3 || (Boolean(selectedTop) && p.parent === selectedTop);
  const highlightedWireIds = new Set(markers.filter((m) => m.wireId).map((m) => m.wireId!));

  return (
    <div className="rrx-sketch-wrap" ref={wrap}>
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={`${style} 3D sketch`}
        data-testid="vehicle-sketch"
        data-zoomed={zoomed}
        data-mark-mode={markMode}
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
        <g key={`${style}-${suffix}`}>
          {body.map((l, i) => {
            const pts = proj(l.points, cam);
            return <path key={i} d={polyD(pts)} className={`rrx-sketch-line${l.cls ? ` rrx-sketch-line--${l.cls}` : ""}`} style={{ opacity: l.cls === "dashed" ? 0.5 : depthOpacity(avgDepth(pts)) }} vectorEffect="non-scaling-stroke" />;
          })}

          {orderedParts.map((p) => {
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
            const outline = hull(edges.flatMap((e) => e));
            const depthOp = depthOpacity(c.depth);
            const baseOp = featured || zoomed ? depthOp : depthOp * 0.5;
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
                <polygon className="rrx-hot-hit" points={outline.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} />
                {!isSel && (meta?.openIssueCount ?? 0) > 0 ? <circle className="rrx-hot-pulse" cx={c.x} cy={c.y} r={10} vectorEffect="non-scaling-stroke" /> : null}
                {showLabel ? (
                  <text className="rrx-hot-label" x={c.x + r * 0.7 + 4} y={c.y - 4} fontSize={12}>
                    {p.label}
                    {(meta?.openIssueCount ?? 0) > 0 ? <tspan fill="#ff6b7a"> · {meta!.openIssueCount} open</tspan> : null}
                  </text>
                ) : null}
              </g>
            );
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
                onPointerEnter={(e) => {
                  showTip("wire", w.id, { wireId: w.id }, e);
                  onWireHover?.(w.id);
                }}
                onPointerMove={moveTip}
                onPointerLeave={() => {
                  setTip((t) => (t?.id === w.id ? null : t));
                  onWireHover?.(null);
                }}
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

          {markers.map((m, i) => {
            let center: Vec3 | null = null;
            if (m.entityId) {
              const hit = slotForEntityId(m.entityId);
              if (!hit) return null;
              if (!visibleSlots.has(hit.slot.slot) && !wiring) return null;
              center = m.zoneId ? faultZonePosition(hit.slot.slot, m.zoneId, style) : (partBox(hit.slot.slot, style)?.center ?? null);
            } else if (m.wireId) {
              const w = WIRES.find((x) => x.id === m.wireId);
              const pts = w ? wirePath(w, style) : [];
              if (pts.length >= 2) center = pts[Math.floor(pts.length / 2)]!;
            }
            if (!center) return null;
            const c = project(center, cam);
            const label = m.zoneLabel ?? (m.wireId ? `Wire ${m.wireId}` : null);
            const lx = c.x + 18;
            const ly = c.y - 18;
            return (
              <g key={m.id} className="rrx-marker" data-testid={`marker-${m.id}`} data-source={m.source} data-zone={m.zoneId ?? ""}>
                <circle cx={c.x} cy={c.y} r={5} className="rrx-marker-dot" vectorEffect="non-scaling-stroke" />
                <circle cx={c.x} cy={c.y} r={11} className="rrx-marker-halo" vectorEffect="non-scaling-stroke" />
                <path d={`M ${c.x + 4} ${c.y - 4} L ${lx} ${ly}`} className="rrx-marker-leader" vectorEffect="non-scaling-stroke" />
                <text x={lx + 3} y={ly - 3} fontSize={11}>
                  #{i + 1}{label ? ` ${label}` : ""}
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
