# Zubair handoff (contracts, APIs, optional AI, integration)

Contract version: `assembly-quality-v4`. Branch: `codex/zubair-api-integration`.

## Base commits for the team

| What | SHA |
| --- | --- |
| Scaffold foundation (Next/TS, pinned deps, app shell) | `dfdaae591bb4118a2d9126a884e897102dcd6847` on `main` |
| **v4 source contract published** (branch from here) | `71e47734c84ae2857b64580a37654e100e46ebdd` on `main` |
| Superseded food/lot lane (history only) | tag `legacy/food-lot-lane` = `1f92bb8` |

Codey branches to `codex/codey-data-graph`, Ali to `codex/ali-ui-pitch`, both from `71e4773`
(or later `main`). Feature branches merge only at the end in `codex/final-integration`.

## Frozen contract (src/contracts)

- `common.ts`: `ApiResponse`, `ERROR_CODES` + HTTP status (new: `STALE_VERSION`,
  `INVALID_TRANSITION`, `VERIFICATION_REQUIRED`, `INVALID_REFERENCE`), `DomainError`, `LIMITS`,
  `RequestContext`, pagination (`cursor`/`limit`), `IdempotencyKeySchema` + `Idempotency-Key`
  header, `Evidence` with provenance (`sourceKind`, `sourceRecordId`, `sourceUrl`, `retrievedAt`),
  `ProductionOrigin` (`supplier | in_house | unknown`), `VehicleIdentity` (build id, nullable VIN),
  `EntityRecord`, `Installation` intervals, `EntityContext`.
- `issues.ts`: statuses and `TRANSITIONS`, cause types incl. `in_house_manufacturing`,
  `CreateIssueCommand` (idempotencyKey + inline manual evidence), `IssueUpdate` (expectedVersion,
  no status), comments, cause assessments (hypothesis/confirmed/rejected, supersedes, isCurrent),
  fix revisions (`sourceFixRevisionId`, `workInstructionRef`), verifications, `TransitionCommand`
  (`close` needs `fixRevisionId`), audit events, `IssueDetail`, list filters/pages,
  `SimilarResolutions` (match reasons, applicability warnings, verification id), `Insights`
  (team roles separated, supplier linked vs confirmed, nullable rates, drilldown ids), catalogs
  with manual upsert, AI draft/explanation DTOs, bounded `AGENT_TOOLS`, `ISSUE_ROUTES`,
  `IssueServices`, `EV_DEMO` ids, `QUALITY_REGRESSION_EXPECTATIONS`.
- `recall.ts`: v4 `Scope` (configurationAsOf/historyFrom/trackedPartNumber), `RootSelector`
  (`supplier_batch | manufacturing_lot | component_serial`), `TraceRow`/`TraceCounts` (vehicle
  counts), paths incl. `LOT_PRODUCED_COMPONENT`, five controlled import files, comparison with
  signed deltas, component alert draft, `ROUTES`, export columns, `TraceServices`,
  `DomainServices = IssueServices & TraceServices`, `EV_TRACE_DEMO`, `ASSEMBLY_REGRESSION` (robot
  ids mapped to vehicle counts; regression only).

Additive change after the v4 publish: `ISSUE_ROUTES.issuesExport` (`GET /api/issues/export`).

## Routes implemented (thin adapters over injected handlers)

