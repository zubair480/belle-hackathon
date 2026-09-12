# RecallRadius

An internal issue and learning workspace for **EV vehicle assembly with purchased and in-house manufactured components**. Report a problem, mark the affected part or process, assign investigation, retrieve a relevant verified fix, verify the new application, and preserve the knowledge for the next issue.

Neo4j connects issues, serialized assemblies, teams, suppliers, cause assessments, fix versions and evidence. Team and supplier insights distinguish reporting, ownership and confirmed cause, with drilldown to the records behind each metric.

**Status: foundation plus the published `assembly-quality-v4` source contract.** The frozen schemas live in `src/contracts/common.ts` (envelope, errors, evidence, provenance, entities), `src/contracts/issues.ts` (issue workflow, catalogs, insights, agent tools, `IssueServices`) and `src/contracts/recall.ts` (assembly trace, imports, `TraceServices`, `DomainServices`). Codey and Ali bind to these; the application implementation lands in the lane branches and is merged at the end. Start with [project context](docs/PROJECT_CONTEXT.md).

## Integration status

`codex/neo4j-completion` (merged into `codex/final-integration`) adds real Neo4j graph services (`src/server/graph`), an idempotent EV seed (`npm run neo4j:seed`) and the real-mode acceptance evidence: 22/22 before and 23/23 after a server restart against Neo4j Aura (`docs/evidence/acceptance-graph-*.json`). Setup: fill `NEO4J_*` in `.env.local`, `npm run neo4j:check`, `npm run neo4j:seed`, `npm run dev` with `RECALL_SERVICES=graph`. `npm run acceptance -- --base <url>` (HTTP) plus `tests/integration/BROWSER_ACCEPTANCE.md` (browser) will produce that evidence; fixture expectations live in `tests/integration/acceptance-expectations.json`. The latest dry run on the service double passed 22/22 and its post-restart persistence check failed as expected for an in-memory double. That is development evidence only; nothing below claims Neo4j persistence.

## Run modes and what each one proves

| Mode | Settings | What it proves |
| --- | --- | --- |
| UI mock | `NEXT_PUBLIC_RECALL_UI_MOCKS=true` | Ali's screens against the labelled mock; no API, no database |
| API with double | `RECALL_SERVICES=double`, `NEXT_PUBLIC_RECALL_UI_MOCKS=false` | real HTTP routes, contract shapes and workflow rules against an in-memory double; nothing persists across a server restart |
| Real graph | `RECALL_SERVICES=graph`, `NEXT_PUBLIC_RECALL_UI_MOCKS=false`, `NEO4J_*` set, Codey's `graphServices` wired | Neo4j persistence, graph retrieval and analytics; the only mode that counts as integration evidence |

Commands:

```bash
npm run neo4j:check
```

```bash
npm run acceptance -- --base http://localhost:3000 --out docs/evidence/acceptance-graph-before.json
```

```bash
npm run acceptance -- --base http://localhost:3000 --persist-from docs/evidence/acceptance-graph-before.json --out docs/evidence/acceptance-graph-after.json
```

The runner exits with code 2 unless the server reports real graph services; add `--allow-double` only for a labelled development dry run. Browser acceptance is a separate checklist in `tests/integration/BROWSER_ACCEPTANCE.md`. Codey's merge requirements are in `docs/INTEGRATION_REQUIREMENTS_CODEY.md`.

## Zubair lane status (codex/zubair-api-integration)

All v4 routes below are implemented as thin adapters over dependency-injected handlers and run
end to end against an explicit, labeled in-memory service double (`RECALL_SERVICES=double`).
Codey's Neo4j services replace the double at final merge; a failing real service is never
swapped for the double.

| Area | Routes |
| --- | --- |
| Catalogs and entities | `GET /api/catalog`, `POST /api/catalog/:kind`, `GET /api/entities/:id` |
| Issues | `POST/GET /api/issues`, `GET/PATCH /api/issues/:id`, `POST .../comments|causes|fixes|verifications|transitions`, `GET .../similar-resolutions`, `GET /api/issues/export` |
| Insights | `GET /api/insights` (team roles separated, supplier linked vs confirmed, rates N/A without a complete cohort) |
| Optional AI | `POST /api/agent/draft-issue`, `POST /api/agent/issues/:id/explain-resolutions`, `POST /api/agent/tools`, `POST /api/alerts/extract` |
| Assembly trace (P1) | imports preview/accept, late evidence, traces create/get/compare/export |

