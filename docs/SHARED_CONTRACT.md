# RecallRadius shared build agreement - robotic assembly

Contract version: `assembly-quality-v3`. The primary product is now an internal manufacturing issue, resolution and learning workspace for robotic/physical assembly. Users can create and annotate issues themselves; external bulletins and datasets are additional inputs. Keep RecallRadius, the agreed role ownership and final-merge workflow.

Repository: https://github.com/zubair480/belle-hackathon . Codey/Cody, Ali and Zubair have access. A Next.js/TypeScript foundation exists at dfdaae591bb4118a2d9126a884e897102dcd6847. Reuse it and preserve intervening teammate work. Its source schemas still require the v3 migration; see docs/PROJECT_CONTEXT.md.

## Parallel work and ownership

Zubair publishes a minimal common foundation with Next.js/TypeScript, pinned dependencies, shared Zod schemas/types, these instructions and the fixtures. Everyone starts from the same agreed commit. Reuse an existing foundation if one has appeared. If teammates already started against an earlier contract, coordinate the new schema before further work; do not silently reinterpret previous records.

Feature branches are merged only at the end. Share the contract and interface changes early; that coordination does not require an early feature merge.

| Owner | Branch | Owned paths |
| --- | --- | --- |
| Codey | `codex/codey-data-graph` | `src/server/data/**`, `src/server/graph/**`, `scripts/neo4j/**`, `fixtures/**`, `tests/data/**`, `docs/handoffs/CODEY.md` |
| Ali | `codex/ali-ui-pitch` | `src/components/recall/**`, `src/features/recall/**`, `tests/ui/**`, `docs/pitch/**`, `docs/handoffs/ALI.md` |
| Zubair | `codex/zubair-api-integration` | `src/app/**`, `src/contracts/**`, `src/server/ai/**`, `src/server/application/**`, `tests/api/**`, `tests/integration/**`, root config/README, `docs/handoffs/ZUBAIR.md` |

Reuse your assigned branch if it already exists. Ali exports `RecallWorkspace` from `src/features/recall/index.ts`; Zubair mounts it in the route. Codey exports domain services from `src/server/graph/index.ts`. Zubair owns changes to the shared contract and dependency files. Each person records the agreed contract version and base SHA in their handoff.

Codey tests his services directly against a namespaced synthetic Neo4j workspace. Ali uses explicit, visibly labeled UI mocks. Zubair uses injected service doubles for API development. Run the full real application only after the final merge, with mocks explicitly disabled. Backend failure must not silently trigger a fake success.

## Target buyer and bounded product

The initial buyer is a manufacturing quality manager, production engineer or operations lead at a robotic-arm assembler or hardware contract manufacturer. The product lets operators and teams report assembly/manufacturing problems, assign investigation, record causes, apply and verify fixes, and retrieve relevant prior solutions. Component tracing provides context and impact scope for those issues.

The concrete demo tracks rotary encoder part family `ENC-42` through serialized joint modules into robotic arms. It is a software traceability workspace around existing build, replacement, supplier and shipment records. The MVP needs no robot hardware, live sensor feed, CAD viewer or machine-control interface. Other machine parts are outside this fixture's coverage; do not claim a complete robot BOM.

A design BOM describes intended parts. Actual installation and removal records establish what was assembled. Use the recorded physical configuration at a selected cutoff, plus its history. A planned relationship, common SKU, same supplier, shared rack or shipping crate is not proof of installation.

## Primary workflow: internal issues and reusable resolutions

The required first vertical slice is manual issue creation -> assignment -> investigation -> proposed fix -> verification -> closure -> retrieval/reuse on a later issue. No CSV, supplier notice or AI call is required to create an issue. The UI must allow a user to select/mark a component, assembly, machine serial, station or process step, describe the observed problem, and add notes or evidence. Unknown fields remain unknown. Text/evidence notes and selecting a part/location meet the one-day annotation scope; drawing on CAD or photos is a later enhancement.

Persist issues, comments, assignments, cause assessments, fix versions, verification results and audit events in Neo4j through Codey's domain services. Keep source origin as manual/import/supplier_notice. A new manual entry is a real saved record, not an in-memory chat message. Reopening the page must retrieve it.

Status lifecycle: `open -> triaged -> in_progress -> pending_verification -> closed`. A failed verification leaves the issue open for work. Reopening a closed issue returns it to `in_progress` and preserves the previous close and verification events. Closing requires a passed verification for the specific applied fix version, a verifier identity and evidence/result notes. A text suggestion alone is not a verified resolution.

