/**
 * Sketch geometry for the three synthetic EV models (UI-only static data, Ali's lane).
 * Each hotspot maps a drawn part to a recorded entity id; part provenance, containment and issues
 * come from the API (EntityContext / issues), never from this file. Coordinates are SVG units in
 * a 1000 x 480 viewBox, side profile, front of the vehicle on the right.
 */
export type SketchShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx?: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "path"; d: string };

export type SketchLine = { d: string; cls?: "thin" | "dashed" };

export type SketchPart = {
  /** Stable key within a model (e.g. "chargePort"). */
  slot: string;
  label: string;
  /** Entity id for a vehicle serial suffix such as "0005". */
  entityId: (suffix: string) => string;
  shape: SketchShape;
  labelAt: { x: number; y: number };
  /** Region the stage zooms to when tapped. Aspect is corrected at runtime. */
  focus: { x: number; y: number; w: number; h: number };
  /** Optional sub-sketch revealed when zoomed in (e.g. connector + bracket inside the charge port). */
  detail?: { lines: SketchLine[]; parts: SketchPart[]; labelSize?: number };
};

export type SketchModel = {
  id: string;
  name: string;
  platform: string;
  bodyStyle: string;
  lines: SketchLine[];
  parts: SketchPart[];
};

export type SketchVehicle = {
  buildId: string;
  entityId: string;
  modelId: string;
  suffix: string;
  note: string;
};

export const VIEWBOX = { w: 1000, h: 480 } as const;

// ---------------------------------------------------------------------------
// Shared part builders (positions passed per model)
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };

function chargePort(at: Pt): SketchPart {
  const { x, y } = at;
  return {
    slot: "chargePort",
    label: "Charge-port module",
    entityId: (s) => `CPM-${s}`,
    shape: { kind: "circle", cx: x, cy: y, r: 30 },
    labelAt: { x: x - 28, y: y - 40 },
    focus: { x: x - 80, y: y - 60, w: 160, h: 120 },
    detail: {
      labelSize: 5,
      lines: [
        { d: `M ${x - 26} ${y + 20} L ${x - 26} ${y - 16} L ${x + 24} ${y - 16}`, cls: "thin" },
        { d: `M ${x - 26} ${y + 20} L ${x - 4} ${y + 20}`, cls: "thin" },
        { d: `M ${x - 22} ${y - 12} l 4 0 M ${x + 16} ${y - 12} l 4 0`, cls: "thin" },
        { d: `M ${x - 4} ${y - 4} l 3 0 M ${x + 1} ${y - 4} l 3 0 M ${x - 4} ${y + 2} l 3 0 M ${x + 1} ${y + 2} l 3 0 M ${x - 1.5} ${y + 7} l 3 0`, cls: "thin" },
      ],
      parts: [
        {
          slot: "bracket",
          label: "Mounting bracket",
          entityId: (s) => `BRKT-${s}`,
          shape: { kind: "path", d: `M ${x - 30} ${y + 24} L ${x - 30} ${y - 20} L ${x + 28} ${y - 20} L ${x + 28} ${y - 12} L ${x - 22} ${y - 12} L ${x - 22} ${y + 16} L ${x - 4} ${y + 16} L ${x - 4} ${y + 24} Z` },
          labelAt: { x: x - 30, y: y + 32 },
          focus: { x: x - 80, y: y - 60, w: 160, h: 120 },
        },
        {
          slot: "connector",
          label: "Charge connector",
          entityId: (s) => `CONN-${s}`,
          shape: { kind: "circle", cx: x, cy: y, r: 13 },
          labelAt: { x: x + 16, y: y + 4 },
          focus: { x: x - 80, y: y - 60, w: 160, h: 120 },
        },
      ],
    },
  };
}

function battery(rect: { x: number; y: number; w: number; h: number }): SketchPart {
  const { x, y, w, h } = rect;
  const cells: SketchLine[] = [];
  const n = 8;
  const cw = (w - 16) / n;
  for (let i = 0; i < n; i++) cells.push({ d: `M ${x + 8 + i * cw + 2} ${y + 5} h ${cw - 4} v ${h - 10} h ${-(cw - 4)} Z`, cls: "thin" });
  return {
    slot: "battery",
    label: "HV battery pack",
    entityId: (s) => `BATT-${s}`,
    shape: { kind: "rect", x, y, w, h, rx: 4 },
    labelAt: { x: x + w / 2 - 50, y: y + h + 18 },
    focus: { x: x - 30, y: y - 50, w: w + 60, h: h + 100 },
    detail: {
      labelSize: 7,
      lines: cells,
      parts: [
        {
          slot: "cells",
          label: "Cell modules (purchased)",
          entityId: (s) => `CELL-${s}`,
          shape: { kind: "rect", x: x + 8, y: y + 4, w: w - 16, h: h - 8, rx: 2 },
          labelAt: { x: x + 10, y: y - 6 },
          focus: { x: x - 30, y: y - 50, w: w + 60, h: h + 100 },
        },
      ],
    },
  };
}