Verified locally on 2026-09-12 (double + stub, no database, no live model): manual issue created
with no import or AI and reloaded; both origin paths shown (connector bought from supplier, bracket
made in-house, vehicle by build id with null VIN); stale PATCH rejected; reviewed
in-house-manufacturing cause recorded with Final Inspection still the reporter and the connector
supplier not confirmed; prior verified bracket fix retrieved with reasons; reuse created a new
proposal and left the original untouched; closure blocked before verification; failed verification
kept the issue open; passed verification closed it; the resolution was found from a later similar
issue; CSV export and bounded agent tools behaved. These are API checks against the double, not
Neo4j persistence proof. Details and unverified items: `docs/handoffs/ZUBAIR.md`.

Local run without Neo4j:

```bash
printf 'RECALL_WORKSPACE_ID=synthetic-ev-assembler
RECALL_DEMO_ACTOR_ID=qa-reviewer-demo
RECALL_SERVICES=double
RECALL_AI_PROVIDER=stub
' > .env.local
```

```bash
npm run dev
```

## Start here

Read the current [EV assembly scope](docs/EV_ASSEMBLY_SCOPE.md). We are building for a whole-vehicle EV assembler that buys some parts and manufactures others in-house. The demo follows one charge-port assembly; it does not claim full vehicle BOM coverage. EV is our chosen industry, not an organizer-mandated theme.


Read the [shared prompt](docs/prompts/SHARED_PROMPT.md), then your role prompt:

| Person | Prompt | Responsibility |
| --- | --- | --- |
| Codey/Cody | [Codey prompt](docs/prompts/CODEY_PROMPT.md) | Data integration, Neo4j, issue/fix persistence, graph queries and analytics |
| Ali | [Ali prompt](docs/prompts/ALI_PROMPT.md) | Frontend, typed API client, pitch and demo |
| Zubair | [Zubair prompt](docs/prompts/ZUBAIR_PROMPT.md) | Shared contracts, APIs, optional AI, integration and final tests |

Use the [shared contract](docs/SHARED_CONTRACT.md), [technical brief](docs/TECHNICAL_BLUEPRINT.md) and [judge kit](docs/JUDGE_SUBMISSION_KIT.md). Zubair owns source-contract migration and publishes the exact agreed interface state before parallel feature work depends on it.

## Working together

All three use this repository. Branches: `codex/codey-data-graph`, `codex/ali-ui-pitch`, and `codex/zubair-api-integration`. Feature branches are merged **at the end** in `codex/final-integration`. Each person preserves teammates' work, uses the shared contract and supplies a tested handoff in `docs/handoffs/`.

Codey supplies domain services; Ali exports `RecallWorkspace`; Zubair connects the HTTP routes and mounts the UI. Reuse existing error-envelope/injection patterns while migrating DTOs. Label mocks explicitly and disable them for final real-service tests.

## Existing foundation and setup

The repository already contains a Next.js/TypeScript scaffold, pinned `package.json`/`package-lock.json`, Zod, Neo4j's JavaScript driver and Vitest setup. Reuse them. Requires Node 20.9+ and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Useful existing commands:

```bash
npm run typecheck
npm test
npm run build
```

Lane suites: `npm run test:api`, `test:data`, `test:ui`, and `test:integration`. Their current tests are not proof of the v4 application. `npm run reference:python` still points to the legacy fixture until Zubair migrates that script.

Earlier synthetic regression oracles (robotics IDs; EV fixtures are still to be implemented):

```bash
python docs/reference/quality/build_quality_fixture.py
python docs/reference/assembly/assembly_reference_case.py
```

No application credentials are included. The existing demo identity/mocks are development scaffolding, not production authentication.

## Demo and hackathon

The primary demo is **manual issue -> assignment -> prior verified fix -> new verification and closure -> reusable knowledge -> team/supplier insight**. The first user is an operator, manufacturing quality manager or production engineer at an EV manufacturing and vehicle assembly plant.

Target Track A (Developers) and the separate Neo4j bonus. Perform and document actual Qoder development and meaningful Neo4j queries. Optional AI structures a report or explains retrieved evidence; it does not establish causes or approve corrective actions. Deployment tooling is deferred.

The supporting assembly fixture demonstrates replacement history, missing component origins and unit-count deduplication. Quality reference data demonstrates why four issues across three affected units is different from four defective units, and why rates require matching inspection volumes.

## Scope and truthfulness

Manual issues do not require datasets or external alerts. Users can record annotations and evidence in the app. Keep reporting and assigned teams separate from confirmed causal teams, and linked suppliers separate from confirmed faults. A reused fix needs verification in the new case; removed components remain in appropriate history.

Twenty-three Python assembly reference checks and the quality fixture validation passed during preparation. Actual UI/API/Neo4j tests, buyer demand and measured operational benefits remain work for the team. Legacy files under `docs/research/` are historical; the earlier regression examples are under `docs/reference/`. The current EV scenario is specified in `docs/EV_ASSEMBLY_SCOPE.md`.