| Route | Notes |
| --- | --- |
| `GET /api/catalog`, `POST /api/catalog/:kind` | seeded reference catalog; manual directory entry (201) |
| `GET /api/entities/:id?configurationAsOf=` | origin (supplier / in-house / unknown), current parents, vehicles, installation history |
| `POST /api/issues` | create; idempotency via body key or `Idempotency-Key` header; replay -> 200, conflicting replay -> `DUPLICATE_ACTION` |
| `GET /api/issues` | filters: status[], severity[], teamId+teamRole, supplierId, defectCode, partNumber, stationId, processStepId, entityId, detectedFrom/ToExclusive, text, cursor, limit |
| `GET /api/issues/export` | CSV of the filtered list with attribution columns |
| `GET /api/issues/:id`, `PATCH /api/issues/:id` | detail (re-validated against the contract); PATCH needs `expectedVersion` -> `STALE_VERSION` |
| `POST /api/issues/:id/comments|causes|fixes|verifications` | idempotent commands (201) |
| `POST /api/issues/:id/transitions` | `triage`, `start_work`, `request_verification`, `close` (needs passed verification for the fix), `reopen` |
| `GET /api/issues/:id/similar-resolutions` | deterministic, explainable retrieval (verified fixes only) |
| `GET /api/insights` | team/supplier/station/process/cause/defect buckets with drilldown ids; rates null without a complete cohort |
| `POST /api/agent/draft-issue` | optional AI: free text -> editable draft with verified spans |
| `POST /api/agent/issues/:id/explain-resolutions` | optional AI: explains already-retrieved fixes; citations limited to retrieved ids |
| `POST /api/agent/tools` | bounded read-only tools: `find_similar_resolutions`, `get_entity_context`, `get_issue_insights` |
| `POST /api/alerts/extract` | optional AI: supplier alert -> unconfirmed batch draft |
| imports/traces/compare/export | v4 assembly trace routes (P1) |
| `GET /api/health` | wiring report, no secrets |

Service wiring is explicit (`src/server/application/wiring.ts`): `RECALL_SERVICES=graph` expects
Codey's `graphServices` (mounted at final merge); `RECALL_SERVICES=double` registers the typed
double. A failing real service is never replaced by the double.

## Files changed on this branch

`src/contracts/*` (v4), `src/server/application/{context,http,registry,wiring,index,handlers,
export,double,double-issues,double-trace}.ts`, `src/server/ai/{provider,anthropic,stub,features,
config}.ts`, 25 route files under `src/app/api/**`, `tests/api/{contract,issues,trace,ai,export}.test.ts`,
`tests/integration/neo4j.integration.test.ts`, `package.json`/lockfile (+`@anthropic-ai/sdk@0.125.0`),
`.env.example`, `README.md`, this file.

## Commands executed and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed |
| `npx vitest run` | 53 passed, 4 skipped (Neo4j suites: no credentials) |
| `npm run build` | see README status line for the final result of this branch |
| Live dev server (double + stub) | see README "Verified locally" |

Unrun / unverified:

