/**
 * Fault zones: named sub-locations inside an exterior part where a reported symptom is likely to
 * sit (design knowledge for the synthetic platform, not measured data). Offsets are fractions of
 * the part's box half-size along x (length), y (width, left negative) and z (height). The
 * assistant's locate_fault tool matches symptom words to zones and places markers on them.
 */
import { partBox, slotById, type BodyStyle, type Vec3 } from "./car3d";

export type FaultZone = { id: string; label: string; offset: Vec3; symptoms: RegExp; why: string };

const Z = (id: string, label: string, offset: Vec3, symptoms: RegExp, why: string): FaultZone => ({ id, label, offset, symptoms, why });

const FAULT_ZONES: Record<string, FaultZone[]> = {
  "charge-port-module": [
    Z("bracket-flange", "Bracket flange (left mount)", [-0.6, 0.2, -0.3], /misalign|proud|flush|offset|crooked|bracket|gap|tilt/i, "Flange dimension sets the connector position; out-of-tolerance flange shifts the connector"),
    Z("connector-pins", "Connector pins", [0, -0.9, 0], /\bpins?\b|bent|no charge|won'?t charge|not charging|contact|arc|burn/i, "Bent or damaged pins stop the handshake or DC path"),
    Z("port-door-seal", "Port door seal", [0.7, 0.4, 0.8], /door|seal|water|leak|rattle|noise|close/i, "Door seal and latch decide flushness and water ingress"),
    Z("inlet-lock", "Inlet lock actuator", [0.6, -0.3, -0.7], /lock|stuck|release|latch/i, "Lock actuator holds the plug; failure prevents release"),
  ],
  "charge-connector": [
    Z("dc-pins", "DC pins", [0, -0.6, 0.2], /dc|fast|pin|bent|burn|arc|no charge/i, "DC+ / DC- pins carry fast charge"),
    Z("cp-pp-pins", "CP / PP pilot pins", [0, -0.6, -0.4], /pilot|handshake|cp|pp|communication|won'?t start charg|derate/i, "Pilot pins negotiate the session"),
    Z("inlet-seal", "Inlet seal", [0, 0.2, 0], /seal|water|leak|corros/i, "Seal keeps water off the terminals"),
  ],
  "charge-bracket": [
    Z("flange", "Flange", [-0.7, 0, 0], /flange|misalign|proud|flush|dimension|tolerance|bent/i, "12.0 +/- 0.3 mm flange sets the connector height"),
    Z("mount-holes", "Mounting holes", [0.6, 0, 0.6], /hole|bolt|loose|torque|mount/i, "M6 mounting holes to the rear quarter"),
  ],
  "door-FL": doorZones(),
  "door-FR": doorZones(),
  "door-RL": doorZones(),
  "door-RR": doorZones(),
  hood: [
    Z("latch", "Hood latch / striker", [0.9, 0, 0], /latch|striker|close|pop|open|rattle/i, "Latch alignment decides closing effort and flushness"),
    Z("hinges", "Hinges", [-0.9, 0, 0], /hinge|gap|sag|align/i, "Hinges set the rear gap"),
    Z("harness-route", "Harness routing at latch bracket", [0.8, -0.3, -0.5], /chafe|harness|wire|rub/i, "Front LV harness runs past the latch bracket"),
  ],
  tailgate: [
    Z("latch", "Tailgate latch", [0, 0, -0.9], /latch|close|open|stuck/i, "Latch engagement"),
    Z("hinge", "Hinges", [0, 0, 0.9], /hinge|gap|sag|align/i, "Hinges set the gap"),
    Z("seal", "Tailgate seal", [0, 0, 0], /seal|water|leak|noise|wind/i, "Perimeter seal"),
  ],
  windshield: [
    Z("lower-seal", "Lower seal / cowl", [0, 0, -0.9], /leak|water|seal|whistle|noise/i, "Lower urethane bead and cowl seal"),
    Z("camera-bracket", "Camera bracket", [0, 0, 0.8], /camera|adas|bracket|calibrat/i, "Forward camera bracket bonded to the glass"),
    Z("edge", "Glass edge / crack origin", [0, 0.9, 0.3], /crack|chip|stone|scratch/i, "Edge chips propagate"),
  ],
  "rear-glass": [
    Z("defroster-tab", "Defroster connector tab", [0, -0.9, 0], /defrost|heater|tab|connector|no heat/i, "Defroster feed tab on the left edge"),
    Z("seal", "Rear glass seal", [0, 0, -0.8], /seal|leak|water|noise/i, "Perimeter seal"),
  ],
  "mirror-L": mirrorZones(),
  "mirror-R": mirrorZones(),
  "headlamp-L": lampZones(),
  "headlamp-R": lampZones(),
  "taillamp-L": [
    Z("seal", "Lamp seal", [0, 0, 0], /condens|fog|moist|seal|water/i, "Housing seal"),
    Z("connector", "Lamp connector", [0.8, 0, -0.5], /connector|no light|flicker|out|wire/i, "Rear harness connector"),
  ],
  "taillamp-R": [
    Z("seal", "Lamp seal", [0, 0, 0], /condens|fog|moist|seal|water/i, "Housing seal"),
    Z("connector", "Lamp connector", [0.8, 0, -0.5], /connector|no light|flicker|out|wire/i, "Rear harness connector"),
  ],
  "bumper-front": [
    Z("clips", "Fascia clips", [0, 0.8, 0.5], /clip|loose|gap|rattle|align/i, "Clip engagement to the fender"),
    Z("sensor-mounts", "Sensor mounts", [0, 0, 0], /sensor|park|radar|camera/i, "Parking sensor and radar brackets"),
  ],
  "bumper-rear": [
    Z("clips", "Fascia clips", [0, -0.8, 0.5], /clip|loose|gap|rattle|align/i, "Clip engagement to the quarter panel"),
    Z("sensor-mounts", "Sensor mounts", [0, 0, 0], /sensor|park|radar/i, "Parking sensor brackets"),
  ],
  "wheel-FL": wheelZones(),
  "wheel-FR": wheelZones(),
  "wheel-RL": wheelZones(),
  "wheel-RR": wheelZones(),
};

function doorZones(): FaultZone[] {
  return [
    Z("upper-seal", "Upper door seal", [0, 0, 0.85], /seal|wind|noise|whistle|water|leak/i, "Upper seal against the roof rail"),
    Z("b-pillar-gap", "Gap at B-pillar", [-0.95, 0, 0.2], /gap|flush|align|step|out of spec/i, "Gap and flush set at the hinge and striker"),
    Z("hinge", "Hinges", [0.95, 0, 0.2], /hinge|sag|drop|align/i, "Hinge bolts and shims"),
    Z("latch", "Latch / striker", [-0.9, 0, -0.2], /latch|lock|close|striker|stuck|central locking/i, "Latch engagement and lock motor"),
    Z("window-regulator", "Window regulator", [0, 0, -0.4], /window|regulator|glass|slow|stuck window/i, "Regulator and motor inside the door"),
  ];
}
function mirrorZones(): FaultZone[] {
  return [
    Z("fold-motor", "Fold motor", [-0.6, 0, -0.4], /fold|grind|noise|motor|stuck/i, "Fold actuator gearbox"),
    Z("glass-actuator", "Glass actuator", [0.3, 0, 0.2], /adjust|glass|actuator|tilt/i, "Mirror glass adjuster"),
    Z("connector", "Mirror connector", [-0.9, 0, -0.8], /connector|heater|no power|wire/i, "Door harness connector"),
  ];
}
function lampZones(): FaultZone[] {
  return [
    Z("vent-seal", "Vent membrane / lens seal", [0, 0, 0.6], /condens|fog|moist|seal|water|leak/i, "Vent membrane and lens bond keep moisture out"),
    Z("connector", "Lamp connector", [-0.8, 0, -0.5], /connector|no light|flicker|dead|wire|power/i, "Front harness connector"),
    Z("mount-tab", "Mounting tab", [0.6, 0, -0.7], /tab|loose|align|gap|aim/i, "Mounting tab sets the aim and the gap to the hood"),
  ];
}
function wheelZones(): FaultZone[] {
  return [
    Z("tpms-valve", "TPMS sensor / valve", [0, 0, 0.9], /tpms|pressure|sensor|valve/i, "Sensor bonded to the valve stem"),
    Z("lug-bolts", "Lug bolts", [0, 0, 0], /lug|bolt|torque|loose|wobble/i, "5 lug bolts at 140 Nm"),
    Z("tire-bead", "Tire bead / sidewall", [0, 0, -0.8], /tire|tyre|bead|sidewall|leak|puncture|wear|vibration/i, "Bead seat and sidewall"),
  ];
}

export function faultZonesFor(slot: string): FaultZone[] {
  return FAULT_ZONES[slot] ?? [];
}

/** Zones whose symptom pattern matches the text, best first; falls back to the first zone. */
export function matchFaultZones(slot: string, text: string, limit = 2): FaultZone[] {
  const zones = faultZonesFor(slot);
  const hits = zones.filter((z) => z.symptoms.test(text));
  return (hits.length ? hits : zones.slice(0, 1)).slice(0, limit);
}

/** 3D position of a zone inside its part on the given body style. */
export function faultZonePosition(slot: string, zoneId: string, style: BodyStyle): Vec3 | null {
  const box = partBox(slot, style);
  const zone = faultZonesFor(slot).find((z) => z.id === zoneId);
  if (!box || !zone) return null;
  return [box.center[0] + (zone.offset[0] * box.size[0]) / 2, box.center[1] + (zone.offset[1] * box.size[1]) / 2, box.center[2] + (zone.offset[2] * box.size[2]) / 2];
}

export function faultZoneLabel(slot: string, zoneId: string): string {
  return faultZonesFor(slot).find((z) => z.id === zoneId)?.label ?? `${slotById(slot)?.label ?? slot} · ${zoneId}`;
}
