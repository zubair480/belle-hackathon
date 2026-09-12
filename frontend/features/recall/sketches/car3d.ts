/**
 * 3D wireframe geometry for the synthetic EV models plus an orthographic projector.
 * Coordinates: x = length (rear negative, front positive), y = width (left negative, right
 * positive; left-hand drive), z = height. Millimetre-like units. Rendered in SVG; no dependency.
 * Part positions are keyed by the design slot in frontend/data/ev-platform/parts.json.
 */
import partsJson from "../../../data/ev-platform/parts.json";
import wiringJson from "../../../data/ev-platform/wiring.json";

export type Vec3 = [number, number, number];
export type Box3 = { center: Vec3; size: Vec3 };
export type Polyline3 = { points: Vec3[]; cls?: "thin" | "dashed" | "wire" };

export type PartSlot = (typeof partsJson.parts)[number];
export type WireDef = (typeof wiringJson.wires)[number];
export type CircuitDef = (typeof wiringJson.circuits)[number];

export const PARTS: PartSlot[] = partsJson.parts;
export const WIRES: WireDef[] = wiringJson.wires;
export const CIRCUITS: CircuitDef[] = wiringJson.circuits;
export const CONNECTORS = wiringJson.connectors;
export const ZONES: Record<string, string> = partsJson.zones;
export const SYSTEMS: Record<string, string> = partsJson.systems;

export function slotById(slot: string): PartSlot | undefined {
  return PARTS.find((p) => p.slot === slot);
}

/** Entity id for a slot on a vehicle with the given build suffix (e.g. "0005"). */
export function entityIdFor(slot: PartSlot, suffix: string): string {
  return `${slot.prefix}-${suffix}${slot.sideSuffix ? `-${slot.sideSuffix}` : ""}`;
}

/** Inverse of entityIdFor for any known slot. */
export function slotForEntityId(entityId: string): { slot: PartSlot; suffix: string } | null {
  for (const slot of PARTS) {
    const re = new RegExp(`^${slot.prefix}-(\\d{4})${slot.sideSuffix ? `-${slot.sideSuffix}` : ""}$`);
    const m = entityId.match(re);
    if (m && m[1]) return { slot, suffix: m[1] };
  }
  return null;
}

const EXTERIOR_SLOTS = new Set(["charge-port-module", "charge-connector", "charge-bracket", "door-FL", "door-FR", "door-RL", "door-RR", "hood", "tailgate", "windshield", "rear-glass", "mirror-L", "mirror-R", "headlamp-L", "headlamp-R", "taillamp-L", "taillamp-R", "bumper-front", "bumper-rear", "wheel-FL", "wheel-FR", "wheel-RL", "wheel-RR"]);

/** Exterior parts are drawn on the sketch; interior/underbody parts are recorded but not drawn. */
export function isExteriorSlot(slot: string): boolean {
  return EXTERIOR_SLOTS.has(slot);
}
export function isExteriorEntity(entityId: string): boolean {
  const hit = slotForEntityId(entityId);
  return hit ? isExteriorSlot(hit.slot.slot) : false;
}

// ---------------------------------------------------------------------------
// Body styles
// ---------------------------------------------------------------------------

export type BodyStyle = "sedan" | "suv" | "sports";

type Profile = { pts: Array<[number, number]>; halfWidth: number; wheelX: [number, number]; wheelR: number; roofZ: number };