Separate the reporting/detecting team, current assigned team, detection station and reviewed causal attribution. A team that discovers a defect is not thereby the team that caused it. A linked supplier is not thereby at fault. Cause assessments have hypothesis/confirmed/rejected states, supporting evidence and an accountable reviewer. Start with one current primary cause per issue, with superseded decisions retained; multi-cause allocation is a later extension.

For fix reuse, search prior issues by reviewed defect code, part number/revision, process step, relevant symptoms and confirmed root cause. Rank compatible verified fixes ahead of unverified suggestions. Show the originating issue, evidence, successful verification, applicability and differences. Selecting reuse creates a new proposed fix version linked to the source fix; it never edits the historical fix, automatically closes the new issue or establishes that a machine is safe.

Use a deterministic, explainable graph query for the first version. For example: same defect code + part family + process step, with an exact part-revision match when available. Supplier/team overlap can be displayed as context but should not by itself imply the same cause or compatible fix. Unknown applicability is labeled for engineering review. Semantic/embedding search can be added later if this workflow needs it.

## Teams, suppliers and process analytics

Required filters: time window, team role (reported/assigned/confirmed-cause), supplier, part family, defect code, station/process area, status and severity. Drill from every chart/count into the actual issues and evidence behind it.

- Teams: reported issues, current assigned backlog, confirmed-primary-cause issues, repeat defect patterns and time to verified closure. Do not mix these into one blame score.
- Areas: defect breakdown by where detected and, separately, confirmed causal process/station. Detection at final test does not prove final test caused the defect.
- Suppliers: linked issues versus confirmed supplier-caused issues, affected component families/batches and recurring verified root causes. Pending/rejected supplier hypotheses remain separate.
- Resolutions: repeated issue families, prior verified fixes reused, reopened issues and whether the new application of a fix passed verification.
- Counts are distinct issue IDs or distinct affected serialized units, clearly labeled. Multiple issues on one component must not become multiple defective units.
- Rates require matching exposure data. Show distinct confirmed-affected units divided by units inspected/processed in the same defined cohort and observation cutoff. Keep team process opportunities and supplier inspection opportunities distinct. Missing or incomplete denominators display `N/A` and coverage information, not 0% or a invented rate.

For the one-day build, ship counts/Pareto breakdowns, role-separated attribution, drilldown and the issue/fix history. A small complete synthetic inspection cohort can demonstrate normalized supplier rates. Advanced trend modeling, supplier chargebacks, automated CAPA/8D, individual employee rankings and automated corrective actions are outside this release. The deeper data relationships should support later expansion without claiming those features are already built.

## Issue-service contract

Zubair defines matching schemas in `src/contracts/issues.ts`; use the same `ApiResponse`, `Evidence`, `RequestContext` and contract version as the trace API. Dates are UTC ISO; human-readable identifiers are distinct from entity IDs. The server provides actor identity. Updates use an `expectedVersion` for optimistic concurrency so teammate edits cannot silently overwrite one another.

```ts
type IssueStatus = "open" | "triaged" | "in_progress" | "pending_verification" | "closed";
type IssueInput = {
  title: string; description: string;
  origin: "manual" | "import" | "supplier_notice";
  detectedAt: string; reportingTeamId: string;
  assignedTeamId: string | null; detectionStationId: string | null;
  processStepId: string | null; entityIds: string[];
  partNumber: string | null; partRevision: string | null;
  linkedSupplierIds: string[]; defectCode: string | null;
  severity: "minor" | "major" | "critical";
  evidenceIds: string[];
};
type Issue = IssueInput & {
  id: string; version: number; status: IssueStatus;
  createdBy: string; createdAt: string; updatedAt: string;
};
type CauseAssessment = {
  id: string; issueId: string;
  state: "hypothesis" | "confirmed" | "rejected";
  causeType: "supplier_component" | "assembly_process" | "design" | "calibration" | "handling" | "unknown";
  responsibleTeamId: string | null; responsibleSupplierId: string | null;
  causalStationId: string | null; rationale: string; evidenceIds: string[];
  assessedBy: string; assessedAt: string; supersedesId: string | null;
};
type FixRevision = {
  id: string; issueId: string; version: number; summary: string;
  steps: Array<{ order: number; instruction: string }>;
  applicability: { partNumber: string | null; partRevision: string | null;
    processStepId: string | null; limitations: string[] };
  state: "proposed" | "applied" | "verified";
  sourceFixRevisionId: string | null; evidenceIds: string[];
};
type Verification = {
  id: string; issueId: string; fixRevisionId: string;
  outcome: "pass" | "fail"; method: string; resultNotes: string;
  evidenceIds: string[]; verifiedBy: string; verifiedAt: string;
};
type SimilarResolution = {
  sourceIssueId: string; sourceFixRevisionId: string;
  matchReasons: string[]; applicabilityWarnings: string[];
  verificationId: string;
};
```

