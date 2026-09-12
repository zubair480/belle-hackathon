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

Round 8 (Ali's direction): all mock/sample wording was removed from the screens: no mock banner, no "Sample data (mock mode)" badge, no "Sample vehicle" badge, no "(sample)" suffix on evidence names, no "Mock evaluation" text, no stub-planner warning; synthetic evidence is labelled "Internal record" and the built-in planner is labelled "Built-in assistant". This departs from the shared contract's "label mocks visibly": the mode badge is still available with `NEXT_PUBLIC_RECALL_SHOW_MODE=true` (top bar only) and `client.mode` still drives behaviour, so Zubair can turn the label on for the integrated run if the team wants it. The seed export was regenerated after the evidence names changed.

Round 7: wires are now drawn above the parts (the parts' exact tap outlines were covering them, so a real mouse could not hover a wire). Hovering a wire shows the tooltip (id, signal, from/to with connectors, harness, circuit, class/gauge/colour) plus the serials it joins on this vehicle and any open issues at its ends, and also writes the wire's details into the strip under the sketch. Verified with a real Playwright hover.

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

## Round 9 (2026-09-12, evening): frontend on the graph-backed backend

Branch `codex/ali-ui-pitch` was fast-forwarded to `codex/final-integration` @ `8dda91b` (no new commit; my
f202d63 was already an ancestor). Everything below is uncommitted on top of that SHA at the time of
writing, per Ali's "don't commit" instruction.

### Database and datasets (Aura instance `7bd3cbcf`, credentials in `.env.local`, gitignored)

| Dataset | Loader | State after this round |
| --- | --- | --- |
| Zubair's EV seed (issues, fixes, lots, entities, trace runs; `ws=synthetic-ev-assembler`) | `npm run neo4j:seed` (idempotent MERGE) | re-run; unchanged counts (Issue 12, Fix 6, Entity 21, TraceRun 6) |
| Codey's fixture (EntityState / DataRevision / SupplierBatch / Installation / Shipment) | his `scripts/neo4j/seed-ev-fixture.ts` | already present on the instance (EntityState 21, Installation 14, Shipment 4); not re-run |
| Ali's EV-PLATFORM-1 design (PartSlot 56, Wire 45, Circuit 12, Connector 42, Zone 10, System 9) | **new** `node frontend/data/ev-platform/seed-aura.mjs` | loaded (183 statements). Aura has no cypher-shell, so the loader parses `neo4j/import.cypher` (`:param` lines) and runs it through the driver |

`npm run neo4j:check`: connected, server Neo4j/5.27-aura, 77 workspace nodes.

### Code changes (Ali's lane unless flagged)

- `frontend/features/recall/api/{types,httpClient,mockClient}.ts`: two additive client methods. `getHealth()` reads
  `GET /api/health`; `getPlatformDesign()` reads the new `GET /api/platform/design`. The mock serves the bundled
  JSON design with `source: "bundled"`.
- **New route** `src/app/api/platform/design/route.ts` (thin delegate, same pattern as `api/agent/chat`; flagged to
  Zubair) -> `frontend/features/recall/server/platformDesign.ts`, a read-only query over Zubair's
  `openSession` for the platform/revision nodes. No fallback to JSON: unreachable graph -> `BACKEND_UNAVAILABLE`
  (503), dataset not loaded -> `NOT_FOUND` with the loader command.
- `RecallWorkspace.tsx`: backend badge from `/api/health`. "Neo4j graph" only when `servicesMode=graph`,
  `servicesRegistered` and `neo4jConfigured`; "Service double · demo data" for the double; "Backend unreachable"
  on failure. Mock label stays opt-in (`NEXT_PUBLIC_RECALL_SHOW_MODE=true`).
- `VehicleExplorer.tsx`: vehicle-first loading. Fetch the vehicle record, then only the parts it lists as
  installed (current children plus historical installations, three levels). Sketch parts the record does not
  contain get status `absent` with no request (was 23 GETs per vehicle, 20 of them 404). A failed vehicle read
  marks parts `error` ("unavailable"), never "not recorded". Design-source line under the sketch names where the
  design data came from and any drift between bundled wires and the graph; the wiring overlay is disabled while
  the design read fails.
- `PartPanel.tsx`: `absent` vs `unavailable` counts and copy; vehicle "Origin: Assembled here · no origin record"
  when the record has `origin: null` (Zubair's note). `IssueDetail.tsx`: same wording for vehicles in the affected
  items table.
- `frontend/tests/ui/integration-states.test.tsx`: 8 tests for the states above (badge x4, partial record, failed
  read, design source + vehicle label, design unavailable).
- Env: `.env` no longer sets `RECALL_AGENT_DATA=mock`, so the agent's server tools call the real routes.

### Verification (server SHA 8dda91b + uncommitted changes, `RECALL_SERVICES=graph`, `NEXT_PUBLIC_RECALL_UI_MOCKS=false`)

| Check | Result |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run test:ui` | 46 passed (6 files) |
| `npx vitest run --exclude 'tests/integration/**'` | 110 passed, 4 skipped (15 files); integration suite skipped on purpose because it writes to the shared instance |
| `GET /api/health` | `servicesMode: graph`, `servicesRegistered: true`, `neo4jConfigured: true` |
| `GET /api/platform/design` | `source: neo4j`, 56 slots / 45 wires / 12 circuits / 42 connectors |
| `GET /api/entities/CONN-0005` | supplier origin from the graph; `DOOR-0005-FL` -> NOT_FOUND (expected, no request from the UI any more) |
| `POST /api/agent/chat` (Qoder Agent SDK, real PAT) | 21.8 s; model chose `impact_of_part`, trace ran in graph mode: DEMO-SUP-LOT-01 -> Demo Dealer 1, DEMO-EV-002/003 shipped |
| Browser (headless Chromium, 1440x900) | badge "Neo4j graph"; design line "Neo4j graph · EV-PLATFORM-1/v1 · 56 slots · 45 wires · 12 circuits"; DEMO-EV-005: 3 recorded / 20 not in backend; vehicle "Assembled here · no origin record"; charge-port zoom shows lot DEMO-MFG-LOT-02, containment CPM-0005 -> DEMO-EV-005, children CONN-0005 (supplier) / BRKT-0005 (in-house); no console errors. Screenshots 30-32 |

Supersedes earlier bullets in "Remaining work": the live client has now been exercised against the real routes
in graph mode; per-vehicle entity loading is no longer 57 parallel requests; the Qoder planner has run with a
real PAT against the graph.

### Still open for Ali

- Full `tests/integration/BROWSER_ACCEPTANCE.md` pass with screenshots (steps 1a, 4, 12, 14, 16, 17 remain from
  Zubair's run).
- Pitch screenshots 01-29 are from mock mode; 30-32 are graph mode. Recapture the story set from graph mode.
- Zubair's handoff mentions a separate agent on `codex/frontend-backend-integration` (not on origin); if it
  lands, reconcile the badge and absent-part states with this round rather than keeping both.

### For Zubair

- New thin route file under `src/app/api/platform/design/` (your tree). Delete it if you would rather mount it
  yourself; the handler lives in `frontend/features/recall/server/platformDesign.ts`.
- `.env.example` could list `NEXT_PUBLIC_RECALL_SHOW_MODE` (opt-in mock label) and note the design loader.
- `package-lock.json` was left exactly as on the branch (npm 10 strips `libc` fields on install; reverted).

## Round 10 (2026-09-12, night): relationships, graph view, agent that identifies and creates issues

Still uncommitted on top of `codex/final-integration` @ 8dda91b (Ali's instruction). Server run in graph mode
(`RECALL_SERVICES=graph`, mocks off) against Aura `7bd3cbcf`.

### Data now in Neo4j (workspace `synthetic-ev-assembler`)

- **New loader** `node frontend/data/ev-platform/seed-demo-aura.mjs` (app must be running): (1) catalog items the
  design references through `POST /api/catalog/:kind` (15 suppliers, 4 teams, 5 stations, 11 process steps,
  12 defect codes; 46 added); (2) for the six seed vehicles and every design slot except the charge-port trio,
  `Supplier` / `SupplierLot` / `MfgLot` / `Entity` / `Origin` / `INSTALLED_IN` written with the same labels and
  properties as `scripts/neo4j/seed-ev.mts` (318 entities, 318 installations, 16 supplier lots, 9 in-house lots),
  so Zubair's `graphServices` read them unchanged; the sketch now shows 20+ recorded exterior parts per vehicle;
  (2b) the three seed customers and a `SHIPPED_TO` for DEMO-EV-007 (already shipped, no customer); (3) the 11
  non-charge-port issues from `seed.json` and their 6 cause hypotheses through `POST /api/issues` and
  `/causes` (idempotency keys `seed-<id>`, so re-runs replay). Zubair's seed stays the baseline and both loaders
  are idempotent.
- **Incident**: after the first run of `npx vitest run --exclude 'tests/integration/**'` the workspace had lost the
  issues created by Zubair's runner/browser sessions (Issue 12 -> 2, Audit 57 -> 3). The exclude flag did not
  filter (vitest still listed 13 integration files); `tests/data/neo4j.integration.test.ts` runs
  `DETACH DELETE` per label on `{workspaceId}`. `npm run neo4j:seed` restored the baseline (idempotent); the
  runner-created issues referenced in `docs/evidence/acceptance-graph-*.json` are gone and can be recreated
  with `npm run acceptance`. Do not run `tests/data` or `tests/integration` against the shared instance; the safe
  set is `npx vitest run tests/api tests/contracts frontend/tests`.

### Code (Ali's lane; two thin route files in src/app flagged for Zubair)

- `frontend/features/recall/graph/model.ts`: WorkspaceGraph (nodes/edges, zod), `adjacency`, `subgraph` (BFS),
  `vehiclesContaining`, `describeSubgraph`.
- `frontend/features/recall/server/graphRead.ts` + **new route** `GET /api/graph` (`src/app/api/graph/route.ts`,
  thin delegate): read-only Cypher over Zubair's model, workspace-scoped, Origin collapsed into
  `Entity -FROM_SUPPLIER_LOT/PRODUCED_IN-> lot`; current causes only. 450 nodes / 815 edges at the time of writing.
- Client: `getGraph()`, `upsertCatalogItem(kind, item)` (frozen `catalogUpsert` route). Mock builds the same
  graph shape from its store.
- **Graph view** (`frontend/components/recall/GraphView.tsx`, nav "Graph"): force layout in the browser, kind
  filters, search, focus + depth, neighbour list, open issue/part from a node, supplier list with lot / linked /
  confirmed counts, **Add a supplier** form (writes through `POST /api/catalog/suppliers`; verified: SUP-BRAKES
  appears in the catalog and the graph).
- **Agent tools** (`frontend/agent/tools.ts`): `graph_neighbours`, `supplier_exposure` (lots -> parts -> vehicles
  on site/shipped with customers -> issues affecting/linking -> confirmed causes naming the supplier),
  `related_issues` (same lot / same part number / same vehicle; names a pattern vs one-off), `customers_supplied`
  (issue or defect code or part -> vehicles -> `SHIPPED_TO` distributors, on-site vehicles, same-lot exposure
  without a reported issue), and `create_issue` (real `POST /api/issues`; only on an explicit ask; refuses unknown
  supplier ids; links suppliers as context; opens the saved issue). `ToolCallRecord.detail` carries the full
  recorded result and the chat shows it verbatim under the reply ("Recorded result · tool"), so lists survive
  whatever the model writes. `focus_graph` UI action only sets the Graph view focus; it never navigates.
- Tests: `frontend/tests/ui/graph.test.tsx` (model, view + add supplier, tools incl. customers_supplied and
  create_issue refusing unknown suppliers). Suites: `npx vitest run tests/api tests/contracts frontend/tests`
  -> 105 passed; typecheck passed.

### Observed with the real Qoder Agent SDK (PAT on the server, graph mode)

| Ask | Tools the model chose | Result |
| --- | --- | --- |
| "What else is affected by the harness supplier? Are there related issues?" | find_part, focus_part, supplier_exposure, related_issues | 2 lots, 36 parts, 6 vehicles (4 on site, 2 shipped to Demo Dealer 1), 5 open issues; named a same-lot pattern (AC derate + HV contactor chatter) as "candidate, not confirmed cause" |
| "Create an issue: right mirror on DEMO-EV-006 grinding noise, minor, link the mirror supplier" | locate_fault, list_issues_for_part, focus_part, graph_neighbours, create_issue | ISS-MTZ0CT3AF378CA created (open v1, Final Inspection, supplier linked as context), fold-motor zone marked, issue opened |
| "The left headlamp on DEMO-EV-007 has condensation, what should I do?" | locate_fault, list_issues_for_part, related_issues | No issue created; found the existing open issue and said not to duplicate it |
| "Which distributors received cars with the defects on this vehicle?" (DEMO-EV-007) | customers_supplied | Demo Dealer North: DEMO-EV-007 with 3 open issues; Demo Dealer 1: DEMO-EV-002/003 exposed through the same lots, no issue reported; user stays on the current screen |

Model prose varied between runs on one phrasing ("defections"); the recorded result block under the reply is the
authoritative list.

### Screenshots (graph mode)

33 whole graph, 34 supplier focus (SUP-HARNESS), 35 add supplier, 36 chat distributors list.

### Open

- Full browser checklist replay (sketch marking -> create -> assign -> cause -> reuse -> verify -> close -> reopen,
  stale second tab, insights drilldown) was started and paused by Ali after the first step: it left one open
  issue in the graph, `ISS-MTZ0HBDN7C52F5` "... (graph-mode browser run)" (v1, three marked parts, no
  assignment/cause/fix). Harmless demo data; delete or reuse it. Zubair's earlier browser run covers the loop on
  the previous seed.
- `.env.example` for Zubair: nothing new is required; `RECALL_AGENT_DEBUG=1` logs the SDK message stream server-side.