const PROFILES: Record<BodyStyle, Profile> = {
  // 12 profile points, rear to front: [0] rear bottom, [1] rear top, [2] tailgate/trunk top, [3] rear deck / C-pillar base,
  // [4] roof rear, [5..6] roof, [7] A-pillar top, [8] windshield base, [9] hood front, [10] front top, [11] front bottom.
  sedan: { pts: [[-2300, 380], [-2300, 780], [-2150, 930], [-1250, 940], [-850, 1360], [-500, 1440], [600, 1440], [1000, 1330], [1350, 1010], [2150, 930], [2300, 820], [2300, 380]], halfWidth: 920, wheelX: [-1450, 1450], wheelR: 370, roofZ: 1440 },
  suv: { pts: [[-2350, 450], [-2350, 1050], [-2250, 1560], [-1350, 1600], [-1000, 1740], [-600, 1760], [800, 1760], [1150, 1660], [1450, 1260], [2200, 1150], [2350, 980], [2350, 450]], halfWidth: 980, wheelX: [-1500, 1500], wheelR: 410, roofZ: 1760 },
  sports: { pts: [[-2250, 380], [-2250, 700], [-2100, 830], [-1450, 860], [-850, 1180], [-350, 1250], [500, 1250], [900, 1160], [1300, 900], [2100, 780], [2300, 650], [2300, 380]], halfWidth: 960, wheelX: [-1500, 1500], wheelR: 400, roofZ: 1250 },
};

function circle3(center: Vec3, r: number, plane: "yz" | "xz" | "xy", n = 28): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    if (plane === "xz") pts.push([center[0] + c, center[1], center[2] + s]);
    else if (plane === "yz") pts.push([center[0], center[1] + c, center[2] + s]);
    else pts.push([center[0] + c, center[1] + s, center[2]]);
  }
  return pts;
}

