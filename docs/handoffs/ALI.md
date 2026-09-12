# Ali handoff (frontend, typed client + mocks, pitch)

Contract version: `assembly-quality-v4` (as published on `main` at 71e4773).
Base commit: `main` @ 71e4773 (foundation dfdaae5 plus the v4 source contract).
Branch: `codex/ali-ui-pitch`. Code commit: `fcc8b25`. The branch head at push time (this handoff commit) is the SHA to merge; Zubair receives it in the team message.

Note on the branch layout: `origin/codex/zubair-api-integration` @ 1f92bb8 still carries the superseded food/lot contract and has no `src/contracts/issues.ts`. This lane binds only to the v4 files on `main`. Zubair's routes for the issue API do not exist yet on any branch; everything below ran against the labelled UI mock.

## What was built

| Area | Files | Notes |
| --- | --- | --- |
| Workspace shell and export | `src/features/recall/RecallWorkspace.tsx`, `src/features/recall/index.ts` | `export { RecallWorkspace }`; props `client?`, `initialView?`, `instantZoom?`. Mock-mode banner and top-bar badge. |
| Typed client | `src/features/recall/api/types.ts`, `httpClient.ts`, `index.ts` | One method per frozen `ISSUE_ROUTES` entry. Every envelope is validated with the shared Zod schemas; a malformed or failed response becomes `{ ok: false, error }` with code `NETWORK` or the server code. No runtime fallback to the mock. |
| Labelled mock | `src/features/recall/api/mockClient.ts`, `api/mock/server.ts`, `api/mock/data.ts` | Selected only by `NEXT_PUBLIC_RECALL_UI_MOCKS=true`. Enforces `TRANSITIONS`, `expectedVersion` (STALE_VERSION), idempotency replay/DUPLICATE_ACTION, INVALID_REFERENCE, VERIFICATION_REQUIRED on close. Sample data uses `EV_DEMO` ids. `controls.failNext(method, error)` injects failures for tests. |
| Vehicles view | `src/components/recall/VehicleExplorer.tsx`, `VehicleSketch.tsx`, `PartPanel.tsx`, `src/features/recall/sketches/models.ts` | Three synthetic models (sedan DEMO-EV-005, crossover DEMO-EV-006, compact DEMO-EV-007). White line art on black, draw-on animation, tap-to-zoom viewBox tween, sub-sketch for the charge port (connector + bracket) and battery (cell modules). Hotspot colour = recorded `sourcingType`; red pulse = open issue. Right rail: vehicle identity (build ID, VIN or "not assigned yet"), parts grouped by Bought from supplier / Made in-house / Unknown origin, selected-part provenance, containment path, replacement history, linked issues, "Report issue on this part". |
| Issues | `IssueBoard.tsx`, `NewIssueForm.tsx`, `IssueDetail.tsx` | Filters (status, severity, team + role, text). Manual form with idempotency key per draft; draft preserved on error. Detail always re-fetches; four attribution labels; linked vs suspected vs confirmed supplier; comments with evidence; PATCH assignment with `expectedVersion` and a reload action on STALE_VERSION; audit history. |
| Investigation | `CausePanel.tsx` | Hypotheses, confirmed and rejected causes listed separately; record form with supersede. |
| Resolution | `ResolutionPanel.tsx` | Similar-resolution panel (source issue, fix, verification, match reasons, applicability warnings, unverified suggestions flagged). Reuse creates an editable proposal labelled "Proposed from a verified prior resolution". Apply, verification (pass/fail), triage/start/close/reopen through the API. Close is pre-checked in the UI and enforced by the server. |
| Assembly context | `AssemblyContext.tsx` | Per marked entity: origin, current containment path to vehicle and location state, historical containment (removed intervals), limitations. |
| Insights | `InsightsView.tsx` | Filters: date, defect type, part family/number, process area, station, team role, supplier, status, severity. Team table (reported / assigned open / confirmed cause), supplier table (linked / confirmed / distinct units / cohort / rate or N/A), detection-station, causal-process, cause-type and defect-family buckets. Every count opens a drilldown of the issues and their evidence. |
| Styling | `src/components/recall/recall.css` | Scoped under `.rrx`; re-maps the shared tokens to the dark theme. Zubair's `globals.css` untouched. |
| Mount | `src/app/page.tsx` | Replaced the placeholder body with `<RecallWorkspace />` (the edit the placeholder comment expects). `src/app/layout.tsx` still says "food co-packers" in `metadata.description`; Zubair's file, please update. |

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
| Mock rule tests (node) | `tests/ui/mock-server.test.ts` | 6 passed: create/reload/idempotency replay and DUPLICATE_ACTION; STALE_VERSION and INVALID_REFERENCE; close blocked before pass, allowed after, history kept on reopen; similar-resolution ranking with reasons and warnings; role-separated team counts, supplier linked vs confirmed, rate present only with a complete cohort, N/A otherwise; entity context origins, replacement history, build ID with null VIN, NOT_FOUND for unknown ids |
| Rendered workflow tests (jsdom) | `tests/ui/workspace.test.tsx` | 10 passed: mock banner and three models; zoom reveals connector (supplier, batch, receipt evidence, "no VIN yet") and bracket (lot, work order, process); unrecorded/replaced part shows historical containment; New Issue prefilled from a part; manual create -> stored record -> reload; backend NETWORK error keeps the draft and retry succeeds with the same key; assignment save and STALE_VERSION conflict with reload; attribution labels on the prior closed issue (reporter vs confirmed causal team, linked supplier not at fault); supplier hypothesis kept separate from confirmed fault; full loop prior verified fix -> "Proposed from a verified prior resolution" -> Close disabled -> start work -> apply -> failed verification keeps it open -> pass -> close -> retrievable for a later issue; insights counts, N/A rate, drilldown dialog with evidence |
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
10. **Landing view.** Per Ali's request the app opens on the Vehicles sketch explorer with the issue workflow one tap away (New issue in the top bar and on every part); no upload wizard or alert inbox. `initialView="issues"` is available if the team prefers the board as the landing page.

## Remaining work and limits

- The live client has not been exercised against real routes; the first integrated run may surface envelope mismatches, which the client reports as `NETWORK` with the Zod issue list.
- Sketches are illustrative side profiles; only the charge-port and battery hotspots have sub-sketches. Zoom uses a viewBox tween (620 ms); `instantZoom` disables it for tests.
- Comments cannot select existing evidence ids yet (they can attach a new note); cause assessments can.
- No CAD/photo drawing. No agent/AI panel in the UI (the `agent*` routes are unused).
- Screenshots were taken in mock mode and must be recaptured from the integrated build.
- Qoder usage: this lane's code was written in this session's editor. The submission must list only Qoder sessions that actually happened.