First API endpoints, owned by Zubair: `POST/GET /api/issues`, `GET/PATCH /api/issues/:id`, `POST /api/issues/:id/comments`, `POST /api/issues/:id/causes`, `POST /api/issues/:id/fixes`, `POST /api/issues/:id/verifications`, `POST /api/issues/:id/transitions`, `GET /api/issues/:id/similar-resolutions`, and `GET /api/insights`. The transition endpoint, not arbitrary PATCH, enforces closure/reopening rules. PATCH is limited to permitted descriptive/assignment fields with audit entries. Fix creation may include `sourceFixRevisionId` to reuse a solution as a new proposal.

Codey exports the corresponding domain methods from `src/server/graph/index.ts`: `createIssue`, `listIssues`, `getIssue`, `updateIssue`, `addIssueComment`, `recordCauseAssessment`, `createFixRevision`, `recordVerification`, `transitionIssue`, `findSimilarResolutions`, and `getInsights`, all taking server context first. He owns validation of graph references, business transitions, persistence and idempotency. Zubair freezes method signatures and response DTOs before the branches start and owns HTTP orchestration; Ali consumes the typed contract.

Before branching, finish the small remaining contracts for list filters, issue-detail aggregates, comment records, transition commands and insight responses. Include cursor/limit fields, `expectedVersion`, create-command idempotency keys, chart drilldown filters and explicit unknown-denominator values. Do not let each teammate independently invent those fields.

Issue detail includes the issue, linked entities, cause history, fix versions, verifications and audit events. Add reference-data endpoints and a seeded reference catalog for teams, suppliers, stations and defect codes, so the manual form can work from the first launch. Support manual directory creation/editing for teams, suppliers and stations; operators should not need a CSV to add these records. Optional production/inspection opportunity records may be entered manually or imported, with a defined cohort and completeness status before they support a rate.

## Core issue demonstration and analytics oracle

The main story is an operator manually reporting a fastening defect on joint J005 / robot R005. Final Test reports it; Mechanical Assembly receives the assignment. A prior verified torque-related issue on part JOINT-10 revision B suggests a compatible work-instruction-based fix. The user records a confirmed assembly-process cause, applies a new fix revision, attaches a passed verification and closes the issue. A later similar issue can retrieve that exact resolution with its evidence and applicability.

The issue's linked component supplier must not be counted as a confirmed supplier fault merely because it supplied a part in the machine. Final Test's reporting count rises; Mechanical Assembly's confirmed-cause count rises only after reviewed attribution. Preserve both facts.

Use `docs/reference/quality/quality_issue_reference.json` as the common seeded issue/fix and supplier-inspection oracle. Its supplier example has four confirmed issues across three distinct inspected units for SUP-A and two across two units for SUP-B. With complete cohorts of 20 and 10 inspected units respectively, the demonstrated affected-unit rates are 15% and 20%. Raw issue counts alone would rank these differently. Unconfirmed linked-supplier issues do not enter those confirmed numerators. These are synthetic teaching values, not measured supplier performance.

The required first acceptance test creates and saves a manual issue without any import or AI dependency, retrieves it after a reload, assigns it, proposes a prior verified fix, blocks closure before successful verification, closes it after a valid verification, and finds the resulting reusable resolution from another issue. Verify that failed verification, stale updates, rejected causes and missing denominators behave correctly.

## Assembly rules

- Identity combines issuer/manufacturer, part number and serial number; batch identity combines supplier, part number and batch code. Internal IDs remain distinct from displayed codes.
- Represent installation with a child serial, parent serial, slot, installation ID, evidence and a half-open interval `[installedAt, removedAt)`. A null end remains open. Removing a part ends its interval; replacement creates a new interval for the new serial.
- One serialized item cannot have two active physical parents, and one parent slot cannot contain two items at the same instant. Different slots may contain the same part number with different serials.
- Current containment follows edges active at `configurationAsOf`. Historical containment requires a nonempty intersection of all intervals along the path and the selected history window. Traversing every old edge without checking overlapping dates is wrong.
- Preserve current and historical relationships separately. A removed suspect part leaves the current configuration but remains in the unit's historical exposure. Removal alone is not an engineering clearance; possible prior damage remains a review decision.
- Known suspect containment and unresolved evidence can coexist. Unknown batch origins in the tracked part family remain in a review queue even when disconnected from the known batch.
- Count distinct finished-unit serials, component serials and customer IDs. A robot containing two suspect encoders counts as one robot. Do not add a robot and its installed parts into a single inventory total.
- Separate loose component candidates, already-quarantined components, onsite finished units, currently implicated shipped units and historical-only units needing review. A proposed hold is not an applied inventory hold.
- Keep original source data, event time, recording time and accepted data revision. Later evidence creates a new revision and trace; it does not mutate an earlier result.