export function bodyLines(style: BodyStyle): Polyline3[] {
  const p = PROFILES[style];
  const w = p.halfWidth;
  const lines: Polyline3[] = [];
  // Side profiles (left and right) and the cross ribs joining them.
  for (const side of [-1, 1]) {
    lines.push({ points: [...p.pts.map(([x, z]) => [x, side * w, z] as Vec3), [p.pts[0]![0], side * w, p.pts[0]![1]]] });
  }
  for (const [x, z] of p.pts) lines.push({ points: [[x, -w, z], [x, w, z]], cls: "thin" });
  // Wheel arches and wheels.
  for (const wx of p.wheelX) {
    for (const side of [-1, 1]) {
      lines.push({ points: circle3([wx, side * w, 420], p.wheelR + 60, "xz").filter((_, i) => i <= 14), cls: "thin" });
      lines.push({ points: circle3([wx, side * (w - 110), 400], p.wheelR, "xz") });
      lines.push({ points: circle3([wx, side * (w - 110), 400], p.wheelR * 0.55, "xz"), cls: "thin" });
      lines.push({ points: [[wx, side * (w - 110), 400], [wx, side * (w - 300), 400]], cls: "thin" });
    }
  }
  // Doors, B-pillar, windows, hood and tailgate lines.
  const doorTop = p.roofZ - 120;
  const rearDoorX: [number, number] = style === "sports" ? [-900, -30] : [-1000, -30];
  const frontDoorX: [number, number] = style === "sports" ? [30, 1000] : [30, 1050];
  for (const side of [-1, 1]) {
    const y = side * (w + 6);
    for (const [x0, x1] of [rearDoorX, frontDoorX]) {
      lines.push({ points: [[x0, y, 430], [x1, y, 430], [x1, y, doorTop - 260], [x0, y, doorTop - 260], [x0, y, 430]], cls: "thin" });
      lines.push({ points: [[x0 + 60, y, doorTop - 240], [x1 - 60, y, doorTop - 240], [x1 - 120, y, doorTop - 20], [x0 + 60, y, doorTop - 20], [x0 + 60, y, doorTop - 240]], cls: "thin" });
      lines.push({ points: [[x0 + 220, y + side * 20, 900], [x0 + 420, y + side * 20, 900]], cls: "thin" });
    }
    // Mirrors.
    lines.push({ points: [[frontDoorX[0] + 80, side * (w + 40), 1080], [frontDoorX[0] + 80, side * (w + 200), 1120], [frontDoorX[0] + 260, side * (w + 200), 1120], [frontDoorX[0] + 260, side * (w + 40), 1080]], cls: "thin" });
  }
  // Windshield and rear glass outlines across the width.
  const ws0 = p.pts[8]!;
  const ws1 = p.pts[7]!;
  lines.push({ points: [[ws0[0], -w + 120, ws0[1] + 10], [ws1[0], -w + 200, ws1[1] - 10], [ws1[0], w - 200, ws1[1] - 10], [ws0[0], w - 120, ws0[1] + 10], [ws0[0], -w + 120, ws0[1] + 10]], cls: "thin" });
  const rg0 = p.pts[3]!;
  const rg1 = p.pts[4]!;
  lines.push({ points: [[rg0[0], -w + 140, rg0[1] + 10], [rg1[0], -w + 200, rg1[1] - 10], [rg1[0], w - 200, rg1[1] - 10], [rg0[0], w - 140, rg0[1] + 10], [rg0[0], -w + 140, rg0[1] + 10]], cls: "thin" });
  // Hood shut line and headlamp/tail-lamp outlines.
  lines.push({ points: [[p.pts[9]![0] - 60, -w + 160, p.pts[9]![1] + 5], [p.pts[9]![0] - 60, w - 160, p.pts[9]![1] + 5]], cls: "thin" });
  for (const side of [-1, 1]) {
    lines.push({ points: [[p.pts[10]![0] - 20, side * (w - 120), 900], [p.pts[10]![0] - 20, side * (w - 520), 940], [p.pts[10]![0] - 140, side * (w - 520), 990], [p.pts[10]![0] - 140, side * (w - 120), 960], [p.pts[10]![0] - 20, side * (w - 120), 900]], cls: "thin" });
    lines.push({ points: [[p.pts[1]![0] + 10, side * (w - 100), 880], [p.pts[1]![0] + 10, side * (w - 480), 900], [p.pts[1]![0] + 120, side * (w - 480), 960], [p.pts[1]![0] + 120, side * (w - 100), 940], [p.pts[1]![0] + 10, side * (w - 100), 880]], cls: "thin" });
  }
  // Pillars: A (windshield base to roof front), B (between doors), C (rear deck to roof rear).
  for (const side of [-1, 1]) {
    const y = side * (w - 40);
    lines.push({ points: [[ws0[0], y, ws0[1]], [ws1[0], y, ws1[1]]], cls: "thin" });
    lines.push({ points: [[0, side * (w + 4), 430], [0, side * (w - 60), doorTop]], cls: "thin" });
    lines.push({ points: [[rg0[0], y, rg0[1]], [rg1[0], y, rg1[1]]], cls: "thin" });
  }
  // Bumper skirts and wheel spokes.
  for (const [x, dir] of [[p.pts[11]![0], 1], [p.pts[0]![0], -1]] as Array<[number, number]>) {
    lines.push({ points: [[x - dir * 30, -w + 60, 380], [x - dir * 30, w - 60, 380], [x - dir * 30, w - 60, 620], [x - dir * 30, -w + 60, 620], [x - dir * 30, -w + 60, 380]], cls: "thin" });
  }
  for (const wx of p.wheelX) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        lines.push({ points: [[wx, side * (w - 110), 400], [wx + Math.cos(a) * p.wheelR * 0.55, side * (w - 110), 400 + Math.sin(a) * p.wheelR * 0.55]], cls: "thin" });
      }
    }
  }
  // Floor / underbody outline (dashed) so the battery reads as under the cabin, and a ground shadow.
  lines.push({ points: [[-1900, -w + 80, 340], [1900, -w + 80, 340], [1900, w - 80, 340], [-1900, w - 80, 340], [-1900, -w + 80, 340]], cls: "dashed" });
  lines.push({ points: circle3([0, 0, 20], 1, "xy", 40).map(([cx, cy, cz]) => [cx * (p.pts[11]![0] + 250), cy * (w + 250), cz] as Vec3), cls: "dashed" });
  return lines;
}

// ---------------------------------------------------------------------------
// Part placement (design positions; scaled per body style)
// ---------------------------------------------------------------------------

