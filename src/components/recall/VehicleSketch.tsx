"use client";
/**
 * White line-art sketch of one EV model on black. Tapping a part zooms the viewBox to it with a
 * short tween and reveals its sub-sketch (e.g. connector + bracket inside the charge port).
 * Hotspot colour = recorded sourcing of the mapped entity (from the API), red pulse = open issue.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { SourcingType } from "@/contracts/common";
import { VIEWBOX, allParts, type SketchModel, type SketchPart, type SketchShape } from "@/features/recall/sketches/models";

export type HotspotInfo = { sourcing: SourcingType | null; openIssueCount: number; recorded: boolean };

type View = { x: number; y: number; w: number; h: number };
const FULL: View = { x: 0, y: 0, w: VIEWBOX.w, h: VIEWBOX.h };
const ASPECT = VIEWBOX.w / VIEWBOX.h;

function fitAspect(f: SketchPart["focus"]): View {
  let { w, h } = f;
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  if (w / h < ASPECT) w = h * ASPECT;
  else h = w / ASPECT;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function shapeCenter(s: SketchShape, fallback: { x: number; y: number }): { x: number; y: number } {
  if (s.kind === "circle") return { x: s.cx, y: s.cy };
  if (s.kind === "rect") return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  return fallback;
}

function Shape({ shape }: { shape: SketchShape }) {
  const common = { className: "rrx-hot-shape", vectorEffect: "non-scaling-stroke" as const };
  if (shape.kind === "circle") return <circle {...common} cx={shape.cx} cy={shape.cy} r={shape.r} />;
  if (shape.kind === "rect") return <rect {...common} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx ?? 0} />;
  return <path {...common} d={shape.d} />;
}

export type VehicleSketchProps = {
  model: SketchModel;
  suffix: string;
  info: Record<string, HotspotInfo | undefined>;
  selectedEntityId: string | null;
  onSelect: (entityId: string | null) => void;
  sourcingFilter: SourcingType | "all";
  /** Disable the tween (tests). */
  instant?: boolean;
};

export function VehicleSketch({ model, suffix, info, selectedEntityId, onSelect, sourcingFilter, instant = false }: VehicleSketchProps) {
  const [view, setView] = useState<View>(FULL);
  const raf = useRef<number | null>(null);
  const viewRef = useRef<View>(FULL);
  viewRef.current = view;

  const parts = useMemo(() => allParts(model), [model]);
  const selected = useMemo(() => parts.find((p) => p.part.entityId(suffix) === selectedEntityId) ?? null, [parts, suffix, selectedEntityId]);
  const zoomRoot: SketchPart | null = selected ? (selected.parent ?? selected.part) : null;

  const animateTo = useCallback(
    (target: View) => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      const from = viewRef.current;
      if (instant || typeof requestAnimationFrame === "undefined") {
        setView(target);
        return;
      }
      const start = performance.now();
      const dur = 620;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const k = ease(t);
        setView({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k });
        if (t < 1) raf.current = requestAnimationFrame(step);
        else raf.current = null;
      };
      raf.current = requestAnimationFrame(step);
    },
    [instant],
  );

  useEffect(() => {
    animateTo(zoomRoot ? fitAspect(zoomRoot.focus) : FULL);
  }, [zoomRoot, animateTo]);

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
  }, []);

  // Reset to full view when the model changes.
  useEffect(() => {
    setView(FULL);
  }, [model.id]);

  const k = view.w / VIEWBOX.w; // zoom factor: 1 = full view
  const fontSize = 13 * k;
  const zoomed = k < 0.98;

  const handleKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
    if (e.key === "Escape") onSelect(null);
  };

  const renderHotspot = (part: SketchPart, layer: "base" | "detail") => {
    const id = part.entityId(suffix);
    const meta = info[id];
    const sourcing = meta?.sourcing ?? (meta?.recorded === false ? null : undefined);
    const dimmed = sourcingFilter !== "all" && (sourcing ?? "unknown") !== sourcingFilter;
    const isSelected = selectedEntityId === id;
    const c = shapeCenter(part.shape, part.labelAt);
    const pulseR = 9 * k;
    return (
      <g
        key={`${layer}-${part.slot}`}
        className="rrx-hotspot"
        data-selected={isSelected}
        data-sourcing={sourcing ?? "unknown"}
        data-has-issue={(meta?.openIssueCount ?? 0) > 0}
        data-entity-id={id}
        data-testid={`hotspot-${part.slot}`}
        role="button"
        tabIndex={0}
        aria-label={`${part.label} (${id})`}
        aria-pressed={isSelected}
        opacity={dimmed ? 0.25 : 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(id);
        }}
        onKeyDown={(e) => handleKey(e, id)}
      >
        <Shape shape={part.shape} />
        {!isSelected ? <circle className="rrx-hot-pulse" cx={c.x} cy={c.y} r={pulseR} vectorEffect="non-scaling-stroke" /> : null}
        <text className="rrx-hot-label" x={part.labelAt.x} y={part.labelAt.y} fontSize={fontSize}>
          {part.label}
        </text>
        {(meta?.openIssueCount ?? 0) > 0 ? (
          <text className="rrx-hot-label" x={part.labelAt.x} y={part.labelAt.y + fontSize * 1.1} fontSize={fontSize * 0.85} fill="#ff6b7a">
            {meta!.openIssueCount} open issue{meta!.openIssueCount === 1 ? "" : "s"}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label={`${model.name} sketch`}
      data-testid="vehicle-sketch"
      data-zoomed={zoomed}
      onClick={() => onSelect(null)}
    >
      <g key={model.id}>
        {model.lines.map((l, i) => (
          <path key={i} d={l.d} className={`rrx-sketch-line${l.cls ? ` rrx-sketch-line--${l.cls}` : ""}`} vectorEffect="non-scaling-stroke" />
        ))}
        {model.parts.map((p) => renderHotspot(p, "base"))}
        {model.parts
          .filter((p) => p.detail)
          .map((p) => {
            const visible = zoomRoot?.slot === p.slot && zoomed;
            return (
              <g key={`detail-${p.slot}`} className="rrx-detail-layer" data-visible={visible} data-testid={`detail-${p.slot}`}>
                {visible
                  ? p.detail!.lines.map((l, i) => (
                      <path key={i} d={l.d} className={`rrx-sketch-line${l.cls ? ` rrx-sketch-line--${l.cls}` : ""}`} vectorEffect="non-scaling-stroke" />
                    ))
                  : null}
                {visible ? p.detail!.parts.map((c) => renderHotspot(c, "detail")) : null}
              </g>
            );
          })}
      </g>
    </svg>
  );
}