## Shared domain/API vocabulary

Zubair materializes these definitions and matching Zod schemas in `src/contracts/recall.ts`. Quantities here are counts of discrete serialized entities, not mass. Use UTC ISO times, JSON arrays and plain objects. A single serialized row represents one physical entity. Batch-only, un-serialized component handling is deferred or explicitly unresolved; never invent serials.

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
type RequestContext = { workspaceId: string; actorId: string };
type Scope = {
  siteId: string; configurationAsOf: string; historyFrom: string;
  trackedPartNumber: string; limitations: string[];
};
type RootSelector = { kind: "supplier_batch" | "component_serial"; id: string };
type TraceRequest = { contractVersion: "assembly-quality-v3";
  revisionId: string; root: RootSelector; scope: Scope };
type ReviewIssue = {
  id: string; code: string; severity: "warning" | "blocking";
  message: string; entityIds: string[]; evidenceIds: string[];
};
type Evidence = {
  id: string; sourceName: string; sourceHash: string;
  locator: string; text: string;
};
type TraceRow = {
  entityId: string; entityKind: "component" | "subassembly" | "robot";
  partNumber: string; serialNumber: string;
  locationState: "onsite" | "installed" | "shipped" | "quarantine" | "unknown";
  customerId: string | null; shipmentLineIds: string[];
  currentContainment: boolean; historicalContainment: boolean;
  hasUnresolvedEvidence: boolean;
  engineeringReview: "pending" | "reviewed" | "not_recorded";
  evidenceIds: string[]; issueIds: string[];
};
type TraceCounts = {
  currentOnsiteRobotCount: number; currentShippedRobotCount: number;
  currentCustomerCount: number; looseCandidateComponentCount: number;
  quarantinedComponentCount: number; historicalOnlyRobotCount: number;
  unresolvedOnlyRobotCount: number;
};
type TraceResult = {
  contractVersion: "assembly-quality-v3"; runId: string; revisionId: string;
  root: RootSelector; createdAt: string; engineVersion: string;
  dataHash: string; scope: Scope;
  executionStatus: "completed" | "incomplete";
  dataCompleteness: "reviewed_scope" | "gaps_found" | "unreviewed";
  counts: TraceCounts; rows: TraceRow[];
  issues: ReviewIssue[]; evidence: Evidence[];
  paths: Array<{ relationshipId: string; fromId: string; toId: string;
    kind: "BATCH_HAS_COMPONENT" | "INSTALLED_IN";
    validFrom: string | null; validTo: string | null; evidenceIds: string[] }>;
  customers: Array<{ id: string; name: string }>;
};
type ImportInput = {
  contractVersion: "assembly-quality-v3"; files: Array<{ name: string; text: string }>;
  scope: Scope; baseRevisionId?: string;
};
type ImportPreview = {
  previewId: string; baseRevisionId: string | null;
  canAccept: boolean; issues: ReviewIssue[]; sourceHashes: string[];
  coverage: { expected: string[]; received: string[]; missing: string[] };
};
type RevisionInfo = { contractVersion: "assembly-quality-v3";
  revisionId: string; acceptedAt: string; dataHash: string };