/** Base positions for the sedan; other styles scale x by length ratio and z by roof ratio. */
const BASE: Record<string, Box3> = {
  "charge-port-module": { center: [-1750, -905, 860], size: [220, 60, 220] },
  "charge-connector": { center: [-1750, -935, 860], size: [110, 40, 110] },
  "charge-bracket": { center: [-1750, -890, 860], size: [200, 30, 200] },
  "charge-harness": { center: [-1200, -700, 420], size: [900, 60, 60] },
  obc: { center: [1750, -380, 640], size: [340, 300, 160] },
  "hv-junction": { center: [1250, 0, 720], size: [320, 360, 180] },
  "battery-pack": { center: [-150, 0, 250], size: [2600, 1400, 160] },
  "cell-modules": { center: [-150, 0, 250], size: [2300, 1200, 120] },
  bms: { center: [-1300, 0, 360], size: [260, 200, 60] },
  "front-drive-unit": { center: [1450, 0, 450], size: [520, 620, 360] },
  "rear-drive-unit": { center: [-1450, 0, 450], size: [520, 620, 360] },
  "inverter-front": { center: [1450, 0, 720], size: [360, 520, 140] },
  "inverter-rear": { center: [-1450, 0, 720], size: [360, 520, 140] },
  dcdc: { center: [1750, 380, 640], size: [300, 260, 140] },
  "12v-battery": { center: [2000, -480, 660], size: [280, 180, 200] },
  "fuse-box": { center: [2000, 480, 660], size: [260, 200, 140] },
  "hv-harness-front": { center: [700, 0, 520], size: [1200, 80, 60] },
  "hv-harness-rear": { center: [-800, 0, 520], size: [1200, 80, 60] },
  "lv-harness-front": { center: [1650, 0, 900], size: [900, 1300, 40] },
  "lv-harness-cabin": { center: [600, 0, 780], size: [700, 1500, 40] },
  "lv-harness-rear": { center: [-1400, 0, 900], size: [1500, 1300, 40] },
  bcm: { center: [900, -620, 720], size: [200, 160, 60] },
  vcu: { center: [900, 0, 660], size: [220, 180, 60] },
  "start-switch": { center: [760, -160, 1010], size: [60, 60, 30] },
  "instrument-cluster": { center: [820, -400, 1080], size: [80, 340, 140] },
  infotainment: { center: [800, 0, 1000], size: [60, 400, 260] },
  dashboard: { center: [800, 0, 940], size: [360, 1650, 300] },
  "steering-wheel": { center: [560, -400, 1000], size: [60, 380, 380] },
  "steering-column": { center: [760, -400, 900], size: [500, 80, 80] },
  epas: { center: [1400, 0, 560], size: [200, 1300, 120] },
  "seat-FL": { center: [60, -400, 700], size: [560, 520, 780] },
  "seat-FR": { center: [60, 400, 700], size: [560, 520, 780] },
  "seat-RL": { center: [-820, -400, 720], size: [520, 560, 760] },
  "seat-RR": { center: [-820, 400, 720], size: [520, 560, 760] },
  "center-console": { center: [150, 0, 600], size: [800, 260, 260] },
  "door-FL": { center: [540, -930, 880], size: [1000, 40, 900] },
  "door-FR": { center: [540, 930, 880], size: [1000, 40, 900] },
  "door-RL": { center: [-515, -930, 880], size: [960, 40, 900] },
  "door-RR": { center: [-515, 930, 880], size: [960, 40, 900] },
  hood: { center: [1800, 0, 990], size: [900, 1500, 30] },
  tailgate: { center: [-2150, 0, 1050], size: [200, 1500, 400] },
  windshield: { center: [1150, 0, 1230], size: [380, 1500, 320] },
  "rear-glass": { center: [-1050, 0, 1260], size: [400, 1500, 300] },
  "mirror-L": { center: [1210, -1040, 1100], size: [180, 160, 60] },
  "mirror-R": { center: [1210, 1040, 1100], size: [180, 160, 60] },
  "headlamp-L": { center: [2240, -600, 930], size: [140, 400, 90] },
  "headlamp-R": { center: [2240, 600, 930], size: [140, 400, 90] },
  "taillamp-L": { center: [-2240, -620, 920], size: [120, 380, 80] },
  "taillamp-R": { center: [-2240, 620, 920], size: [120, 380, 80] },
  "bumper-front": { center: [2320, 0, 520], size: [80, 1800, 300] },
  "bumper-rear": { center: [-2320, 0, 520], size: [80, 1800, 300] },
  "wheel-FL": { center: [1450, -810, 400], size: [740, 240, 740] },
  "wheel-FR": { center: [1450, 810, 400], size: [740, 240, 740] },
  "wheel-RL": { center: [-1450, -810, 400], size: [740, 240, 740] },
  "wheel-RR": { center: [-1450, 810, 400], size: [740, 240, 740] },
  "thermal-module": { center: [2100, 0, 520], size: [220, 700, 320] },
};

