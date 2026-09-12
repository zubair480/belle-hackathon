# RecallRadius

Recall investigation workspace for food co-packers. Given a reviewer-confirmed suspect ingredient
lot and an explicit scope, RecallRadius follows recorded material relationships (input lot ->
material event -> output lot) through mixing, split batches and rework to candidate inventory holds
and outbound customer shipments. It shows the evidence behind every row, keeps missing records
visible as unresolved scope, and preserves each result as an immutable run so a late record produces
a new, comparable answer instead of silently rewriting the old one.

QA retains authority over holds, notices and recalls. A displayed candidate hold is not an applied
warehouse hold. Absence of a recorded path is not a safety clearance.

Built for the B.E.L.L.E / Qoder / Neo4j hackathon on 2026-09-12 by Zubair (foundation, API, AI,
integration), Codey (data, Neo4j graph, tracing engine) and Ali (UI, pitch).

**Status:** foundation plus Zubair's API/AI lane (branch `codex/zubair-api-integration`). The
routes run end-to-end against an explicit in-memory service double; the real Neo4j services and
the RecallWorkspace UI arrive from Codey's and Ali's branches at final merge. See
`docs/handoffs/` for what each lane actually delivered and which checks were executed.

## API lane (Zubair)

All routes from the contract are implemented as thin adapters over framework-agnostic handlers in
`src/server/application/handlers.ts`, which receive the domain services by injection.

| Route | Handler behaviour |
| --- | --- |
| `POST /api/imports/preview` | validates `ImportInput` (four controlled file names, bounded sizes) -> `previewImport` |
| `POST /api/imports/:id/accept` | validates id + `expectedBaseRevisionId`; in-flight duplicate guard -> `acceptImport` (201) |
| `POST /api/demo/late-evidence/preview` | prepared fixture correction -> `previewLateEvidence` |
| `POST /api/alerts/extract` | configured provider only; strict schema + span verification; returns an unconfirmed draft |
| `POST /api/incidents/:id/traces` | validates `TraceRequest`, sets `incidentId`, duplicate guard -> `runTrace` (201) |
| `GET /api/traces/:id` | `getTrace`, re-validated against the contract before it leaves the server |
| `GET /api/traces/:id/compare?other=` | `compareTraces`; rejects missing `other` and self-comparison |
| `GET /api/traces/:id/export` | CSV from the stored run: quoted cells, formula-neutralized, categories, "no hold applied" |
| `GET /api/health` | wiring report (mode, provider, whether Neo4j/AI credentials are set); no secrets |

Every failure uses the single `ApiResponse` error envelope with a frozen `ErrorCode` and its HTTP
status. Oversized bodies get `PAYLOAD_TOO_LARGE`, hung services get `TIMEOUT` after
`RECALL_SERVICE_TIMEOUT_MS`, and messages that look like credentials are replaced.

Service wiring is explicit (`src/server/application/wiring.ts`): `RECALL_SERVICES=graph` expects
Codey's `graphServices`; `RECALL_SERVICES=double` registers the in-memory double built from the
reference fixtures. A failing real service is never replaced by the double.

Runtime AI is one replaceable provider chosen by `RECALL_AI_PROVIDER`: `none` (manual entry only,
default), `stub` (labeled regex stub for UI development), or `anthropic` (Claude API through the
official SDK with structured output, requires `RECALL_AI_API_KEY`). The model sees the pasted alert
as untrusted data, has no tools, and its output is discarded unless it validates and every evidence
span matches the source text. Confirmation to a known lot is a separate human action.

Local run without Neo4j:

```bash
printf 'RECALL_WORKSPACE_ID=synthetic-co-packer\nRECALL_DEMO_ACTOR_ID=qa-reviewer-demo\nRECALL_SERVICES=double\nRECALL_AI_PROVIDER=stub\n' > .env.local
```

```bash
npm run dev
```

## Foundation (this commit)