const driveUnit = (slot: "frontDrive" | "rearDrive", at: Pt): SketchPart => ({
  slot,
  label: slot === "frontDrive" ? "Front drive unit" : "Rear drive unit",
  entityId: (s) => (slot === "frontDrive" ? `FDU-${s}` : `RDU-${s}`),
  shape: { kind: "rect", x: at.x, y: at.y, w: 56, h: 40, rx: 6 },
  labelAt: { x: at.x - 10, y: at.y - 8 },
  focus: { x: at.x - 60, y: at.y - 60, w: 180, h: 160 },
  detail: {
    labelSize: 6,
    lines: [
      { d: `M ${at.x + 18} ${at.y + 20} m -10 0 a 10 10 0 1 0 20 0 a 10 10 0 1 0 -20 0`, cls: "thin" },
      { d: `M ${at.x + 34} ${at.y + 8} h 16 v 24 h -16 Z`, cls: "thin" },
      { d: `M ${at.x + 28} ${at.y + 20} h 6`, cls: "thin" },
    ],
    parts: [],
  },
});

const headlamp = (d: string, labelAt: Pt, focus: SketchPart["focus"]): SketchPart => ({
  slot: "headlamp",
  label: "Headlamp",
  entityId: (s) => `LAMP-${s}`,
  shape: { kind: "path", d },
  labelAt,
  focus,
});

const wheel = (slot: "wheelFront" | "wheelRear", c: Pt, r: number): SketchPart => ({
  slot,
  label: slot === "wheelFront" ? "Front wheel" : "Rear wheel",
  entityId: (s) => (slot === "wheelFront" ? `WHL-${s}-F` : `WHL-${s}-R`),
  shape: { kind: "circle", cx: c.x, cy: c.y, r: r + 4 },
  labelAt: { x: c.x - 34, y: c.y + r + 24 },
  focus: { x: c.x - r - 50, y: c.y - r - 50, w: 2 * r + 100, h: 2 * r + 100 },
});

const door = (rect: { x: number; y: number; w: number; h: number }): SketchPart => ({
  slot: "door",
  label: "Front door (stamped in-house)",
  entityId: (s) => `DOOR-${s}-F`,
  shape: { kind: "rect", ...rect, rx: 3 },
  labelAt: { x: rect.x + 8, y: rect.y + rect.h - 8 },
  focus: { x: rect.x - 40, y: rect.y - 60, w: rect.w + 80, h: rect.h + 120 },
});

const windshield = (d: string, labelAt: Pt, focus: SketchPart["focus"]): SketchPart => ({
  slot: "windshield",
  label: "Windshield",
  entityId: (s) => `GLS-${s}`,
  shape: { kind: "path", d },
  labelAt,
  focus,
});

const harness = (c: Pt): SketchPart => ({
  slot: "harness",
  label: "HV harness",
  entityId: (s) => `HVC-${s}`,
  shape: { kind: "circle", cx: c.x, cy: c.y, r: 16 },
  labelAt: { x: c.x + 20, y: c.y + 4 },
  focus: { x: c.x - 90, y: c.y - 60, w: 180, h: 120 },
});

// ---------------------------------------------------------------------------
// Model 1: sedan (EV-PLATFORM-1)
// ---------------------------------------------------------------------------