const STYLE_SCALE: Record<BodyStyle, { x: number; z: number; y: number }> = {
  sedan: { x: 1, z: 1, y: 1 },
  suv: { x: 1.02, z: 1.2, y: 1.06 },
  sports: { x: 1, z: 0.86, y: 1.04 },
};

export function partBox(slot: string, style: BodyStyle): Box3 | null {
  const b = BASE[slot];
  if (!b) return null;
  const s = STYLE_SCALE[style];
  return { center: [b.center[0] * s.x, b.center[1] * s.y, b.center[2] * (b.center[2] > 600 ? s.z : 1)], size: [b.size[0] * s.x, b.size[1] * s.y, b.size[2]] };
}

export function boxEdges(b: Box3): Polyline3[] {
  const [cx, cy, cz] = b.center;
  const [sx, sy, sz] = b.size.map((v) => v / 2) as Vec3;
  const c = (dx: number, dy: number, dz: number): Vec3 => [cx + dx * sx, cy + dy * sy, cz + dz * sz];
  const bottom = [c(-1, -1, -1), c(1, -1, -1), c(1, 1, -1), c(-1, 1, -1), c(-1, -1, -1)];
  const top = [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1), c(-1, -1, 1)];
  return [
    { points: bottom },
    { points: top },
    { points: [c(-1, -1, -1), c(-1, -1, 1)] },
    { points: [c(1, -1, -1), c(1, -1, 1)] },
    { points: [c(1, 1, -1), c(1, 1, 1)] },
    { points: [c(-1, 1, -1), c(-1, 1, 1)] },
  ];
}

/** Lane index of a wire among wires sharing the same harness (or the same end points), for fan-out. */
export function wireLane(w: WireDef): { index: number; count: number } {
  const key = w.harness ?? `${w.from}>${w.to}`;
  const group = WIRES.filter((x) => (x.harness ?? `${x.from}>${x.to}`) === key);
  return { index: group.findIndex((x) => x.id === w.id), count: group.length };
}

/**
 * Wire route: leaves the source part from its side face, runs along the harness spine in its own
 * lane, and enters the destination part. Returned as 3D waypoints; the renderer smooths them.
 */