- Real Neo4j persistence and the EV acceptance loop against `graphServices` (no credentials on
  this machine, and Codey's module is not on this branch). The integration suite skips and prints
  "database integration UNVERIFIED".
- Live Claude call (no funded `RECALL_AI_API_KEY`); the provider is constructed and error-mapped
  only.
- UI tests (Ali) and data tests (Codey).

## Notes for Codey

- Implement `DomainServices` (issue + trace) and export `graphServices` from
  `src/server/graph/index.ts`. Throw `DomainError` with the frozen codes. `runTrace` persists
  before returning. Never call a model inside a transaction.
- `createIssue` returns `{ issue, replayed }`; same key + same payload replays, different payload
  is `DUPLICATE_ACTION`. `updateIssue`/`transitionIssue` check `expectedVersion` ->
  `STALE_VERSION`. `close` requires the latest verification for `fixRevisionId` to be `pass`,
  else `VERIFICATION_REQUIRED`; a `fail` while `pending_verification` returns the issue to
  `in_progress`. `reopen` -> `in_progress`, keep all audit events.
- `findSimilarResolutions`: verified fixes only, ranked; shared supplier/team is never a reason.
  Fill `applicabilityWarnings` on revision mismatch or unknown revision.
- `getInsights`: rates are null unless the supplier cohort is complete; confirmed numerators use
  the current confirmed primary cause only.
- EV fixture ids must match `EV_DEMO` (`src/contracts/issues.ts`) and `EV_TRACE_DEMO`. Keep the
  robot regression fixture separate and labelled.
- Routes re-validate `IssueDetail` and `TraceResult` with the contract schemas before returning.

## Notes for Ali

- Use `ISSUE_ROUTES`/`ROUTES` and the `ApiResponse` envelope. Creates return 201 (200 on replay).
- Show `EntityRecord.origin.sourcingType` as "Bought from supplier" / "Made in-house" /
  "Unknown origin" (`UI_LABELS`). Show `reportingTeamId`, `assignedTeamId` and the current
  confirmed cause's `responsibleTeamId`/`responsibleSupplierId` as three separate facts.
- `Insights.suppliers[].affectedUnitRate === null` -> render "N/A" with `cohortComplete`.
- `AlertExtractResult`/`IssueDraftResult.provider.mode` is `"stub"` or `"live"`; label it.
- `GET /api/health` tells the UI whether real services and a provider are wired.

## Remaining limits

- The double answers from seeded synthetic data; it validates shapes and flow, not persistence.
- Idempotency and in-flight guards are per server process.
- No authentication or tenant isolation beyond the server-configured demo context.
- Public NHTSA evidence caching is Codey's lane; the contract carries provenance fields only.

## Integration branch state (updated later on 2026-09-12)

- `codex/final-integration` created from `main` (`defabb7`) with the API lane merged; pushed.
  No conflicts. Teammate branches `codex/codey-data-graph` and `codex/ali-ui-pitch` do not exist
  on the remote yet, so `graphServices` is not wired and `RecallWorkspace` is not mounted.
- `tests/integration/acceptance-runner.mts` (`npm run acceptance -- --base <url>`) drives the
  required acceptance evidence over HTTP against a running server. It exits with code 2 unless the
  server reports real graph services, or `--allow-double` is passed for a labelled dry run.
  Re-running with `--issue <id>` after a server restart proves persistence. `--revision <id>`
  selects the accepted EV fixture revision for the two trace steps.
- Dry run against the double + stub on the dev server: 18/20 passed. The two failures are the
  supplier-lot and manufacturing-lot trace steps, which need Codey's EV fixture revision. This
  dry run is development evidence only, not integration evidence.
- Blocker for real Neo4j checks on this machine: no `NEO4J_*` credentials; Docker Desktop was
  started but its engine did not come up within the session; no local Neo4j install found.
  Options: provide Aura credentials in `.env.local`, or start Docker Desktop manually and run
  `docker run -d --name recallradius-neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/<password> neo4j:5`.
- `docs/SUBMISSION_DRAFT.md` holds the prepared form text and a claims checklist; each claim is
  marked unverified or double-only until the real run happens.

Final merge steps once SHAs arrive: merge both branches into `codex/final-integration`; in
`src/server/application/wiring.ts` add `import { graphServices } from "@/server/graph"` and
register it for mode `graph`; in `src/app/page.tsx` render `RecallWorkspace`; replace the dynamic
import in `tests/integration/neo4j.integration.test.ts` with a static one; set
`RECALL_SERVICES=graph`, `NEXT_PUBLIC_RECALL_UI_MOCKS=false`, `RECALL_AI_PROVIDER=none` (or a
real key); run `npm run typecheck`, `npm run build`, `npm test`, `npm run test:integration`, then
`npm run acceptance -- --base http://localhost:3000` twice with a server restart in between.

## Acceptance runner strengthened (integration branch, later on 2026-09-12)

- `tests/integration/acceptance-runner.mts` now: reads fixture-defined expectations from
  `tests/integration/acceptance-expectations.json` (expected current vehicle ids, counts and
  component ids per trace root; an empty vehicle list fails when the fixture expects vehicles);
  asserts a vehicle with two affected components per lot (DEMO-EV-003, front and rear modules)
  appears once in rows and once in counts; snapshots the source fix before reuse and deep-compares
  it after; validates every mutation response (envelope, HTTP status, required keys) and stores
  status/code/message/details for failures in the JSON report; treats retrieval after a documented
  server restart as a separate persistence check (`--persist-from <report>`) that compares the
  saved issue's status, version, fix states, verification outcomes, cause states and audit kinds
  to the pre-restart snapshot; is HTTP-only, with the browser workflow kept in
  `tests/integration/BROWSER_ACCEPTANCE.md`.
- Both doubles now share `src/server/application/ev-seed.ts` (synthetic EV entities,
  installations, shipments), and the trace double answers the EV roots on a pre-accepted
  revision `ev-r1`. This is double data, not Codey's fixture; Codey's Neo4j fixture must satisfy
  the same expectations file.
- Dry run on the double (dev server, stub AI): 22/22 passed. Second run after a server restart
  with `--persist-from`: the persistence step FAILED with 404 NOT_FOUND as expected for an
  in-memory double, and the failure details were preserved in the report. This demonstrates the
  check; it is development evidence only, not integration evidence.
- Docker Desktop launched its processes but the engine still did not answer; no Neo4j
  credentials; real database checks remain blocked on this machine.

## Integration progress with Ali's lane (2026-09-12, later)

- `origin/codex/ali-ui-pitch` appeared at `fe5900a` (handoff `docs/handoffs/ALI.md`). Merged into
  `codex/final-integration` with no conflicts. Ali's shared-config edits were taken as-is:
  `vitest.config.mts` include for `frontend/tests/**`, `package.json` `test:ui`, the
  `src/features/recall/index.ts` re-export shim, and the `src/app/page.tsx` mount of
  `RecallWorkspace`. `src/app/layout.tsx` metadata was updated to the EV description.
- Answers to Ali's API assumptions: (1) `request_verification` with `fixRevisionId` now marks the
  fix `applied`, sets `appliedAt`, `currentFixRevisionId` and logs `fix_applied` (implemented in
  the double; Codey must implement the same rule); recording a verification against a `proposed`
  fix also moves it to `applied`. (2) Repeated query keys and comma lists are both accepted.
  (3) Header and body idempotency keys are both accepted. (4) The API never returns unverified
  suggestions from the double; if Codey returns any, use the literal `NONE` as Ali does.
  (5) `teamRole` without `teamId` is ignored by the filter. (6/7) Sketch-only ids (BATT-0005,
  CELL-0005, ...) return NOT_FOUND from the double; the UI shows "not in backend". (8) No shipment
  DTO in `EntityContext` yet. (9) Drilldown fetches details per id; fine for the demo.
- Vehicles have `origin: null` in the double and render as "Unknown origin" in Ali's affected-items
  table. Codey may give vehicles an in-house final-assembly origin; otherwise Ali should label
  vehicles as "assembled here" rather than unknown.
- Merged-branch checks: `npm run typecheck` passed; `npx vitest run` 69 passed / 4 skipped
  (contract 16, API 37, Ali UI 16; Neo4j suites skipped); HTTP acceptance runner on the
  integrated dev server (double, mocks disabled in the UI): 22/22 (development evidence only).
- Browser check on the integrated build with `NEXT_PUBLIC_RECALL_UI_MOCKS=false` against the real
  routes (service double behind them): "Live API (mocks disabled)" badge, vehicles explorer,
  issues board, prior issue detail with reporter / assigned / confirmed-cause labels and "no
  confirmed supplier fault", and the insights view with N/A rate all rendered from the API.
  Console shows 404s only for sketch-only entity ids. Full browser checklist
  (`tests/integration/BROWSER_ACCEPTANCE.md`) still to be run against the real database.
- Still missing: `codex/codey-data-graph` (no branch under any name on origin). Real Neo4j
  remains blocked locally (no credentials; Docker Desktop engine never answered and its
  processes exit).

## Integration prep while Neo4j provisions (2026-09-12, later)

- Merged main's `73e989c` (next-step prompts) into `codex/final-integration`.
- Labelled dry run: `npm run acceptance -- --base http://localhost:3111 --allow-double --out docs/evidence/acceptance-double.json`
  -> 22/22 on the double (development evidence). The dev server in this environment listens on 3111.
- Added `docs/INTEGRATION_REQUIREMENTS_CODEY.md` (exports, DomainError codes, lifecycle rules,
  EV fixture expectations, handoff contents, merge sequence), `tests/integration/neo4j-check.mts`
  (`npm run neo4j:check`), `tests/integration/graph-services-shape.test.ts` (skips until
  `src/server/graph` exists) and `tests/api/lifecycle.test.ts` (request_verification applies the
  fix, fix_applied audit, fail keeps work open, pass then close, source fix untouched).
- Checks: typecheck passed; vitest 70 passed / 5 skipped; `neo4j:check` exit 2 (placeholders).
- Cloud connection: put the returned URI, username, password and database into `.env.local`
  under the existing `NEO4J_*` names; never commit or print them. Provisioning alone proves
  nothing until `neo4j:check` passes and Codey's seed and services exist.
- Qoder: my lane was built with Claude Code, not Qoder. I have no Qoder evidence to contribute.

## Ali's second push merged (906a230)

- Merged `origin/codex/ali-ui-pitch` @ `906a230` into `codex/final-integration` (no conflicts):
  3D wireframe sketch replaces the 2D one, an in-app agent harness (`frontend/agent/**`), a new
  additive route `src/app/api/agent/chat/route.ts` (my path; taken as a thin delegate like the
  page mount), synthetic EV-platform wiring data with a namespaced Cypher import under
  `frontend/data/ev-platform/` (Ali's own design data, separate from Codey's EV seed).
- Review of the agent route: tools are read-only against the app's own frozen routes
  (`getEntityContext`, `listIssues`, `getIssue`, `findSimilarResolutions`, `runTrace` which only
  creates a stored read result); no issue writes, no cause confirmation, no closure, no Cypher, no
  database credentials. Provider is explicit (`RECALL_AGENT_PROVIDER=stub|qoder`); the Qoder
  planner needs `QODER_PERSONAL_ACCESS_TOKEN` server-side and answers AI_UNAVAILABLE otherwise.
  Added these env names to `.env.example`.
- Note for Ali: the `impact_of_part` tool sends `revisionId: "ui-current"`; the double's accepted
  EV revision is `ev-r1` and Codey's will be whatever his handoff says. Read it from
  `tests/integration/acceptance-expectations.json` or a health/catalog field rather than a literal.
- Checks on the merged branch: typecheck passed; vitest 80 passed / 5 skipped.

## Neo4j completion (2026-09-12, branch codex/neo4j-completion)

Codey's graph branch never appeared on origin, so the graph services were implemented by Zubair
under the published contract. Aura free instance created by Zubair on 2026-09-12 (instance id
c5905f5f, database `neo4j`); credentials live only in `.env.local` and the downloaded Aura file.

### Implemented (src/server/graph)
- `driver.ts`: driver singleton from NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE.
- `schema.ts`: per-workspace uniqueness constraints (ws, id) for every label plus (ws, key) for idempotency.
- `index.ts`: `graphServices` implementing all 20 DomainServices methods. Graph model: catalog
  nodes; Entity -HAS_ORIGIN-> Origin -FROM_SUPPLIER_LOT-> SupplierLot -SUPPLIED_BY-> Supplier and
  Origin -PRODUCED_IN-> MfgLot -MADE_BY-> Team; Entity -INSTALLED_IN{installedAt, removedAt}-> Entity;
  Entity -SHIPPED_TO-> Customer; Issue with REPORTED_BY / ASSIGNED_TO / DETECTED_AT / AT_STEP / AFFECTS /
  LINKS_SUPPLIER / HAS_DEFECT / HAS_EVIDENCE; Cause -ASSESSES-> Issue with RESPONSIBLE_TEAM /
  RESPONSIBLE_SUPPLIER / CAUSAL_STATION / CAUSAL_STEP / SUPERSEDES; Fix -FIXES-> Issue and
  Fix -DERIVED_FROM-> Fix; Verification -VERIFIES-> Fix; Audit -AUDITS-> Issue; Idem nodes; Revision;
  Preview; immutable TraceRun (stored result JSON). Idempotency keys and expectedVersion are checked
  inside the same write transaction as the mutation. Similar-resolution retrieval is a graph query
  (Issue<-FIXES-Fix{verified}<-VERIFIES-Verification{pass} joined with the current confirmed Cause)
  scored deterministically. Traces walk lot -> Origin -> Entity -INSTALLED_IN*1..6-> vehicle with
  per-hop interval filters for current (active at configurationAsOf) and historical (overlapping the
  history window) containment; a vehicle reached twice is counted once. Imports in graph mode only
  record a revision marker (CSV row ingestion is not implemented); late evidence is PREVIEW_REJECTED.
- `scripts/neo4j/seed-ev.mts` (`npm run neo4j:seed`): idempotent MERGE seed of catalog, lots,
  entities/origins, installations, shipments, evidence, revision ev-r1, the prior verified bracket
  issue/fix/verification and the supplier-caused issue. Runs through scripts/neo4j/alias-loader.mjs.
- `wiring.ts`: RECALL_SERVICES=graph registers graphServices; the double only when explicitly set.
- Contract addition: CURRENT_REVISION_ALIAS = "current" resolves to the latest accepted revision.
  Ali's impact_of_part tool now sends that alias and uses ProductionOrigin.productionLotId as the
  root (the display label keeps the operator-facing batch/lot code).
- Ali's frontend/data/ev-platform Neo4j import was NOT loaded: it is design-level platform data
  (slots, wires, circuits) the UI reads from JSON; loading it is unnecessary for the demo and would
  mix design slots with the manufacturing seed.

### Setup and run (no secrets)
1. cp .env.example .env.local and fill NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE;
   set RECALL_SERVICES=graph, NEXT_PUBLIC_RECALL_UI_MOCKS=false, RECALL_AI_PROVIDER=none, RECALL_AGENT_PROVIDER=stub.
2. npm run neo4j:check
3. npm run neo4j:seed
4. npm run dev

### Actual results (this machine, 2026-09-12)
| Check | Result |
| --- | --- |
| npm run neo4j:check | connected to Neo4j/5.27-aura, trivial read ok |
| npm run neo4j:seed twice | second run left seed counts unchanged (Entity 21, Origin 17, Evidence 24, Team 5, Revision 1) |
| npm run typecheck | passed |
| npx vitest run (unit + API + UI) | 81 passed, 4 skipped (integration suites need env) |
| node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/integration | 5 passed, 1 skipped (legacy robotics regression: fixtures/regression/*.csv absent, importer never delivered; NOT RUN) |
| npm run acceptance -- --base http://localhost:3111 --out docs/evidence/acceptance-graph-before.json (no --allow-double) | 22/22, mode REAL graph services |
| dev server stopped and restarted, then --persist-from before.json --out after.json | 23/23; ISS-MTYXQKFKF1DFA6 returned with identical status, version, fix states, verification outcomes, cause states and audit kinds |
| Browser, UI mocks disabled, graph mode | issues board lists persisted issues; saved issue detail after restart shows supplier vs in-house origins, reporter / assigned / confirmed-cause labels, "no confirmed supplier fault", evidence; Resolution tab lists graph-retrieved verified fixes with reasons |

Runner note: the "prior verified fix retrieved" step now finds the seeded fix in the result list
instead of requiring it to rank first, because a durable store legitimately accumulates newer
verified fixes with equal or higher scores. Reasons are still checked and supplier overlap is
rejected as a reason for every result.

### Remaining limits
- Graph-mode imports do not ingest CSV rows; the seed script is the ingestion path.
- Late-evidence preview and the legacy robotics regression are unavailable in graph mode.
- No inspection cohort is seeded, so supplier rates are N/A by design.
- Runtime AI and the Qoder agent planner were not exercised; no Qoder development evidence exists
  for Zubair's lane (built with Claude Code).
- Ali's full browser checklist (BROWSER_ACCEPTANCE.md) with screenshots against this graph-backed
  build is still to be recorded.

### Browser run in graph mode (2026-09-12, later)
`docs/evidence/BROWSER_ACCEPTANCE_RUN_2026-09-12.md`: through Ali's UI against Neo4j, with mocks
disabled, a manual issue was created, reloaded, assigned, given a confirmed in-house cause, a
prior verified fix was reused as a new proposal, applied, failed then passed verification, closed
and reopened with full history; insights showed role-separated counts and an N/A supplier rate.
Not run in the browser: sketch marking, second-tab stale edit, later-issue retrieval, lot traces,
AI-off and database-down states (the HTTP runner covers retrieval, stale writes and traces).
A front-end integration agent is working on codex/frontend-backend-integration (worktree) on
backend-mode badges, sketch-only entity states and vehicle labelling; merge pending its report.

### Late lanes merged (2026-09-12, ~15:30)
- Ali `codex/ali-ui-pitch` @ f202d63 merged: adds `@qoder-ai/qoder-agent-sdk` 1.0.39 to the manifest
  (Ali's agent planner; a server-side PAT is still required to use it) and `agentRules: false` in
  next.config.ts. Lockfile regenerated.
- Codey `claude/cody-data-graph` @ 2fcdf6c merged, namespaced under `src/server/graph/cody/`
  (driver, schema, imports, traces, index) with import paths rewritten; `fixtures/ev`,
  `src/server/data`, `scripts/neo4j/*.ts`, `tests/data` and `docs/handoffs/CODEY.md` included as
  delivered. His slice implements TraceServices only (CSV ingestion, late evidence, robotics
  regression adapter, NHTSA cache) on a different graph model (EntityState / DataRevision /
  SupplierBatch / ManufacturingLot / Installation / Shipment nodes) and a different Aura instance
  (7bd3cbcf), and its fixture's expected counts differ from `tests/integration/acceptance-expectations.json`.
  The active `graphServices` therefore remain Zubair's implementation; Codey's modules are
  preserved and importable (`@/server/graph/cody/*`) but not wired. His unit tests run in the suite
  (11 passed, 4 Neo4j tests skip without credentials). Wiring his ingestion as the trace path is a
  post-hackathon task.
- Checks at 70f1298: typecheck passed; vitest 104 passed / 8 skipped (one agent UI test is timing
  sensitive under full-suite load and passes in isolation).

### Switched to the shared Aura instance 7bd3cbcf (2026-09-12, ~15:45)
Zubair supplied the credentials for the team instance provisioned by Codey (database and user are
named after the instance id). .env.local now points there; nothing committed. Results on
codex/final-integration @ 8dda91b: npm run neo4j:check connected (Neo4j/5.27-aura); npm run neo4j:seed
loaded the EV model idempotently alongside Codey's 77 existing nodes (different labels, same
workspace); real integration suites 5 passed / 1 skipped (per-test timeout raised to 120 s for the
long loop; the shared instance is slower than the first one); HTTP acceptance 22/22 before restart
(docs/evidence/acceptance-graph-7bd3cbcf-before.json) and 23/23 after a documented restart
(acceptance-graph-7bd3cbcf-after.json). The earlier instance c5905f5f is no longer used by the app.
