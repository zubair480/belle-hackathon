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

Environment variable names (server): `RECALL_AGENT_PROVIDER` (`stub` | `qoder`), `QODER_PERSONAL_ACCESS_TOKEN`, `QODER_MODEL` (default `auto`), `RECALL_AGENT_MAX_TURNS` (default 8), `RECALL_APP_BASE_URL` (default: request origin), `RECALL_AGENT_CWD`. Please add them to `.env.example` (Zubair's file). No credential is read in the browser.

Qoder facts verified on 2026-09-12 from docs.qoder.com: package `@qoder-ai/qoder-agent-sdk`, PAT from qoder.com/account/integrations in `QODER_PERSONAL_ACCESS_TOKEN`, `query()` streams `SDKMessage`s, custom tools via `tool(name, description, zodShape, handler)` + `createSdkMcpServer({name, tools})`, allowlist `mcp__<server>__<tool>`. Not verified: the exact `SDKMessage` field names (the planner reads `type`/`message.content`/`session_id` defensively) and whether `tools: []` disables built-in tools (docs say the option is an allowlist). A first live run with a PAT is needed; report the observed message shapes back and I will tighten the parser.

Additional tests (`frontend/tests/ui/agent.test.tsx`, 10): side/synonym search, stub planner turns (tire -> focus + issues; ignition -> vehicle switch + circuit highlight + open issue; connector batch -> customers; marks + issue draft without saving; invalid tool input), and rendered chat integration (zoom on tire, wiring highlight with circuit select, agent markers into the New Issue form, two issues on one door, mark mode + camera presets). Total suite: 42 passed. `POST /api/agent/chat` was also exercised on the dev server with curl (stub provider): valid envelope, tool calls and UI actions returned; issue tools report nothing because `/api/issues` does not exist yet on this branch.

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

## Integrated run against real routes (2026-09-12, branch `codex/frontend-backend-integration` from `cb359a2`)

Backend mode used: the real HTTP routes under `src/app/api/**` answered by the in-memory service double
(`RECALL_SERVICES=double`, `RECALL_AI_PROVIDER=stub`, `RECALL_AGENT_PROVIDER=stub`,
`NEXT_PUBLIC_RECALL_UI_MOCKS=false`). `GET /api/health` reported `servicesMode: "double"`,
`servicesRegistered: true`, `aiProvider: "stub"`. This is development evidence: the same routes are meant
to be backed by Neo4j later; nothing below was run against a database. No screenshots were captured
(the run was driven through the Browser pane; `docs/pitch/screenshots/` is unchanged).

### What changed (frontend only; `src/server/**`, `src/contracts/**`, `scripts/neo4j/**` untouched)

| Area | Files | Change |
| --- | --- | --- |
| Backend mode badge | `frontend/features/recall/api/health.ts` (new), `api/types.ts`, `api/httpClient.ts`, `api/mockClient.ts`, `api/index.ts`, `features/recall/context.tsx`, `features/recall/RecallWorkspace.tsx` | `RecallClient.getHealth()` reads `GET /api/health` (Zod-validated). The badge now reads "Live API · demo data (service double)" or "Live API · Neo4j graph services", "· <mode> services not wired" or "· backend unreachable" (with re-check), plus "AI: <provider>". A warning banner explains the double; a blocking banner explains unwired services. "Live API" alone never implies Neo4j. Mock mode keeps "Sample data (mock mode)" and never calls health. `WorkspaceApi.backend` exposes the report; the chat header says which backend its tools read. |
| URL routing | `RecallWorkspace.tsx` | View and open issue are mirrored into `location.hash` (`#/issues/<id>/<tab>`, `#/insights`, ...) so F5 reopens the same issue; back/forward work. On by default for the page mount (no injected client); off when a client is injected (tests). `parseRouteHash`/`routeToHash` exported. |
| Entity loading | `VehicleExplorer.tsx` | Replaced the 57-parallel-request burst with a prioritised queue (4 in flight): vehicle first, then whatever the backend reports as installed in it (the charge-port path), then the tapped part, then the rest. `NOT_FOUND` is kept as an explicit `absent` state. |
| No-backend-record state | `PartPanel.tsx`, `VehicleSketch3D.tsx`, `recall.css` | Sketch-only slots render with `data-record="absent"`, faint dotted edges, no origin colour, label "· no record", aria-label suffix; the panel shows a "No backend record" banner and design details only (marked as design data), lists them under a collapsible "No backend record" group, never under "Unknown origin"; the sourcing filter never matches them. "Report issue on this part" from such a slot marks only the vehicle and notes the slot in the evidence text, so the server does not answer INVALID_REFERENCE. Marker-based reports drop absent ids the same way. |
| Vehicle identity | `primitives.tsx` (`SourcingBadge kind`), `PartPanel.tsx`, `IssueDetail.tsx`, `AssemblyContext.tsx` | Vehicles (`origin: null`) show "Vehicle build · no origin record" / "Build", "VIN not assigned", "assembled build · no origin record applies"; never the amber "Unknown origin" styling. The vehicle card shows "Backend record" / "No backend record" / "Record unavailable" and the recorded children. |
| INVALID_REFERENCE on create | `NewIssueForm.tsx` | Shows the server's `details.invalid` list and a "Remove unknown ids" action; the draft and idempotency key are kept. |
| Close rule | `ResolutionPanel.tsx` | Closable fix = the fix whose *latest* verification passed (a later failure re-blocks). When status allows `close` but no fix qualifies, a "Close is blocked (VERIFICATION_REQUIRED)" banner explains what is missing (proposed / applied-unverified / latest failed). Reuse prefill takes limitations from the source fix instead of the server's "limitation: ..." prose (was being double-prefixed). |
| Overview save | `IssueDetail.tsx`, `hooks.ts` | PATCH sends only changed fields (audit now names what was edited). After STALE_VERSION -> "Reload latest", the operator's unsaved selection is kept, untouched fields refresh from the server and the conflict banner clears (`clearError` is now stable). |
| Agent | `frontend/agent/stubPlanner.ts`, `frontend/agent/tools.ts` | The stub planner recognises a sketch entity id in the message (e.g. `BRKT-0005`, switching vehicle if needed) and treats "which vehicles contain parts from the ... lot/batch", "same lot", "impact", "exposure" as an impact question. `impact_of_part` labels the root with the batch/lot code as recorded plus `[lot id ...]` (the trace root stays `ProductionOrigin.productionLotId`; `revisionId: "current"`). This also repairs the pre-existing `agent.test.tsx` failure introduced when the root switched to the lot id. |
| Tests | `frontend/tests/ui/integration-labels.test.tsx` (new, 10 tests) | Badge for double / graph / unwired / unreachable / mock; neutral vehicle labels; absent hotspot + report-from-absent; INVALID_REFERENCE handling; stub impact turn for the bracket lot question; vehicle switch by entity id; hash routing. |

### Commands run

| Command | Result |
| --- | --- |
| `npm ci` | ok |
| `npm run dev -- --port 3210`; `GET /api/health` | `servicesMode: "double"`, `servicesRegistered: true`, `aiProvider: "stub"` |
| `npm run typecheck` | passed |
| `npm run test:ui` | 4 files, 36 passed (26 existing + 10 new) |
| `npm test` | 12 files, 91 passed, 4 skipped (Neo4j suites: no credentials) |
| `POST /api/agent/chat` "which vehicles contain parts from the bracket lot of BRKT-0005" (stub) | tool calls `focus_part`, `list_issues_for_part`, `impact_of_part`; reply: root in-house lot DEMO-MFG-LOT-01 [lot id LOT-MFG-01], 4 vehicles (2 on site DEMO-EV-004/005, 2 shipped to CUST-DEALER-1: DEMO-EV-002/003), 1 quarantined component. Before the fix the stub only zoomed to the bracket. |

### Browser journey (Browser pane, real routes, double behind them)

| # | Step | Result |
| --- | --- | --- |
| 1 | New issue: title, reporting team Final Inspection, station Final inspection, defect Connector misaligned, severity major, part CP-BRKT-200 rev A, marked CPM-0005, CONN-0005, BRKT-0005, DEMO-EV-005; save | PASS: `ISS-0001`, status Open, v1, `created` audit entry; connector "Supplier · DEMO-SUP-LOT-01", bracket "In-house · DEMO-MFG-LOT-01 · WO-DEMO-0001", vehicle "Build · assembled build · no origin record applies", "VIN not assigned" |
| 2 | Reload (`#/issues/ISS-0001`) | PASS: same record reloaded from the server |
| 3 | Assembly context tab | PASS: connector "Bought from supplier" with batch and receipt evidence; bracket "Made in-house" with lot, work order, team "(producer, not a confirmed cause)"; vehicle "Vehicle build · no origin record", build id, VIN not assigned |
| 4 | Assign to In-house Manufacturing, save; then a teammate PATCH via curl and a stale save from the tab | PASS: v2 "Issue saved"; stale save -> `STALE_VERSION` banner, selection kept; "Reload latest" -> latest description, selection still In-house Manufacturing, banner cleared; save again -> success |
| 5 | Hypothesis supplier_component (SUP-CONNECTOR), then confirmed in_house_manufacturing (TEAM-INHOUSE-MFG, ST-BRACKET-CELL, bracket-forming, supersedes CAUSE-0001) | PASS: hypothesis listed without "current", confirmed cause current; header Reporter = Final Inspection, Assigned = In-house Manufacturing, Confirmed cause = In-house Manufacturing / Bracket forming cell; supplier shown as "Suspected supplier cause (hypothesis)", "no confirmed supplier fault" |
| 6 | Resolution tab | PASS: `FIX-BRKT-PRIOR-V1` listed, Verified 2026-09-08, reasons "same part family CP-BRKT-200", "same confirmed cause type in_house_manufacturing", "same process step bracket-forming", warning "Synthetic placeholder" |
| 7 | Reuse as new proposal, save | PASS: `FIX-0001` Proposed, "Proposed from a verified prior resolution", steps copied; source `ISS-BRKT-PRIOR` still closed, `FIX-BRKT-PRIOR-V1` still verified (checked over HTTP) |
| 8 | Close before verification | PASS: Close disabled with hint while Open; after Start work (v6) the "Close is blocked (VERIFICATION_REQUIRED)" banner appears; `POST .../transitions close` sent by hand -> HTTP 409 `VERIFICATION_REQUIRED` |
| 8b | Mark applied and request verification | PASS: pending_verification v7, fix "Applied (awaiting verification)", `fix_applied` audit |
| 9 | Record failed verification | PASS: issue back to In progress v8, "Failed" row, close still blocked with "latest verification ... failed" |
| 10 | Record passed verification, close | PASS: fix Verified, "Close with verified fix v1" enabled, Closed v10 |
| 11 | Reopen | PASS: In progress v11; history shows created, updated, both causes, fix created, start_work, fix applied, request_verification, fail transition, both verifications, close, reopen |
| 12 | New issue `ISS-0002` (CP-BRKT-200 rev A, BRACKET_OUT_OF_TOLERANCE, BRKT-0004/CPM-0004/DEMO-EV-004), Resolution tab | PASS: `FIX-0001` (verified, from ISS-0001) and `FIX-BRKT-PRIOR-V1` both listed with reasons |
| 13 | Insights and drilldown | PASS: Final Inspection reported 3 / confirmed 0; In-house Manufacturing assigned open 1 / confirmed cause 2; connector supplier linked 1, confirmed 1, rate N/A "no complete cohort"; drilldown on "Confirmed cause: In-house Manufacturing" lists ISS-0001 and ISS-BRKT-PRIOR with evidence |
| 14 | Vehicles view | PASS: badge "Live API · demo data (service double)" + banner; DEMO-EV-005 "Backend record", VIN not assigned, recorded parts CPM-0005; "3 recorded, 53 no backend record"; BATT-0005 hotspot `data-record="absent"`, "No backend record" panel with design details only; charge-port module/connector/bracket coloured from their records |
| 15 | Assistant: "which vehicles contain parts from the bracket lot of BRKT-0005" | PASS: chips focus_part, list_issues_for_part, impact_of_part; sketch zooms to the bracket; trace-backed answer as above; header "Server agent · /api/agent/chat · tools read demo data (service double)" |
| Console | | only 404s for sketch-only entity ids (expected NOT_FOUND); no script errors after the final edit |

Not run: `RECALL_SERVICES=graph`, server restart persistence (BROWSER_ACCEPTANCE 15), `RECALL_AI_PROVIDER=none` draft button (16; the UI has no AI draft button), database stop (17).

### Backend observations (routes owned by the API lane; not changed here)

1. `POST /api/issues/:id/fixes` on the double sets `issue.currentFixRevisionId` to the new fix while its state is still `proposed`. The contract comment says "fix revision currently applied/verified, if any". The UI now derives its close guidance from fix state and verifications, not from this field, but the "current fix" badge follows the server value.
2. `PATCH /api/issues/:id` audit summary lists every field in the body ("Updated description, assignedTeamId") even when a value is unchanged; the UI now sends only changed fields.
3. `SimilarResolution.applicabilityWarnings` carries the fix's limitations as "limitation: <text>"; saving that text back as a limitation produced "limitation: limitation: ..." on the next retrieval. The UI now copies the source fix's `applicability.limitations` instead.
4. Everything else matched the contract: envelopes, 201/200 on create, `Idempotency-Key` header + body, repeated query keys, `STALE_VERSION` 409 with `currentVersion`, `INVALID_REFERENCE` 400 with `details.invalid` (e.g. `entity:BATT-0005`), `VERIFICATION_REQUIRED` 409, `request_verification` applying the fix, fail-while-pending returning to `in_progress`, `revisionId: "current"` resolving to `ev-r1` on `POST /api/incidents/:id/traces`, `GET /api/health` envelope.