export function wirePath(w: WireDef, style: BodyStyle): Vec3[] {
  const a = partBox(w.from, style);
  const b = partBox(w.to, style);
  if (!a || !b) return [];
  const { index, count } = wireLane(w);
  const lane = (index - (count - 1) / 2) * 36; // mm offset between parallel wires
  const dirY = Math.sign(b.center[1] - a.center[1]) || 1;
  const exitA: Vec3 = [a.center[0], a.center[1] + (dirY * a.size[1]) / 2, a.center[2]];
  const entryB: Vec3 = [b.center[0], b.center[1] - (dirY * b.size[1]) / 2, b.center[2]];
  const pts: Vec3[] = [a.center, exitA];
  if (w.harness && w.harness !== w.from && w.harness !== w.to) {
    const h = partBox(w.harness, style);
    if (h) {
      // Two points along the harness spine so the wire visibly runs inside the harness.
      const spineDir = h.size[0] >= h.size[1] ? 0 : 1;
      const p1: Vec3 = [h.center[0], h.center[1], h.center[2] + lane * 0.4];
      const p2: Vec3 = [...p1] as Vec3;
      const towardA = Math.sign(a.center[spineDir] - h.center[spineDir]) || 1;
      const towardB = Math.sign(b.center[spineDir] - h.center[spineDir]) || -1;
      const half = h.size[spineDir] * 0.35;
      p1[spineDir] = h.center[spineDir] + towardA * half;
      p2[spineDir] = h.center[spineDir] + towardB * half;
      const other = spineDir === 0 ? 1 : 0;
      p1[other] += lane;
      p2[other] += lane;
      pts.push(p1, p2);
    }
  } else {
    // Direct connection: bow the midpoint by the lane offset so parallel wires do not overlap.
    const mid: Vec3 = [(exitA[0] + entryB[0]) / 2, (exitA[1] + entryB[1]) / 2 + lane, (exitA[2] + entryB[2]) / 2 + 60 + Math.abs(lane) * 0.5];
    pts.push(mid);
  }
  pts.push(entryB, b.center);
  return pts;
}

