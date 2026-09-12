# Integration requirements for Codey's graph lane (assembly-quality-v4)

Written by Zubair for the final merge into `codex/final-integration`. Everything here is checked
mechanically by the integration branch; nothing is negotiable at merge time except through an
explicit contract change published by Zubair.

## 1. Export and signatures

- `src/server/graph/index.ts` exports `graphServices` (named export; a default export is also
  accepted) satisfying `DomainServices` from `src/contracts/recall.ts`
  (`IssueServices & TraceServices`). All 20 methods must exist as functions:
  `getCatalog, upsertCatalogItem, getEntityContext, createIssue, listIssues, getIssue, updateIssue,
  addIssueComment, recordCauseAssessment, createFixRevision, recordVerification, transitionIssue,
  findSimilarResolutions, getInsights, previewImport, previewLateEvidence, acceptImport, runTrace,
  getTrace, compareTraces`.
- Every method takes `RequestContext` first and returns the DTO directly. Expected failures are
  thrown as `DomainError(code, message, details?)` with a frozen `ErrorCode`. Raw Neo4j errors must
  not cross the boundary (the routes map anything that looks like a driver error to
  `BACKEND_UNAVAILABLE` and scrub credentials, but the message will be generic).
- `tests/integration/graph-services-shape.test.ts` verifies the export shape as soon as the module
  exists on the checkout.
- Routes re-validate `IssueDetail` and `TraceResult` with the contract schemas before returning
  them. Ids must match `[A-Za-z0-9][A-Za-z0-9._:-]*`, times must be UTC ISO with `Z`, evidence
  `sourceHash` must be 64 hex chars, counts must be non-negative integers.

## 2. Lifecycle rules the routes and UI rely on

| Rule | Error when violated |
| --- | --- |
| `createIssue` with a repeated `idempotencyKey` and identical payload returns the original issue with `replayed: true`; a different payload is rejected | `DUPLICATE_ACTION` |
| Same idempotency semantics for comments, causes, fixes, verifications and transitions (key scoped per issue) | `DUPLICATE_ACTION` |
| `updateIssue` and `transitionIssue` compare `expectedVersion` with the stored version; every successful mutation bumps `version` and `updatedAt` | `STALE_VERSION` (409) |
| Linked ids (teams, stations, process steps, defect codes, suppliers, entities, evidence, fix ids, `supersedesId`) must exist in the workspace | `INVALID_REFERENCE` (400) |
| Transitions follow `TRANSITIONS` in `src/contracts/issues.ts`; nothing else changes `status` | `INVALID_TRANSITION` (409) |
| `request_verification` carrying `fixRevisionId` marks that fix `applied`, sets `appliedAt` and `currentFixRevisionId`, and logs a `fix_applied` audit event | `INVALID_REFERENCE` if the fix belongs to another issue |
| `recordVerification` against a `proposed` fix moves it to `applied`; outcome `pass` moves it to `verified`; outcome `fail` while `pending_verification` returns the issue to `in_progress` with a `transition` audit event | |
| `close` requires `fixRevisionId` whose latest verification is `pass`; on success `currentFixRevisionId` is that fix | `VERIFICATION_REQUIRED` (409) |
| `reopen` from `closed` goes to `in_progress` and keeps every earlier audit event, verification and fix | |
| `createFixRevision` with `sourceFixRevisionId` copies nothing into the source; the source fix, its state and its issue stay byte-identical | `INVALID_REFERENCE` if the source does not exist |
| The current primary cause is the newest assessment (`isCurrent: true`); `confirmedCauseId` is set only when that assessment is `confirmed`. Superseded assessments are retained with `isCurrent: false` | |
| `findSimilarResolutions` returns verified fixes only (or flags unverified suggestions with `verificationId: "NONE"`), ranks deterministically, fills `matchReasons` and `applicabilityWarnings`; shared supplier or team is never a match reason | |
| `getInsights`: `reportedIssueIds` by `reportingTeamId`, `assignedOpenIssueIds` by `assignedTeamId` and non-closed status, `confirmedCauseIssueIds` by the current confirmed cause's `responsibleTeamId`; suppliers separate `linkedIssueIds` from `confirmedIssueIds`; `affectedUnitRate` is `null` and `cohortComplete: false` unless a complete inspection cohort exists | |

## 3. EV fixture the acceptance runner expects

Source of truth: `tests/integration/acceptance-expectations.json`, `EV_DEMO` and `EV_TRACE_DEMO`.

- Workspace `synthetic-ev-assembler`, site `PLANT-1`, accepted revision id `ev-r1` (or tell Zubair
  the real id; the runner takes `--revision`).
