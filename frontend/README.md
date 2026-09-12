# frontend (Ali's lane)

The RecallRadius UI: 3D-sketch-first EV assembly quality workspace on contract `assembly-quality-v4`, with an agent harness on top of the Qoder Agent SDK.

```
frontend/
  agent/                harness: tools.ts (12 tools), stubPlanner.ts (no model), types.ts (chat DTOs, UI actions)
  agent/server/         qoderPlanner.ts (Qoder Agent SDK, in-process MCP tools), chatHandler.ts (POST /api/agent/chat)
  components/recall/    screens: VehicleSketch3D, VehicleExplorer, PartPanel, AgentChat, IssueBoard, IssueDetail, ResolutionPanel, InsightsView ...
  data/ev-platform/     parts.json + wiring.json (synthetic platform design), Neo4j CSV/Cypher export, README
  features/recall/      RecallWorkspace shell, typed API client + labelled mock, 3D geometry (sketches/car3d.ts), hooks, labels
  tests/ui/             vitest suites (mock rules, rendered workflows, agent harness)
```

- Export: `RecallWorkspace` from `frontend/features/recall/index.ts`; `src/features/recall/index.ts` re-exports it for the app route.
- Mock mode: `NEXT_PUBLIC_RECALL_UI_MOCKS=true` (visible banner). The chat then runs the deterministic stub planner in the browser.
- Agent route: `POST /api/agent/chat` (thin adapter in `src/app/api/agent/chat/route.ts`). `RECALL_AGENT_PROVIDER=stub` (default) or `qoder` with `QODER_PERSONAL_ACCESS_TOKEN` and `npm install @qoder-ai/qoder-agent-sdk`.
- Commands from the repo root: `npm run dev`, `npm run test:ui`, `npm run typecheck`, `npm run build`, `node frontend/data/ev-platform/export-neo4j.mjs`.
- Contracts come from `src/contracts/*` via the `@/contracts/*` alias; nothing here imports server code except the agent route adapter.

See `docs/handoffs/ALI.md` for tested results and API assumptions, and `docs/pitch/` for the judge materials.

## Running against Neo4j (graph mode)

`.env.local` (gitignored): `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`,
`RECALL_SERVICES=graph`, `RECALL_WORKSPACE_ID`, `NEXT_PUBLIC_RECALL_UI_MOCKS=false`. Then:

```bash
npm run neo4j:check                                  # connectivity
npm run neo4j:seed                                   # Zubair's EV seed (idempotent)
node frontend/data/ev-platform/seed-aura.mjs         # platform design dataset (idempotent)
npm run dev                                          # top bar shows "Neo4j graph" from /api/health
```

The top-bar badge is what the server reports: "Neo4j graph" (graph services registered and Neo4j configured),
"Service double · demo data" (`RECALL_SERVICES=double`) or "Backend unreachable". Sketch parts the vehicle
record does not contain are marked "not in backend" without a request; a failed read is shown as unavailable.
Leave `RECALL_AGENT_DATA` unset so the assistant's server tools call the real routes.
