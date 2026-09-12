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