- Catalog: teams `TEAM-FINAL-INSPECTION`, `TEAM-INHOUSE-MFG`, `TEAM-ASSEMBLY`,
  `TEAM-SUPPLIER-QUALITY`, `TEAM-INCOMING-QA`; supplier `SUP-CONNECTOR`; stations
  `ST-FINAL-INSPECTION`, `ST-CHARGEPORT-ASSEMBLY`, `ST-BRACKET-CELL`; process steps
  `chargeport-install`, `bracket-forming`, `final-inspection`; defect codes `CONNECTOR_MISALIGNED`,
  `BRACKET_OUT_OF_TOLERANCE`, `CONNECTOR_DEFECT`. Ali's sketches also reference extra ids (see
  `docs/handoffs/ALI.md` item 7); those may return `NOT_FOUND`.
- Entities and origins: `CONN-0002..0007` (supplier origin, `productionLotId: LOT-SUP-01`,
  `supplierBatchCode: DEMO-SUP-LOT-01`), `BRKT-0002..0007` (in-house origin,
  `productionLotId: LOT-MFG-01`, `manufacturingLotCode: DEMO-MFG-LOT-01`, `workOrderId: WO-DEMO-0001`,
  `manufacturingTeamId: TEAM-INHOUSE-MFG`, `processStepId: bracket-forming`), modules `CPM-0002..0005`
  and `CPM-0007`, vehicles `DEMO-EV-002..005` (build id = entity id, `vin: null`).
- Installations (active at `2026-09-12T12:00:00Z`): each `CONN-n` and `BRKT-n` into `CPM-n`;
  `CPM-0002..0005` into `DEMO-EV-0002..0005` slot `chargeport`; `CPM-0007` into `DEMO-EV-003` slot
  `chargeport-rear` (so DEMO-EV-003 has two affected components per lot). `CONN-0006` loose
  onsite (no installation); `BRKT-0006` in `quarantine`. `DEMO-EV-002` and `DEMO-EV-003` shipped
  to `CUST-DEALER-1`.
- Expected trace results (both roots): current vehicles `DEMO-EV-002, 003, 004, 005`; counts
  `currentOnsiteVehicleCount 2, currentShippedVehicleCount 2, currentCustomerCount 1,
  historicalOnlyVehicleCount 0, unresolvedOnlyVehicleCount 0`; supplier root
  `looseCandidateComponentCount 1, quarantinedComponentCount 0`; manufacturing root
  `looseCandidateComponentCount 0, quarantinedComponentCount 1`. Paths must include
  `BATCH_HAS_COMPONENT` / `LOT_PRODUCED_COMPONENT` edges from the lot to each component and
  `INSTALLED_IN` edges, with at least two `INSTALLED_IN` edges ending at `DEMO-EV-003` per root.
- Prior knowledge: closed issue `ISS-BRKT-PRIOR` (reporter `TEAM-FINAL-INSPECTION`, confirmed
  cause `in_house_manufacturing` by `TEAM-INHOUSE-MFG` at `ST-BRACKET-CELL` / `bracket-forming`,
  part `CP-BRKT-200` rev `A`) with fix `FIX-BRKT-PRIOR-V1` in state `verified` and a passed
  verification `VERIFY-BRKT-PRIOR`; a separate in-progress issue `ISS-CONN-SUPPLIER` with a
  confirmed `supplier_component` cause on `SUP-CONNECTOR`. No inspection cohort for
  `SUP-CONNECTOR` (rate must be `null`).
- Legacy robotics fixture (root `B17`, workspace `synthetic-robot-assembler`) stays separate and
  is exercised only by the regression test in `tests/integration/neo4j.integration.test.ts`.

If any expected value cannot be met, say so before the merge. The expectations file is not
adjusted to make a run pass.

## 4. Handoff contents

`docs/handoffs/CODEY.md` with: branch and exact SHA; environment variable names used
(`NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `RECALL_WORKSPACE_ID`,
`RECALL_GRAPH_NAMESPACE`); schema/constraint and seed commands (namespaced, re-runnable);
the accepted EV revision id; commands and observed results of real Neo4j service tests
(distinguished from fixture-only checks); known limits. No credentials anywhere.

## 5. Merge and verification sequence (Zubair)

1. Merge Codey's SHA into `codex/final-integration`; keep Ali's and Zubair's work.
2. `src/server/application/wiring.ts`: `import { graphServices } from "@/server/graph"` and
   register it for mode `graph`. Replace the dynamic import in
   `tests/integration/neo4j.integration.test.ts` with the static import.
3. `.env.local`: `RECALL_SERVICES=graph`, `NEXT_PUBLIC_RECALL_UI_MOCKS=false`,
   `RECALL_AI_PROVIDER=none` unless a funded key exists, plus the `NEO4J_*` values.
4. `npm run neo4j:check` (connectivity and a workspace read), `npm run typecheck`,
   `npm run build`, `npm test`, `npm run test:integration`.
5. `npm run acceptance -- --base http://localhost:3000 --out docs/evidence/acceptance-graph-before.json`
   (no `--allow-double`), restart the server without resetting the database, then
   `npm run acceptance -- --base http://localhost:3000 --persist-from docs/evidence/acceptance-graph-before.json --out docs/evidence/acceptance-graph-after.json`.
6. Ali runs `tests/integration/BROWSER_ACCEPTANCE.md` against the same server.
