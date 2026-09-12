# Zubair handoff (foundation + API/AI/integration lane)

## Foundation commit

- Base branch: `main`
- Foundation commit SHA: `dfdaae591bb4118a2d9126a884e897102dcd6847`
  (`19b0f74` scaffold + contract + research pack; `dfdaae5` adds `.gitattributes` LF normalization)
- Branch from it: Codey -> `codex/codey-data-graph`, Ali -> `codex/ali-ui-pitch`,
  Zubair -> `codex/zubair-api-integration`. Final merge: `codex/final-integration`.

Checks executed on the foundation commit: `npm run typecheck` passed, `npm test` passed (12
contract checks), `npm run build` passed.

## Frozen contract notes (2026-09-12.1)

Additions relative to the prose in docs/SHARED_CONTRACT.md, made at freeze time (contract owner):

- `TraceRequest.incidentId?` and `TraceResult.incidentId?`: optional label set by the route from
  `/api/incidents/:id/traces`. Services may persist it; nothing else depends on it.
- `IMPORT_FILE_NAMES`: the four controlled file names are `lots.csv`, `events.csv`,
  `shipments.csv`, `movements.csv`. `ImportFile.name` must be one of them. Codey defines the
  column headers inside each file and documents them in CODEY.md.
- `ERROR_CODES` / `ERROR_HTTP_STATUS` and the `DomainError` class: the frozen error vocabulary.
  Services throw `DomainError(code, message, details?)`; routes translate to `ApiResponse`.
- `ISSUE_CODES`: frozen review-issue codes (Codey emits, Ali groups by them).
- `ROW_CATEGORIES` / `UI_LABELS` / `EXPORT_COLUMNS`: shared display vocabulary and CSV columns.
- `DEMO` and `REFERENCE_EXPECTATIONS`: identical demo constants and expected outcomes.
- Route `GET /api/health` (non-contract convenience, reports wiring, no secrets).

## Lane work (codex/zubair-api-integration)

### Changed / added files

| Path | Purpose |
| --- | --- |
| `src/contracts/recall.ts` | unchanged since foundation (frozen) |
| `src/server/application/context.ts` | server-derived demo `RequestContext` from env (documented, not auth) |
| `src/server/application/http.ts` | JSON body limits, Zod validation -> `VALIDATION_FAILED`, timeout, credential-free error translation, in-flight duplicate guard |
| `src/server/application/registry.ts` | explicit `DomainServices` registration by mode; no fallback |
| `src/server/application/wiring.ts` | registers the double only for `RECALL_SERVICES=double`; graph import slot for final merge |
| `src/server/application/double.ts` | typed in-memory `DomainServices` double from the reference fixtures (labeled, dev/test only) |
| `src/server/application/handlers.ts` | framework-agnostic handlers for all routes, dependency-injected |
| `src/server/application/export.ts` | CSV writer: RFC 4180 quoting, formula neutralization, categories, hold status |
| `src/server/application/index.ts` | env-wired handler singleton |
| `src/server/ai/provider.ts` | provider interface, model-facing schema, untrusted-data system prompt |
| `src/server/ai/anthropic.ts` | Claude API provider via `@anthropic-ai/sdk` `messages.parse` + `zodOutputFormat` |
| `src/server/ai/stub.ts` | labeled development stub (regex heuristics, verifiable spans) |
| `src/server/ai/extract.ts` | provider resolution (explicit), schema validation, span verification, draft assembly |
| `src/app/api/**/route.ts` | nine one-line route adapters |
| `tests/api/routes.test.ts` | 23 route tests against the double |
| `tests/api/export.test.ts` | 5 CSV tests |
| `tests/api/ai.test.ts` | 17 AI schema/evidence/config/route tests |
| `tests/integration/neo4j.integration.test.ts` | real-database suites, skipped without credentials; acceptance loop for the merged graph services |
| `package.json` / `package-lock.json` | added `@anthropic-ai/sdk@0.125.0` (server-only) |
| `.env.example` | added `RECALL_SERVICE_TIMEOUT_MS` |
| `README.md` | API lane section and local run instructions |

### Commands executed and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed |
| `npx vitest run` | 58 passed, 2 skipped (Neo4j suites; no credentials) |
| `npm run build` | passed; 9 dynamic API routes + `/` |
| Dev server on port 3111 with `RECALL_SERVICES=double`, `RECALL_AI_PROVIDER=stub`; full loop via fetch | health ok; preview canAccept; rev-1 run: 160/120/3, unresolvedOnly 40/60, disposed 10; late preview + accept; rev-2 run: 190/180/4, unresolvedOnly 0/0, disposed 10; compare delta +30/+60/+1, added F-E and R-UNK, added C-DeltaFoods, 2 issues resolved; run-1 byte-identical after rev-2; CSV 200 with correct header; validation error envelope 400; stub extraction returned T17 with 3 verified spans |

Unrun / unverified:

- Real Neo4j connectivity and the end-to-end acceptance against `graphServices` (no credentials
  on this machine; suites skip and print "database integration UNVERIFIED").
- Live Anthropic extraction (no funded `RECALL_AI_API_KEY` configured). The provider is
  constructed and unit-tested for error mapping only; no real model call was made.
- UI tests (Ali's lane) and data tests (Codey's lane).

### Required configuration

See `.env.example`. Minimum for the demo without a database: `RECALL_WORKSPACE_ID`,
`RECALL_DEMO_ACTOR_ID`, `RECALL_SERVICES=double`. For the real demo: `NEO4J_*`,
`RECALL_SERVICES=graph`. Optional AI: `RECALL_AI_PROVIDER=anthropic` + `RECALL_AI_API_KEY`
(+ `RECALL_AI_MODEL`, default `claude-opus-5`).

### Notes for teammates

- Codey: throw `DomainError` with a frozen code for expected failures (`NOT_FOUND`,
  `PREVIEW_REJECTED`, `REVISION_MISMATCH`, `DUPLICATE_ACTION`, `AMBIGUOUS_ROOT`, `SCOPE_INVALID`,
  `TIMEOUT`, `BACKEND_UNAVAILABLE`). Routes re-validate `TraceResult` with `TraceResultSchema`
  before returning it, so keep IDs to `[A-Za-z0-9._:-]`, hashes to 64-hex for `Evidence.sourceHash`,
  and all kg values finite and non-negative. Export `graphServices` from `src/server/graph/index.ts`.
- Ali: `GET /api/health` tells the UI whether real services are wired. Accept returns HTTP 201;
  trace creation returns 201. Compare needs `?other=<laterRunId>`. Export is a `text/csv`
  attachment; open it in a new tab or use `fetch` + blob. `AlertExtractResult.provider.mode` is
  `"stub"` or `"live"`; show it. The double's ids are `preview-N`, `rev-N`, `run-N`.

## Remaining limits

- The double answers from the reference JSON; it validates shapes and flow, not graph traversal.
- Duplicate-action detection is per server process (in-flight guard) plus service-level
  consumed-preview/identical-hash checks; there is no persistent idempotency key store.
- No authentication or tenant isolation beyond the server-configured demo context.
- Refusal fallbacks and prompt caching were not added to the single extraction call.
