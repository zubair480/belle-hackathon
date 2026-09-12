# Ali handoff (frontend, typed client + mocks, pitch)

**Layout:** the whole UI lane lives under `/frontend` (`frontend/components/recall`, `frontend/features/recall`, `frontend/tests/ui`). `src/features/recall/index.ts` is a one-line re-export shim so the agreed mount `import { RecallWorkspace } from "@/features/recall"` keeps working. Two root-config edits were needed and are listed under "Shared config changes requested through Zubair".

**Update (later on 2026-09-12, uncommitted at Ali's request):** 3D sketch, agent harness (Qoder Agent SDK + stub planner), chat panel, platform parts/wiring dataset for Neo4j, and expanded mock data. See "Agent harness and 3D sketch" below. Branch head `fe5900a` does not contain this work yet.

Contract version: `assembly-quality-v4` (as published on `main` at 71e4773).
Base commit: `main` @ 71e4773 (foundation dfdaae5 plus the v4 source contract).
Branch: `codex/ali-ui-pitch`. Code commit: `fcc8b25`. The branch head at push time (this handoff commit) is the SHA to merge; Zubair receives it in the team message.

Note on the branch layout: `origin/codex/zubair-api-integration` @ 1f92bb8 still carries the superseded food/lot contract and has no `src/contracts/issues.ts`. This lane binds only to the v4 files on `main`. Zubair's routes for the issue API do not exist yet on any branch; everything below ran against the labelled UI mock.

## What was built

| Area | Files | Notes |
| --- | --- | --- |
| Workspace shell and export | `frontend/features/recall/RecallWorkspace.tsx`, `frontend/features/recall/index.ts` | `export { RecallWorkspace }`; props `client?`, `initialView?`, `instantZoom?`. Mock-mode banner and top-bar badge. |
| Typed client | `frontend/features/recall/api/types.ts`, `httpClient.ts`, `index.ts` | One method per frozen `ISSUE_ROUTES` entry. Every envelope is validated with the shared Zod schemas; a malformed or failed response becomes `{ ok: false, error }` with code `NETWORK` or the server code. No runtime fallback to the mock. |
| Labelled mock | `frontend/features/recall/api/mockClient.ts`, `api/mock/server.ts`, `api/mock/data.ts` | Selected only by `NEXT_PUBLIC_RECALL_UI_MOCKS=true`. Enforces `TRANSITIONS`, `expectedVersion` (STALE_VERSION), idempotency replay/DUPLICATE_ACTION, INVALID_REFERENCE, VERIFICATION_REQUIRED on close. Sample data uses `EV_DEMO` ids. `controls.failNext(method, error)` injects failures for tests. |
| Vehicles view | `frontend/components/recall/VehicleExplorer.tsx`, `VehicleSketch.tsx`, `PartPanel.tsx`, `frontend/features/recall/sketches/models.ts` | Three synthetic models (sedan DEMO-EV-005, crossover DEMO-EV-006, compact DEMO-EV-007). White line art on black, draw-on animation, tap-to-zoom viewBox tween, sub-sketch for the charge port (connector + bracket) and battery (cell modules). Hotspot colour = recorded `sourcingType`; red pulse = open issue. Right rail: vehicle identity (build ID, VIN or "not assigned yet"), parts grouped by Bought from supplier / Made in-house / Unknown origin, selected-part provenance, containment path, replacement history, linked issues, "Report issue on this part". |
| Issues | `IssueBoard.tsx`, `NewIssueForm.tsx`, `IssueDetail.tsx` | Filters (status, severity, team + role, text). Manual form with idempotency key per draft; draft preserved on error. Detail always re-fetches; four attribution labels; linked vs suspected vs confirmed supplier; comments with evidence; PATCH assignment with `expectedVersion` and a reload action on STALE_VERSION; audit history. |
| Investigation | `CausePanel.tsx` | Hypotheses, confirmed and rejected causes listed separately; record form with supersede. |
| Resolution | `ResolutionPanel.tsx` | Similar-resolution panel (source issue, fix, verification, match reasons, applicability warnings, unverified suggestions flagged). Reuse creates an editable proposal labelled "Proposed from a verified prior resolution". Apply, verification (pass/fail), triage/start/close/reopen through the API. Close is pre-checked in the UI and enforced by the server. |
| Assembly context | `AssemblyContext.tsx` | Per marked entity: origin, current containment path to vehicle and location state, historical containment (removed intervals), limitations. |
| Insights | `InsightsView.tsx` | Filters: date, defect type, part family/number, process area, station, team role, supplier, status, severity. Team table (reported / assigned open / confirmed cause), supplier table (linked / confirmed / distinct units / cohort / rate or N/A), detection-station, causal-process, cause-type and defect-family buckets. Every count opens a drilldown of the issues and their evidence. |
| Styling | `frontend/components/recall/recall.css` | Scoped under `.rrx`; re-maps the shared tokens to the dark theme. Zubair's `globals.css` untouched. |
| Mount | `src/app/page.tsx` | Replaced the placeholder body with `<RecallWorkspace />` (the edit the placeholder comment expects). `src/app/layout.tsx` still says "food co-packers" in `metadata.description`; Zubair's file, please update. |

## Agent harness and 3D sketch (uncommitted update)

| Area | Files | Notes |
| --- | --- | --- |
| 3D sketch | `frontend/features/recall/sketches/car3d.ts`, `frontend/components/recall/VehicleSketch3D.tsx` | Orthographic wireframe projected in SVG (no dependency). Three body styles, 56 placed part slots (front bay, HV, cabin incl. steering/seats/start switch, doors, lamps, wheels), left/right distinguished by camera side and depth dimming. Drag to rotate, wheel to zoom, presets iso/left/right/front/rear/top, tap-to-zoom, children (connector, bracket, cells, BMS) appear when the parent is selected. Markers (circles) on parts or wires; wiring overlay coloured HV/LV/signal with per-circuit highlight. |
| Platform dataset | `frontend/data/ev-platform/` | `parts.json` (56 slots with synonyms, sourcing template, spec), `wiring.json` (12 circuits, 42 connectors, 45 wires), `export-neo4j.mjs` -> `neo4j/*.csv` + `import.cypher`, README with the graph model and example Cypher. For Codey to load; the UI reads the same JSON. |
| Agent harness | `frontend/agent/tools.ts` | 12 tools: find_part, focus_part, list_issues_for_part, trace_circuit, wires_of_part, impact_of_part (assembly trace -> vehicles and customers), mark, open_issue, draft_issue, similar_resolutions, set_camera, select_vehicle. Data tools call the typed client; UI tools queue `UiAction`s that the browser applies. The agent never saves, assigns, closes or confirms anything. |
| Planners | `frontend/agent/stubPlanner.ts`, `frontend/agent/server/qoderPlanner.ts`, `frontend/agent/server/chatHandler.ts`, `src/app/api/agent/chat/route.ts` | Stub = deterministic keyword intent (no model), labelled in the UI, runs in the browser in mock mode and on the server by default. Qoder = `@qoder-ai/qoder-agent-sdk` `query()` with the tools wrapped by `tool()`/`createSdkMcpServer()`, `allowedTools` restricted to `mcp__recall__*`, `tools: []` to exclude file/shell tools, `permissionMode: dontAsk`. SDK loaded dynamically; missing package or token -> `AI_UNAVAILABLE`, never a silent fallback. |
| Chat UI | `frontend/components/recall/AgentChat.tsx` | Docked panel; suggestions; tool chips per reply; provider badge; UI actions applied to the workspace (zoom, vehicle switch, wiring highlight, markers, open issue, prefilled New Issue draft). |
| Mock data | `frontend/features/recall/api/mock/data.ts`, `server.ts` | Six vehicles instantiated from the catalog (DEMO-EV-002..007; 005/006/007 sketched), customers and shipments, `runTrace` over the frozen `TraceResult` DTO, issues on the front right tire (TPMS), a two-issue door (DOOR-0006-FL), and a no-wake ignition case (ISS-IGN-006) with two hypotheses. |

Round 3 additions (same uncommitted update): three body styles (sedan DEMO-EV-005 unchanged, SUV DEMO-EV-006, sports car DEMO-EV-007) with distinct wireframe profiles; tapping a part zooms in and reveals its child components and the wires attached to that part and its children (the global Wiring toggle still shows all 45 wires); hovering a component shows what it is, its system/zone/side, origin, design details, wires and open issues; hovering a wire shows where it comes from and goes to, via which harness and connectors, its circuit, voltage class, gauge and colour. Seed moved to `frontend/data/ev-platform/seed.json` (single source for the mock and for `neo4j/seed.cypher`): 6 vehicles, 337 installations, 13 issues (new: HV contactor chatter on the SUV, chafed front harness, seat heater open circuit, mirror fold noise, AC charge derate), 9 cause assessments, 25 evidence records, 3 customers, 4 shipments. Codey loads `neo4j/import.cypher` (design) then `neo4j/seed.cypher` (instances and issues); the file uses v4 DTO field names as properties and plain relationship names, and he may rename to his schema.

Round 5 (Ali's direction): the Inside layer was removed; the sketch draws exterior parts only (23 slots) and the rail lists them; interior parts remain in the records, the issues, the assistant and the part detail (with an "interior part, not drawn" note) but have no zoom target. Fixed a real-browser tap bug: pointer capture was taken on pointer-down, so the click after a tap landed on the SVG background and deselected; capture now starts only after a drag has moved, and the drag record survives until the following click has been evaluated. Regression test: pointerdown/pointerup/click sequence must zoom, a drag must not deselect. Second cause found with a real Playwright click: tap areas were large overlapping circles, so a neighbouring part (or a far part drawn later) intercepted the tap. Tap areas are now each part's exact projected outline (convex hull of its box corners) and parts are drawn far-to-near so the part in front wins. Verified in a real browser: headlamp, charge port (children revealed, two attached wires), connector child and rear wheel all select and zoom; Reset view works.

Round 4 additions: New Issue rebuilt as a proper dialog (`Dialog` primitive: Esc closes, overlay click closes, body scroll locked, bounded scrolling body, sticky footer with a live summary; five sections; severity as buttons; marked items described by part and zone); 3D now uses mild perspective, pillars, bumper skirts, wheel spokes and a ground shadow, with lighter part boxes at full view; wires are smoothed routes that exit the source part, run in their own lane along the harness spine and enter the destination, with connector dots and gauge-based thickness; two view layers, Outside (body and exterior parts) and Inside (ghosted body; cabin, electrical, powertrain), where only the active layer's parts are rendered and interactive, and selecting a part from the list or via the assistant switches the layer automatically. `ExplorerState.layer` was added; the agent's `focus_part` action sets it.

Environment variable names (server): `RECALL_AGENT_PROVIDER` (`stub` | `qoder`), `QODER_PERSONAL_ACCESS_TOKEN`, `QODER_MODEL` (default `auto`), `RECALL_AGENT_MAX_TURNS` (default 8), `RECALL_APP_BASE_URL` (default: request origin), `RECALL_AGENT_CWD`, `RECALL_AGENT_DATA` (`mock` makes the server tools read an in-memory sample dataset so the Qoder planner can be tested before the routes exist; default: live routes). Browser: `NEXT_PUBLIC_RECALL_AGENT=server` sends chat to `/api/agent/chat` even in mock mode (otherwise mock mode runs the stub planner in the browser). Please add them to `.env.example` (Zubair's file). No credential is read in the browser.

Round 6: `@qoder-ai/qoder-agent-sdk` 1.0.39 is now installed (package.json/lockfile changed; Zubair to accept), `qodercli` 1.1.51 is on Ali's machine. The SDK's own type definitions confirm the planner's assumptions (assistant messages carry `message.content[]` text blocks, `session_id` on messages, options `tools`, `allowedTools`, `permissionMode`, `resume`, `continue`, `maxTurns`, `model`, `systemPrompt`, `cwd`); `query()` is closed with `close()` after the stream. New tool `locate_fault`: given a part and the symptom, marks the likely fault locations inside the part (fault-zone map in `frontend/features/recall/sketches/faultZones.ts`: flange / pins / seal for the charge port, seals / gaps / hinges / latch / regulator for doors, vent membrane / connector / tab for lamps, TPMS valve / lug bolts / bead for wheels, and so on) as labelled pins; the stub planner calls it whenever a symptom is described on a part. The selection ring around a zoomed part was removed; the bright outline marks selection.

**Observed real Qoder run (2026-09-12, Ali's machine, PAT from `.env`, `RECALL_AGENT_PROVIDER=qoder`, `RECALL_AGENT_DATA=mock`):** `POST /api/agent/chat` with "The charge port is misaligned on DEMO-EV-005, where should I look?" returned in 16.7 s with provider `Qoder Agent SDK` (model `auto`), a session id, two model-chosen tool calls (`locate_fault`, `list_issues_for_part`) and UI actions focusing CPM-0005 and marking the bracket flange. The reply named the flange as the likely location and labelled it design guidance, not a confirmed cause. The route, the in-process MCP tools, the session id and the message parsing therefore work against the installed SDK 1.0.39.

Qoder facts verified on 2026-09-12 from docs.qoder.com: package `@qoder-ai/qoder-agent-sdk`, PAT from qoder.com/account/integrations in `QODER_PERSONAL_ACCESS_TOKEN`, `query()` streams `SDKMessage`s, custom tools via `tool(name, description, zodShape, handler)` + `createSdkMcpServer({name, tools})`, allowlist `mcp__<server>__<tool>`. Not verified: the exact `SDKMessage` field names (the planner reads `type`/`message.content`/`session_id` defensively) and whether `tools: []` disables built-in tools (docs say the option is an allowlist). A first live run with a PAT is needed; report the observed message shapes back and I will tighten the parser.

Additional tests (`frontend/tests/ui/layers-dialog.test.tsx`, 5): exterior/interior classification, wire lanes and widths, Outside/Inside visibility and auto-switch from the list and from the assistant, New Issue dialog sections, summary, disabled submit, Escape close and scroll-lock restore. Additional tests (`frontend/tests/ui/sketch3d.test.tsx`, 5): body styles, wiresNear, zoom disclosure (no wires at full view, attached wires and children after tapping the charge port), hover tooltips for a wire and a component, seeded issues on the SUV and the sports car. Additional tests (`frontend/tests/ui/agent.test.tsx`, 10): side/synonym search, stub planner turns (tire -> focus + issues; ignition -> vehicle switch + circuit highlight + open issue; connector batch -> customers; marks + issue draft without saving; invalid tool input), and rendered chat integration (zoom on tire, wiring highlight with circuit select, agent markers into the New Issue form, two issues on one door, mark mode + camera presets). Total suite: 52 passed. `POST /api/agent/chat` was also exercised on the dev server with curl (stub provider): valid envelope, tool calls and UI actions returned; issue tools report nothing because `/api/issues` does not exist yet on this branch.

## Setup and commands

```bash
npm ci
cp .env.example .env.local        # set NEXT_PUBLIC_RECALL_UI_MOCKS=true for the UI-only run
npm run dev                       # http://localhost:3000
npm run typecheck
npm run test:ui                   # Ali's suites
npm test                          # all suites
npm run build
```

Environment variable names used by this lane: `NEXT_PUBLIC_RECALL_UI_MOCKS` only. No credentials are read or stored client-side.

## What was actually tested (September 12, 2026, this machine, Node 22.18)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | passed |
| Mock rule tests (node) | `frontend/tests/ui/mock-server.test.ts` | 6 passed: create/reload/idempotency replay and DUPLICATE_ACTION; STALE_VERSION and INVALID_REFERENCE; close blocked before pass, allowed after, history kept on reopen; similar-resolution ranking with reasons and warnings; role-separated team counts, supplier linked vs confirmed, rate present only with a complete cohort, N/A otherwise; entity context origins, replacement history, build ID with null VIN, NOT_FOUND for unknown ids |
| Rendered workflow tests (jsdom) | `frontend/tests/ui/workspace.test.tsx` | 10 passed: mock banner and three models; zoom reveals connector (supplier, batch, receipt evidence, "no VIN yet") and bracket (lot, work order, process); unrecorded/replaced part shows historical containment; New Issue prefilled from a part; manual create -> stored record -> reload; backend NETWORK error keeps the draft and retry succeeds with the same key; assignment save and STALE_VERSION conflict with reload; attribution labels on the prior closed issue (reporter vs confirmed causal team, linked supplier not at fault); supplier hypothesis kept separate from confirmed fault; full loop prior verified fix -> "Proposed from a verified prior resolution" -> Close disabled -> start work -> apply -> failed verification keeps it open -> pass -> close -> retrievable for a later issue; insights counts, N/A rate, drilldown dialog with evidence |
| All suites | `npm test` | 32 passed (16 foundation contract tests + 16 UI tests) |
| Production build | `npm run build` | passed (Next 16.3.5, Turbopack) |
| Browser run | dev server in mock mode, headless Chromium 1440x900 | Vehicles -> zoom -> report from part -> save -> Resolution -> reuse -> save proposal -> Insights -> drilldown; no console errors; screenshots in `docs/pitch/screenshots/` |

Not tested: any real HTTP route, Neo4j persistence, or the integrated run with mocks disabled. Those do not exist on this branch and are outside this lane.

## API assumptions to confirm with Zubair (contract gaps found while binding)

1. **Applying a fix.** The contract has `FixState` `applied` and audit kind `fix_applied` but no apply endpoint. The UI sends `POST /issues/:id/transitions` with `action: "request_verification"` and `fixRevisionId`; the mock marks that fix `applied`, sets `appliedAt` and `currentFixRevisionId`. The mock also marks a `proposed` fix `applied` when a verification is recorded against it. Please confirm or publish an explicit rule.
2. **Query encoding for GET filters.** `toQuery` in `httpClient.ts` repeats the key for arrays (`status=open&status=triaged`) and omits undefined/empty values. `cursor`/`limit` are passed as plain strings.
3. **Idempotency key transport.** Sent both in the JSON body (`idempotencyKey`) and in the `Idempotency-Key` header, per `IDEMPOTENCY_HEADER`.
4. **`SimilarResolution.verificationId` for unverified suggestions.** The schema requires an id; the mock uses the literal `"NONE"` and the UI treats it as "Unverified suggestion". Tell me the real convention.
5. **`InsightsFilter.teamRole` without a team id.** The UI passes it through; the mock keeps counts role-separated regardless and notes it. Confirm intended semantics.
6. **Entity ids drawn on sketches.** Sketch geometry is UI-only (`sketches/models.ts`). Hotspots map to `EntityContext` by id (`CPM-0005`, `CONN-0005`, `BRKT-0005`, `BATT-0005`, `CELL-0005`, `FDU-0005`, `RDU-0005`, `LAMP-0005`, `WHL-0005-F/R`, `HVC-0005`, `DOOR-0005-F`, `GLS-0005`, and the same suffixes for 0006/0007). Codey's EV fixture only needs the charge-port path (`EV_DEMO.entities`) for the P0 story; any other id returns NOT_FOUND and the UI shows "not in backend" without inventing provenance.
7. **Reference catalog.** The UI needs `GET /api/catalog` at first load; the form is blocked with a visible error when it fails. The mock catalog adds suppliers/teams/stations beyond `EV_DEMO` (SUP-CELLS, SUP-LAMP, SUP-WHEEL, SUP-HARNESS, SUP-GLASS, TEAM-BODY, TEAM-BATTERY, TEAM-QUALITY-ENG, ST-INCOMING, ST-BATTERY-MARRIAGE, ST-BODY-SHOP and matching process steps/defect codes). Codey can seed them or the extra sketch parts will show "Unknown origin"/"not in backend".
8. **Shipment lines.** `EntityContext` has no shipment records; the assembly path ends at the vehicle's `locationState` ("shipped (shipment record)"). If a shipment DTO is added to the detail, the UI can show it.
9. **Drilldown fetching.** Metric drilldown calls `GET /api/issues/:id` for up to 20 ids in parallel. If that is too heavy for the real service, an `ids` filter on `GET /api/issues` would replace it.
10. **Agent chat route.** `POST /api/agent/chat` is additive (not in the frozen contract): request `{messages, context, sessionId}`, response `{reply, toolCalls, uiActions, provider, sessionId, warnings}` (schemas in `frontend/agent/types.ts`). The server tools call the app's own frozen routes over HTTP with `RECALL_APP_BASE_URL`; when Zubair's routes exist they work unchanged. The contract's `agentTool` route (`AGENT_TOOLS`) is untouched.
11. **Platform slots vs entities.** The 3D sketch and search index are keyed by design slot; `entityIdFor(slot, suffix)` gives `prefix-<suffix>[-side]`. Codey's EV seed only needs the charge-port ids from `EV_DEMO` for the P0 story; any other slot without a record shows "not in backend". The dataset README shows the `INSTANCE_OF_SLOT` link to run after his entity seed.
12. **Landing view.** Per Ali's request the app opens on the Vehicles sketch explorer with the issue workflow one tap away (New issue in the top bar and on every part); no upload wizard or alert inbox. `initialView="issues"` is available if the team prefers the board as the landing page.

## Shared config changes requested through Zubair

| File | Change | Why |
| --- | --- | --- |
| `vitest.config.mts` | `include` adds `"frontend/tests/**/*.test.{ts,tsx}"` | UI tests moved under `/frontend` |
| `package.json` | `test:ui` runs `vitest run frontend/tests/ui` | same |
| `src/features/recall/index.ts` | one-line `export * from "../../../frontend/features/recall"` | keeps the agreed mount path |

No dependency or alias changes; frontend files import contracts via the existing `@/contracts/*` alias and each other by relative path.

## Remaining work and limits

- The live client has not been exercised against real routes; the first integrated run may surface envelope mismatches, which the client reports as `NETWORK` with the Zod issue list.
- The 3D wireframe is illustrative geometry; wire paths are drawn between part positions, not measured routing. Camera tween 650 ms; `instantZoom` disables it for tests. Far-side parts are dimmed, not hidden.
- The Qoder planner has not been run with a real PAT in this session; the stub planner and the route were.
- Live mode loads 57 entity records per vehicle in parallel for the sketch; if that is too heavy for the real service, a batch endpoint would replace it.
- Comments cannot select existing evidence ids yet (they can attach a new note); cause assessments can.
- No CAD/photo drawing. No agent/AI panel in the UI (the `agent*` routes are unused).
- Screenshots were taken in mock mode and must be recaptured from the integrated build.
- Qoder usage: this lane's code was written in this session's editor. The submission must list only Qoder sessions that actually happened.