/** Stroke width from gauge text ("70 mm2" -> thick, "0.35 mm2" -> thin). */
export function wireWidth(w: WireDef): number {
  const m = w.gauge.match(/([\d.]+)\s*mm2/);
  const g = m ? Number(m[1]) : 1;
  return g >= 50 ? 3.2 : g >= 10 ? 2.4 : g >= 2 ? 1.8 : 1.3;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export type Camera = { yaw: number; pitch: number; scale: number; target: Vec3 };

export const VIEW = { w: 1000, h: 560 } as const;

export const CAMERA_PRESETS: Record<string, Pick<Camera, "yaw" | "pitch">> = {
  iso: { yaw: -0.62, pitch: 0.42 },
  left: { yaw: 0, pitch: 0.08 },
  right: { yaw: Math.PI, pitch: 0.08 },
  front: { yaw: -Math.PI / 2, pitch: 0.12 },
  rear: { yaw: Math.PI / 2, pitch: 0.12 },
  top: { yaw: -Math.PI / 2, pitch: Math.PI / 2 - 0.02 },
};

export const DEFAULT_CAMERA: Camera = { ...CAMERA_PRESETS.iso!, scale: 0.155, target: [0, 0, 700] };

/** Perspective strength: distance of the eye from the target in model units (larger = flatter). */
export const PERSPECTIVE_DISTANCE = 9000;

/** Perspective projection: returns screen x, y (SVG units) and depth (larger = further away). */
export function project(p: Vec3, cam: Camera): { x: number; y: number; depth: number } {
  const dx = p[0] - cam.target[0];
  const dy = p[1] - cam.target[1];
  const dz = p[2] - cam.target[2];
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  // yaw: rotate around z; the camera looks along +Y1 after rotation
  const x1 = dx * cy - dy * sy;
  const y1 = dx * sy + dy * cy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const up = dz * cp + y1 * sp; // screen up
  const depth = y1 * cp - dz * sp;
  const k = PERSPECTIVE_DISTANCE / Math.max(PERSPECTIVE_DISTANCE * 0.2, PERSPECTIVE_DISTANCE + depth);
  return { x: VIEW.w / 2 + x1 * k * cam.scale, y: VIEW.h / 2 - up * k * cam.scale, depth };
}

/** Scale that fits a box comfortably in the stage. */
export function fitScale(b: Box3, padding = 2.6): number {
  const extent = Math.max(b.size[0], b.size[1], b.size[2], 300) * padding;
  return Math.min(VIEW.w, VIEW.h) / extent;
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  const k = ease(t);
  // shortest yaw path
  let dyaw = b.yaw - a.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  return {
    yaw: a.yaw + dyaw * k,
    pitch: a.pitch + (b.pitch - a.pitch) * k,
    scale: a.scale + (b.scale - a.scale) * k,
    target: [a.target[0] + (b.target[0] - a.target[0]) * k, a.target[1] + (b.target[1] - a.target[1]) * k, a.target[2] + (b.target[2] - a.target[2]) * k],
  };
}

/** Camera that zooms onto a part, keeping the current orientation unless the part is one-sided. */
export function cameraForPart(slot: PartSlot, style: BodyStyle, current: Camera): Camera {
  const box = partBox(slot.slot, style);
  if (!box) return current;
  let yaw = current.yaw;
  let pitch = current.pitch;
  const side = slot.side;
  if (side === "L" || side === "FL" || side === "RL") {
    yaw = -0.55;
    pitch = 0.3;
  } else if (side === "R" || side === "FR" || side === "RR") {
    yaw = Math.PI + 0.55;
    pitch = 0.3;
  } else if (slot.zone === "underbody") {
    yaw = -0.62;
    pitch = 0.9;
  } else if (slot.zone === "cabin-front" || slot.zone === "cabin-rear") {
    yaw = -0.75;
    pitch = 0.55;
  }
  return { yaw, pitch, scale: Math.min(fitScale(box), 0.9), target: box.center };
}

// ---------------------------------------------------------------------------
// Vehicles shown in the explorer
// ---------------------------------------------------------------------------

export type SketchVehicle = { buildId: string; entityId: string; style: BodyStyle; modelName: string; platform: string; suffix: string; note: string };

export const SKETCH_VEHICLES: SketchVehicle[] = [
  { buildId: "DEMO-EV-005", entityId: "DEMO-EV-005", style: "sedan", modelName: "Demo Sedan", platform: "EV-PLATFORM-1", suffix: "0005", note: "Story vehicle: charge-port alignment issue reported at Final Inspection" },
  { buildId: "DEMO-EV-006", entityId: "DEMO-EV-006", style: "suv", modelName: "Demo SUV", platform: "EV-PLATFORM-1", suffix: "0006", note: "Connector replaced after confirmed supplier pin damage; door, mirror and HV contactor issues open" },
  { buildId: "DEMO-EV-007", entityId: "DEMO-EV-007", style: "sports", modelName: "Demo Sport", platform: "EV-PLATFORM-1", suffix: "0007", note: "Shipped; no-wake (ignition), headlamp and seat-heater reports" },
];

// ---------------------------------------------------------------------------
// Search index (parts, circuits, sides)
// ---------------------------------------------------------------------------

const SIDE_WORDS: Array<{ re: RegExp; side: string }> = [
  { re: /\b(front[- ]?left|left[- ]?front|driver'?s?[- ]?(side[- ]?)?front|driver front)\b/i, side: "FL" },
  { re: /\b(front[- ]?right|right[- ]?front|passenger'?s?[- ]?(side[- ]?)?front|passenger front)\b/i, side: "FR" },
  { re: /\b(rear[- ]?left|left[- ]?rear|back[- ]?left)\b/i, side: "RL" },
  { re: /\b(rear[- ]?right|right[- ]?rear|back[- ]?right)\b/i, side: "RR" },
  { re: /\b(left|driver'?s?( side)?|nearside)\b/i, side: "L" },
  { re: /\b(right|passenger'?s?( side)?|offside)\b/i, side: "R" },
  { re: /\b(front)\b/i, side: "F" },
  { re: /\b(rear|back)\b/i, side: "Rr" },
];

export function detectSide(text: string): string | null {
  for (const s of SIDE_WORDS) if (s.re.test(text)) return s.side;
  return null;
}

export type PartMatch = { slot: PartSlot; score: number; matchedOn: string };

/** Deterministic part search: exact synonym > label > partial word, then side disambiguation. */
export function searchParts(text: string, limit = 5): PartMatch[] {
  const q = text.toLowerCase();
  const side = detectSide(q);
  const out: PartMatch[] = [];
  for (const slot of PARTS) {
    let score = 0;
    let matchedOn = "";
    const label = slot.label.toLowerCase();
    if (q.includes(label)) {
      score = 10;
      matchedOn = slot.label;
    }
    for (const syn of slot.synonyms) {
      const s = syn.toLowerCase();
      if (q.includes(s) && s.length + 2 > score) {
        score = Math.max(score, 4 + Math.min(s.length, 8));
        matchedOn = syn;
      }
    }
    if (!score) {
      // whole-word fallback on slot tokens (e.g. "obc", "bms")
      const tokens = slot.slot.split("-");
      for (const t of tokens) if (t.length > 2 && new RegExp(`\\b${t}\\b`).test(q)) {
        score = 3;
        matchedOn = t;
      }
    }
    if (!score) continue;
    if (side) {
      const s = slot.side;
      const compatible =
        (side === "FL" && s === "FL") || (side === "FR" && s === "FR") || (side === "RL" && s === "RL") || (side === "RR" && s === "RR") ||
        (side === "L" && (s === "L" || s === "FL" || s === "RL")) || (side === "R" && (s === "R" || s === "FR" || s === "RR")) ||
        (side === "F" && (s === "FL" || s === "FR" || slot.zone === "front" || slot.zone === "front-bay")) || (side === "Rr" && (s === "RL" || s === "RR" || slot.zone === "rear" || slot.zone === "rear-quarter-left"));
      if (compatible) score += 6;
      else if (s !== "C") score -= 4;
    }
    out.push({ slot, score, matchedOn });
  }
  return out.sort((a, b) => b.score - a.score || a.slot.label.localeCompare(b.slot.label)).slice(0, limit);
}

export function searchCircuits(text: string): CircuitDef[] {
  const q = text.toLowerCase();
  return CIRCUITS.filter((c) => c.synonyms.some((s) => q.includes(s.toLowerCase())) || q.includes(c.name.toLowerCase()) || q.includes(c.id.toLowerCase()));
}

export function wiresForSlot(slot: string): WireDef[] {
  return WIRES.filter((w) => w.from === slot || w.to === slot || w.harness === slot);
}

/** Wires touching any of the given slots (from, to or routed-in harness). */
export function wiresNear(slots: string[]): WireDef[] {
  const set = new Set(slots);
  return WIRES.filter((w) => set.has(w.from) || set.has(w.to) || (w.harness ? set.has(w.harness) : false));
}

/** Human-readable description of a wire for tooltips and the agent. */
export function describeWire(w: WireDef): { title: string; lines: string[] } {
  const c = CIRCUITS.find((x) => x.id === w.circuitId);
  return {
    title: `${w.id} · ${w.signal}`,
    lines: [
      `From ${slotById(w.from)?.label ?? w.from}${w.fromConnector ? ` (${w.fromConnector})` : ""}`,
      `To ${slotById(w.to)?.label ?? w.to}${w.toConnector ? ` (${w.toConnector})` : ""}`,
      w.harness ? `Routed in ${slotById(w.harness)?.label ?? w.harness}` : "Direct connection (no harness)",
      `Circuit ${c?.name ?? w.circuitId} (${w.circuitId})`,
      `${w.voltageClass} · ${w.gauge} · ${w.color}`,
    ],
  };
}

export function wiresForCircuit(circuitId: string): WireDef[] {
  return WIRES.filter((w) => w.circuitId === circuitId);
}

export function slotsForCircuit(circuitId: string): PartSlot[] {
  const ids = new Set<string>();
  for (const w of wiresForCircuit(circuitId)) {
    ids.add(w.from);
    ids.add(w.to);
    if (w.harness) ids.add(w.harness);
  }
  return PARTS.filter((p) => ids.has(p.slot));
}