const sedan: SketchModel = {
  id: "sedan",
  name: "Demo Sedan",
  platform: "EV-PLATFORM-1",
  bodyStyle: "4-door sedan",
  lines: [
    { d: "M 70 330 L 70 300 Q 75 262 150 250 L 255 240 L 335 182 Q 352 168 395 166 L 610 166 Q 660 168 700 195 L 785 240 L 885 252 Q 935 260 940 300 L 940 330" },
    { d: "M 70 330 L 175 330 M 325 330 L 685 330 M 835 330 L 940 330" },
    { d: "M 175 330 A 75 75 0 0 1 325 330 M 685 330 A 75 75 0 0 1 835 330" },
    { d: "M 250 335 m -58 0 a 58 58 0 1 0 116 0 a 58 58 0 1 0 -116 0 M 760 335 m -58 0 a 58 58 0 1 0 116 0 a 58 58 0 1 0 -116 0" },
    { d: "M 250 335 m -34 0 a 34 34 0 1 0 68 0 a 34 34 0 1 0 -68 0 M 760 335 m -34 0 a 34 34 0 1 0 68 0 a 34 34 0 1 0 -68 0", cls: "thin" },
    { d: "M 270 240 L 340 190 Q 356 178 395 178 L 600 178 Q 645 180 680 205 L 770 240", cls: "thin" },
    { d: "M 470 178 L 470 240 M 285 244 L 285 325 M 470 240 L 470 325 M 700 240 L 700 325", cls: "thin" },
    { d: "M 400 270 L 432 270 M 560 268 L 592 268", cls: "thin" },
    { d: "M 890 262 L 935 268 L 935 285 L 892 282 Z M 75 262 L 115 258 L 115 278 L 75 280 Z", cls: "thin" },
    { d: "M 150 262 h 26 v 22 h -26 Z", cls: "thin" },
    { d: "M 330 300 h 350 v 26 h -350 Z", cls: "dashed" },
    { d: "M 640 268 h 56 v 40 h -56 Z M 300 268 h 56 v 40 h -56 Z", cls: "dashed" },
    { d: "M 500 300 L 500 290 L 640 290", cls: "dashed" },
  ],
  parts: [
    chargePort({ x: 163, y: 273 }),
    battery({ x: 330, y: 300, w: 350, h: 26 }),
    driveUnit("frontDrive", { x: 640, y: 268 }),
    driveUnit("rearDrive", { x: 300, y: 268 }),
    headlamp("M 886 258 L 940 266 L 940 290 L 888 286 Z", { x: 850, y: 252 }, { x: 820, y: 200, w: 160, h: 130 }),
    windshield("M 612 176 L 690 204 L 772 240 L 690 240 Z", { x: 640, y: 232 }, { x: 580, y: 150, w: 230, h: 120 }),
    door({ x: 474, y: 244, w: 222, h: 78 }),
    harness({ x: 560, y: 290 }),
    wheel("wheelFront", { x: 760, y: 335 }, 58),
    wheel("wheelRear", { x: 250, y: 335 }, 58),
  ],
};

// ---------------------------------------------------------------------------
// Model 2: crossover (EV-PLATFORM-2)
// ---------------------------------------------------------------------------

const crossover: SketchModel = {
  id: "crossover",
  name: "Demo Crossover",
  platform: "EV-PLATFORM-2",
  bodyStyle: "5-door crossover",
  lines: [
    { d: "M 70 320 L 70 280 Q 75 240 150 232 L 240 225 L 300 160 Q 315 145 360 143 L 640 143 Q 690 145 730 172 L 800 225 L 890 240 Q 935 250 940 290 L 940 320" },
    { d: "M 70 320 L 170 320 M 320 320 L 690 320 M 840 320 L 940 320" },
    { d: "M 170 320 A 75 75 0 0 1 320 320 M 690 320 A 75 75 0 0 1 840 320" },
    { d: "M 245 328 m -62 0 a 62 62 0 1 0 124 0 a 62 62 0 1 0 -124 0 M 765 328 m -62 0 a 62 62 0 1 0 124 0 a 62 62 0 1 0 -124 0" },
    { d: "M 245 328 m -36 0 a 36 36 0 1 0 72 0 a 36 36 0 1 0 -72 0 M 765 328 m -36 0 a 36 36 0 1 0 72 0 a 36 36 0 1 0 -72 0", cls: "thin" },
    { d: "M 330 138 L 640 138", cls: "thin" },
    { d: "M 255 225 L 310 168 Q 322 156 360 155 L 630 155 Q 680 158 715 185 L 785 225", cls: "thin" },
    { d: "M 470 155 L 470 225 M 265 228 L 265 315 M 470 225 L 470 315 M 700 225 L 700 315", cls: "thin" },
    { d: "M 390 258 L 424 258 M 560 256 L 594 256", cls: "thin" },
    { d: "M 892 250 L 936 258 L 936 276 L 894 272 Z M 75 248 L 118 244 L 118 266 L 75 268 Z", cls: "thin" },
    { d: "M 148 250 h 26 v 22 h -26 Z", cls: "thin" },
    { d: "M 320 288 h 380 v 28 h -380 Z", cls: "dashed" },
    { d: "M 650 250 h 56 v 40 h -56 Z M 290 250 h 56 v 40 h -56 Z", cls: "dashed" },
    { d: "M 510 288 L 510 276 L 650 276", cls: "dashed" },
  ],
  parts: [
    chargePort({ x: 161, y: 261 }),
    battery({ x: 320, y: 288, w: 380, h: 28 }),
    driveUnit("frontDrive", { x: 650, y: 250 }),
    driveUnit("rearDrive", { x: 290, y: 250 }),
    headlamp("M 888 246 L 940 256 L 940 280 L 890 276 Z", { x: 852, y: 240 }, { x: 820, y: 190, w: 160, h: 130 }),
    windshield("M 632 154 L 716 186 L 788 226 L 700 226 Z", { x: 655, y: 218 }, { x: 600, y: 130, w: 230, h: 120 }),
    door({ x: 474, y: 228, w: 222, h: 86 }),
    harness({ x: 580, y: 276 }),
    wheel("wheelFront", { x: 765, y: 328 }, 62),
    wheel("wheelRear", { x: 245, y: 328 }, 62),
  ],
};