type TraceComparison = {
  earlierRunId: string; laterRunId: string;
  comparable: boolean; reasons: string[];
  delta: TraceCounts | null;
  addedCurrentRobotIds: string[]; removedCurrentRobotIds: string[];
  addedCurrentCustomerIds: string[]; resolvedIssueIds: string[];
};
```

`TraceCounts` in a result contains nonnegative integers; the same fields in a comparison delta are signed integers. Historical containment includes current containment where an interval overlaps the history window. `historicalOnlyRobotCount` excludes current robots. `unresolvedOnlyRobotCount` excludes current known-containment robots but can overlap historical-only review; it is an independent queue and is not additive with every other card.

Execution completion is not evidence completeness. The actor and workspace come from the server. An explicitly configured synthetic demo context is sufficient for a local demo but is not production authentication.

| Route owned by Zubair | Input | Output inside `ApiResponse` |
| --- | --- | --- |
| `POST /api/imports/preview` | `ImportInput` | `ImportPreview` |
| `POST /api/imports/:id/accept` | expected base revision, if applicable | `RevisionInfo` |
| `POST /api/demo/late-evidence/preview` | `baseRevisionId` | `ImportPreview` |
| `POST /api/alerts/extract` | `sourceId`, `text` | unconfirmed component-alert draft |
| `POST /api/incidents/:id/traces` | `TraceRequest` | `TraceResult` |
| `GET /api/traces/:id` | saved run ID | `TraceResult` |
| `GET /api/traces/:id/compare?other=:laterId` | two run IDs | `TraceComparison` |
| `GET /api/traces/:id/export` | saved run ID | CSV; JSON envelope on error |

Codey exports `previewImport(ctx, input)`, `previewLateEvidence(ctx, {baseRevisionId})`, `acceptImport(ctx, {previewId, expectedBaseRevisionId?})`, `runTrace(ctx, request)`, `getTrace(ctx, {runId})`, and `compareTraces(ctx, {earlierRunId, laterRunId})`. `runTrace` saves an immutable result before returning. Zubair translates HTTP and builds exports; he does not duplicate Codey's domain logic.

Compare numeric deltas only for compatible root, scope, configuration cutoff and counting semantics. Differences in those inputs must be explained, not disguised as a simple data-revision change.

## Common assembly fixture

Use `docs/reference/assembly/assembly_reference_case.py` and `docs/reference/assembly/assembly_reference_output/`. These replace the earlier reference data. The Python case is a tested synthetic oracle, not a finished Neo4j service or full API DTO; Codey and Zubair supply a documented adapter to the contract.

The root is supplier batch ID `B17`, displayed as `ENC-B17`, part `ENC-42`. The scope is site S1, history from `2026-09-01T00:00:00Z`, and recorded configuration at `2026-09-10T23:59:59Z`.

| Serial(s) | Recorded configuration and disposition |
| --- | --- |
| E001 -> J001 -> R001 | Suspect batch; robot shipped to CUST-A |
| E002 -> J002 -> R002 and E003 -> J003 -> R002 | Two suspect encoders, one robot; shipped to CUST-B |
| E004 -> J004 -> R003 | Suspect batch; finished robot onsite |
| E005 | Suspect batch; loose component onsite, candidate for review/hold |
| E006 -> J006 -> R006, historically | E006 removed September 8 and quarantined; replacement E102 is from B18. R006 shipped to CUST-D; engineering review of prior effects remains pending |
| E101 -> J007 -> R004 | Control batch B18; R004 shares a crate with R001 and is also shipped to CUST-A |
| E900 -> J005 -> R005 | Installed encoder has an unknown batch origin in revision 1; robot shipped to CUST-C |

The late supplier certificate establishes that E900 belongs to B17. The component was already installed; this is newly recorded provenance, not a new physical installation. Revision 2 adds R005 to current known containment and resolves its origin gap. Both runs use the same configuration cutoff.

| Metric | Revision 1 | Revision 2 |
| --- | --- | --- |
| Current onsite robot count | 1 | 1 |
| Current shipped robot count | 2 | 3 |
| Current direct customer count | 2 | 3 |
| Loose candidate component count | 1 | 1 |
| Already-quarantined component count | 1 | 1 |
| Historical-only robot count | 1 | 1 |
| Unresolved-only robot count | 1 | 0 |

Current robots are R001/R002/R003 initially, then R001/R002/R003/R005. R006 stays historical-only pending engineering review. R004 stays without a recorded link to B17. Keep these categories explicit: the current-customer card does not describe every customer needing historical follow-up.

## Final merge

Each person pushes only their assigned feature branch and supplies its SHA, contract version, commands/tests and handoff. Zubair combines the three in `codex/final-integration` based on the shared foundation. Preserve teammates' implementations and resolve interface differences deliberately.

Run typecheck, production build, lane tests and real Neo4j/API/UI integration with mocks disabled. Verify deduplication, interval handling, replacement history, provenance gaps and immutable revisions. Missing credentials leave integration unverified rather than producing a fabricated pass.

The primary demo is: manually report an assembly issue -> assign it -> retrieve a relevant verified fix -> apply and verify a new fix version -> close and retrieve it later -> inspect evidence-linked team/supplier metrics. The supporting component demo selects B17, checks replacement history and compares the late certificate's effect. Operational and engineering decisions stay with the manufacturer.
