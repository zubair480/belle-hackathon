/**
 * Deterministic stub planner: keyword intent -> tool calls. No model. Labelled "stub" in the UI.
 * Runs in the browser in mock mode and on the server when RECALL_AGENT_PROVIDER=stub, so the
 * harness (tools + UI actions) can be demonstrated without any credential.
 */
import { SKETCH_VEHICLES, searchCircuits, searchParts, wiresForCircuit } from "../features/recall/sketches/car3d";
import { runTool, type ToolContext } from "./tools";
import type { AgentChatRequest, AgentChatResponse, ToolCallRecord } from "./types";

const HELP = `I can: find and zoom to a part ("show the right front tire"), trace a circuit ("ignition does not respond"), list issues on a part, show which vehicles and customers got parts from the same batch or lot ("who did we supply with this connector?"), mark parts or wires ("circle the bracket and the start wire"), open an issue by id, or draft a new issue from the marked parts. Say "left side", "top" or "rear" to rotate the sketch.`;

export async function runStubTurn(ctx: ToolContext, request: AgentChatRequest): Promise<AgentChatResponse> {
  const last = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const q = last.toLowerCase();
  const toolCalls: ToolCallRecord[] = [];
  const parts: string[] = [];
  const call = async (name: string, input: Record<string, unknown>) => {
    const { record, result } = await runTool(ctx, name, input);
    toolCalls.push(record);
    parts.push(result.text);
    return result;
  };

  const vehicleMention = last.match(/DEMO-EV-\d{3}/i)?.[0]?.toUpperCase() ?? null;
  if (vehicleMention && vehicleMention !== ctx.context.vehicleBuildId && SKETCH_VEHICLES.some((v) => v.buildId === vehicleMention)) {
    await call("select_vehicle", { buildId: vehicleMention });
    ctx.context = { ...ctx.context, vehicleBuildId: vehicleMention };
  }
  const issueMention = last.match(/ISS-[A-Z0-9-]+/i)?.[0]?.toUpperCase() ?? null;
  const wantsImpact = /\b(suppl(y|ied|ier)|customer|business|ship|deliver|ground|fleet|dealer|recall|affected|other (cars|vehicles))\b/i.test(last);
  const wantsMark = /\b(mark|circle|flag|highlight|ring)\b/i.test(last);
  const wantsDraft = /\b(open|create|raise|report|start|new|draft)\b.*\bissue\b/i.test(last) && !/\b(list|show|what|which|any|see|find)\b.*\bissues?\b/i.test(last);
  const wantsSimilar = /\b(similar|prior|previous|fix|resolution|solved before)\b/i.test(last);
  const wantsWires = /\b(wire|wires|wiring|cable|harness|connector pin|electrical)\b/i.test(last);
  // Word-start match so "misaligned", "condensation", "leaking" all count as symptoms.
  const describesSymptom = /\b(issue|problem|fault|broken|wrong|noise|leak|loose|misalign|proud|flush|gap|condens|fog|stuck|grind|rattle|won'?t|doesn'?t|not (working|closing|charging)|damage|bent|crack|where)/i.test(last);
  const camera = /\b(top view|from (the )?top|underneath|from below)\b/i.test(last) ? "top" : /\b(left side|from the left)\b/i.test(last) ? "left" : /\b(right side|from the right)\b/i.test(last) ? "right" : /\b(front view|from the front)\b/i.test(last) ? "front" : /\b(rear view|from the (rear|back))\b/i.test(last) ? "rear" : /\b(iso|reset view|whole car|full car)\b/i.test(last) ? "iso" : null;

  const circuits = searchCircuits(last);
  const partMatches = searchParts(last, 3);
  const bestPart = partMatches[0] ?? null;

  if (issueMention && (wantsSimilar || /\b(open|show)\b/i.test(last))) {
    if (wantsSimilar) await call("similar_resolutions", { issueId: issueMention });
    else await call("open_issue", { issueId: issueMention });
  }

  if (circuits.length && (!bestPart || bestPart.score < 12 || wantsWires || /\b(ignition|start|charg|steer|light|traction|can bus)\b/i.test(last))) {
    await call("trace_circuit", { query: last });
    if (wantsMark) {
      const c = circuits[0]!;
      for (const w of wiresForCircuit(c.id)) await call("mark", { wireId: w.id, note: `Agent: possible fault path on ${c.name}` });
    }
  } else if (bestPart) {
    const focus = await call("focus_part", { query: last });
    const entityId = (focus.data as { entityId?: string } | undefined)?.entityId ?? null;
    if (entityId) {
      if (describesSymptom && !wantsMark) await call("locate_fault", { entityId, symptom: last });
      await call("list_issues_for_part", { entityId });
      if (wantsWires) await call("wires_of_part", { entityId });
      if (wantsImpact) await call("impact_of_part", { entityId });
      if (wantsMark) {
        const strong = partMatches.filter((m) => m.score >= 10);
        const targets = strong.length ? strong : partMatches.slice(0, 1);
        for (const m of targets) await call("mark", { slot: m.slot.slot, note: `Agent: marked from "${last.slice(0, 80)}"` });
      }
      if (wantsDraft) await call("draft_issue", { entityIds: [entityId], note: `Drafted from chat: ${last.slice(0, 200)}` });
    }
  } else if (wantsImpact && ctx.context.selectedEntityId) {
    await call("impact_of_part", { entityId: ctx.context.selectedEntityId });
  } else if (wantsDraft) {
    await call("draft_issue", { entityIds: ctx.context.selectedEntityId ? [ctx.context.selectedEntityId] : [], note: `Drafted from chat: ${last.slice(0, 200)}` });
  } else if (wantsMark && ctx.context.selectedEntityId) {
    await call("mark", { entityId: ctx.context.selectedEntityId, note: `Agent: marked from "${last.slice(0, 80)}"` });
  }

  if (camera) await call("set_camera", { preset: camera });

  if (!toolCalls.length) parts.push(HELP);
  return {
    reply: parts.join("\n\n"),
    toolCalls,
    uiActions: ctx.ui,
    provider: { name: "Deterministic stub planner (no model)", mode: "stub", model: null },
    sessionId: request.sessionId ?? null,
    warnings: ["Stub planner: intent is keyword-matched, not model-generated. Set RECALL_AGENT_PROVIDER=qoder with a QODER_PERSONAL_ACCESS_TOKEN for the Qoder Agent SDK."],
  };
}
