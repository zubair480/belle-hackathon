/**
 * Platform design read from the graph (Ali's lane; additive, outside the frozen contract).
 * Backs GET /api/platform/design: the EV-PLATFORM-1 design dataset (part slots, wires, circuits,
 * connectors) as loaded into Neo4j by `node frontend/data/ev-platform/seed-aura.mjs`.
 * Read-only. It never falls back to the bundled JSON: when the graph is unreachable the route
 * answers BACKEND_UNAVAILABLE, and when the dataset is not loaded it answers NOT_FOUND.
 */
import { apiFail, apiOk, DomainError, type ErrorCode } from "@/contracts/common";
import { openSession } from "@/server/graph/driver";
import type { PlatformDesign } from "../api/types";
import { PLATFORM } from "../sketches/car3d";

type Env = Record<string, string | undefined>;

export async function readPlatformDesign(env: Env = process.env): Promise<PlatformDesign> {
  const session = openSession(env, "READ");
  try {
    const res = await session.run(
      `MATCH (n) WHERE n.platform = $platform AND n.revision = $revision AND (n:PartSlot OR n:Wire OR n:Circuit OR n:Connector)
       RETURN labels(n)[0] AS label, coalesce(n.slot, n.id) AS id ORDER BY label, id`,
      { platform: PLATFORM.id, revision: PLATFORM.revision },
    );
    const by: Record<string, string[]> = { PartSlot: [], Wire: [], Circuit: [], Connector: [] };
    for (const r of res.records) (by[String(r.get("label"))] ??= []).push(String(r.get("id")));
    const slots = by.PartSlot ?? [];
    const wires = by.Wire ?? [];
    const circuits = by.Circuit ?? [];
    return {
      platform: PLATFORM.id,
      revision: PLATFORM.revision,
      source: "neo4j",
      counts: { slots: slots.length, wires: wires.length, circuits: circuits.length, connectors: (by.Connector ?? []).length },
      slotIds: slots,
      wireIds: wires,
      circuitIds: circuits,
    };
  } finally {
    await session.close();
  }
}

export async function handlePlatformDesign(): Promise<Response> {
  try {
    const design = await readPlatformDesign();
    if (design.counts.slots === 0) {
      return Response.json(apiFail("NOT_FOUND", `Design ${PLATFORM.id}/${PLATFORM.revision} is not loaded in the graph. Run: node frontend/data/ev-platform/seed-aura.mjs`), { status: 404 });
    }
    return Response.json(apiOk(design));
  } catch (e) {
    const code: ErrorCode = e instanceof DomainError ? e.code : "BACKEND_UNAVAILABLE";
    // Never leak driver messages (they can carry hosts or credentials).
    return Response.json(apiFail(code, "Design graph unavailable."), { status: 503 });
  }
}