| Piece | Location |
| --- | --- |
| Pinned manifest + lockfile | `package.json`, `package-lock.json` (npm, exact versions) |
| Frozen shared contract | `src/contracts/recall.ts` (Zod schemas, TS types, routes, error codes, limits, `DomainServices`) |
| App shell | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` |
| Research + judge docs | `docs/SHARED_CONTRACT.md`, `docs/TECHNICAL_BLUEPRINT.md`, `docs/JUDGE_SUBMISSION_KIT.md`, `docs/research/RESEARCH_REPORT.md` |
| Reference fixture (source of truth for quantities) | `docs/research/reference_case.py`, `docs/research/reference_output/*` |
| Lane prompts | `docs/prompts/*_PROMPT.md` |
| Contract smoke test | `tests/api/contract.test.ts` |
| Env variable names | `.env.example` |

Pinned versions: Next 16.3.5, React 19.3.0, TypeScript 5.9.3, Zod 4.6.2, neo4j-driver 6.2.0,
Vitest 4.1.11 (+ jsdom / Testing Library for UI tests). Deployment provider is deliberately
undecided.

## Setup

Requires Node 20.9+ (developed on Node 24) and npm.

```bash
npm ci
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Other commands:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | all Vitest suites under `tests/**` |
| `npm run test:api` / `test:data` / `test:ui` / `test:integration` | one lane's suite |
| `npm run build` | production build |
| `npm run reference:python` | re-run the Python reference case (writes `docs/research/reference_output/`) |

UI tests that need a DOM add `// @vitest-environment jsdom` at the top of the file.

## Team working agreement

Branches are cut from the foundation commit on `main` (SHA in `docs/handoffs/ZUBAIR.md` and the
team message). Feature branches are merged only at the end, by Zubair, in `codex/final-integration`.

| Owner | Branch | Owned paths |
| --- | --- | --- |
| Codey | `codex/codey-data-graph` | `src/server/data/**`, `src/server/graph/**`, `scripts/neo4j/**`, `fixtures/**`, `tests/data/**`, `docs/handoffs/CODEY.md` |
| Ali | `codex/ali-ui-pitch` | `src/components/recall/**`, `src/features/recall/**`, `tests/ui/**`, `docs/pitch/**`, `docs/handoffs/ALI.md` |
| Zubair | `codex/zubair-api-integration` | `src/app/**`, `src/contracts/**`, `src/server/ai/**`, `src/server/application/**`, `tests/api/**`, `tests/integration/**`, root config, README, `docs/handoffs/ZUBAIR.md` |

Integration points:

- Codey exports an object satisfying `DomainServices` (from `src/contracts/recall.ts`) as
  `graphServices` from `src/server/graph/index.ts`. Expected failures are thrown as `DomainError`
  with a frozen `ErrorCode`. `runTrace` persists before returning.
- Ali exports `RecallWorkspace` from `src/features/recall/index.ts` and talks to the API only through
  the `ROUTES` table and `ApiResponse` envelope. Mock mode is the visible, explicit
  `NEXT_PUBLIC_RECALL_UI_MOCKS=true` setting. Ali may mount `RecallWorkspace` in `src/app/page.tsx`
  on his branch for local development; Zubair takes that edit at merge.
- Zubair's routes call the services through an injected `DomainServices` instance. During lane
  development the routes run against a typed in-memory double selected only by the explicit
  `RECALL_SERVICES=double` setting. A failing real service is never replaced by the double.
- Requests for contract changes go through Zubair, who publishes the exact text to both teammates
  and records it in each handoff.

Reference quantities are identical in every lane and come from `docs/research/reference_output`.
Codey may copy the fixture files into `fixtures/` for the importer; do not change lots or amounts.

## Demo identity (not authentication)

The server derives `workspaceId` and `actorId` from `RECALL_WORKSPACE_ID` and
`RECALL_DEMO_ACTOR_ID`. Browsers cannot supply them. This is a documented synthetic demo context
for one local workspace; it is not production authentication, tenant isolation or authorization.

## Expected demo outcomes

From the executed Python reference (`docs/research/reference_output/verification.json`, 22 checks).
These are the acceptance targets for the real application; they are not application test results
until `docs/handoffs/` says the application produced them.

| Output | Revision 1 | Revision 2 |
| --- | --- | --- |
| Known-path onsite stock | 160 kg | 190 kg |
| Known-path outbound shipments | 120 kg | 180 kg |
| Distinct direct consignees | 3 | 4 |
| Finished lots with a path | F-A, F-B, F-C | F-A, F-B, F-C, F-E |
| Unresolved-only finished stock | F-E: 40 kg onsite, 60 kg shipped | none |
| Already disposed | 10 kg | 10 kg |
| F-D (shares pallet P9 with F-C only) | no recorded material path | no recorded material path |

Revision 2 consumes the 10 kg WIP101 and adds 40 kg F-E, so onsite rises by 30 kg, not 40. The
revision 1 run is preserved unchanged.

## Scope limits

Kilograms only, one site, one synthetic workspace, controlled CSV formats. No cross-contact
assessment, OCR, ERP connectors, autonomous notices or EPCIS conformance. Runtime AI is one
optional supplier-alert extraction proposal that a reviewer must confirm; it never accepts graph
relationships, issues recalls, changes holds or runs Cypher.