// ---------------------------------------------------------------------------
// Model 3: compact hatch (EV-PLATFORM-3)
// ---------------------------------------------------------------------------

const hatch: SketchModel = {
  id: "hatch",
  name: "Demo Compact",
  platform: "EV-PLATFORM-3",
  bodyStyle: "compact hatchback",
  lines: [
    { d: "M 120 330 L 120 300 Q 125 250 180 235 L 250 232 L 320 178 Q 335 166 380 165 L 580 165 Q 640 168 690 200 L 760 245 L 850 255 Q 890 262 895 300 L 895 330" },
    { d: "M 120 330 L 200 330 M 340 330 L 670 330 M 810 330 L 895 330" },
    { d: "M 200 330 A 70 70 0 0 1 340 330 M 670 330 A 70 70 0 0 1 810 330" },
    { d: "M 270 335 m -56 0 a 56 56 0 1 0 112 0 a 56 56 0 1 0 -112 0 M 740 335 m -56 0 a 56 56 0 1 0 112 0 a 56 56 0 1 0 -112 0" },
    { d: "M 270 335 m -32 0 a 32 32 0 1 0 64 0 a 32 32 0 1 0 -64 0 M 740 335 m -32 0 a 32 32 0 1 0 64 0 a 32 32 0 1 0 -64 0", cls: "thin" },
    { d: "M 262 232 L 328 186 Q 342 176 380 176 L 575 176 Q 625 178 665 205 L 745 244", cls: "thin" },
    { d: "M 460 176 L 460 244 M 262 236 L 262 325 M 460 244 L 460 325 M 665 244 L 665 325", cls: "thin" },
    { d: "M 380 270 L 410 270 M 540 268 L 570 268", cls: "thin" },
    { d: "M 848 262 L 892 268 L 892 286 L 850 284 Z M 125 262 L 160 258 L 160 280 L 125 282 Z", cls: "thin" },
    { d: "M 186 262 h 24 v 22 h -24 Z", cls: "thin" },
    { d: "M 345 300 h 320 v 26 h -320 Z", cls: "dashed" },
    { d: "M 610 268 h 56 v 40 h -56 Z", cls: "dashed" },
    { d: "M 500 300 L 500 290 L 610 290", cls: "dashed" },
  ],
  parts: [
    chargePort({ x: 198, y: 273 }),
    battery({ x: 345, y: 300, w: 320, h: 26 }),
    driveUnit("frontDrive", { x: 610, y: 268 }),
    headlamp("M 844 258 L 895 266 L 895 290 L 846 288 Z", { x: 808, y: 252 }, { x: 780, y: 200, w: 160, h: 130 }),
    windshield("M 578 174 L 664 206 L 748 246 L 665 246 Z", { x: 605, y: 238 }, { x: 540, y: 150, w: 230, h: 120 }),
    door({ x: 464, y: 248, w: 200, h: 74 }),
    harness({ x: 555, y: 290 }),
    wheel("wheelFront", { x: 740, y: 335 }, 56),
    wheel("wheelRear", { x: 270, y: 335 }, 56),
  ],
};

export const SKETCH_MODELS: SketchModel[] = [sedan, crossover, hatch];

/** The three recorded vehicles shown in the explorer, one per model (fictional build ids). */
export const SKETCH_VEHICLES: SketchVehicle[] = [
  { buildId: "DEMO-EV-005", entityId: "DEMO-EV-005", modelId: "sedan", suffix: "0005", note: "Story vehicle: charge-port alignment issue reported at Final Inspection" },
  { buildId: "DEMO-EV-006", entityId: "DEMO-EV-006", modelId: "crossover", suffix: "0006", note: "Connector replaced after confirmed supplier pin damage" },
  { buildId: "DEMO-EV-007", entityId: "DEMO-EV-007", modelId: "hatch", suffix: "0007", note: "Shipped; open headlamp condensation issue (supplier hypothesis only)" },
];

export function modelById(id: string): SketchModel {
  return SKETCH_MODELS.find((m) => m.id === id) ?? sedan;
}

/** Flattened list of every part (top-level and detail) for a model. */
export function allParts(model: SketchModel): Array<{ part: SketchPart; parent: SketchPart | null }> {
  const out: Array<{ part: SketchPart; parent: SketchPart | null }> = [];
  for (const p of model.parts) {
    out.push({ part: p, parent: null });
    for (const c of p.detail?.parts ?? []) out.push({ part: c, parent: p });
  }
  return out;
}
