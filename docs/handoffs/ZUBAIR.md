# Zubair handoff (foundation + API/AI/integration lane)

## Foundation commit

- Base branch: `main`
- Foundation commit SHA: _(filled in after push; see team message)_
- Branch from it: Codey -> `codex/codey-data-graph`, Ali -> `codex/ali-ui-pitch`,
  Zubair -> `codex/zubair-api-integration`. Final merge: `codex/final-integration`.

## What the foundation contains

See README "Foundation". Checks executed on the foundation commit:

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | passed |
| Contract smoke tests (12) | `npm test` | passed |
| Production build | `npm run build` | _(see below)_ |

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

_(to be filled as the lane progresses: changed files, routes, tests, AI provider status)_

## Remaining limits

_(to be filled)_
