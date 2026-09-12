CURRENT MILESTONE - READ FIRST
Your API lane and Ali's frontend are already combined on codex/final-integration. Codey is provisioning a Neo4j cloud instance. Follow [Zubair's current next steps](ZUBAIR_NEXT_STEPS.md) for integration preparation, actual graph wiring, restart-persistence verification and submission readiness. This current task takes precedence over the earlier build-order instructions below. Reuse the integrated implementation; do not restart scaffolding, repeat source migration or duplicate Codey's graph work.

EV VEHICLE ASSEMBLY UPDATE
The agreed industry is an EV vehicle manufacturer/assembler: buy some parts, manufacture others in-house, assemble subassemblies and finished cars. Read docs/EV_ASSEMBLY_SCOPE.md. The assembly-quality-v4 source contract is already published; use its current source definitions and coordinate further changes. Earlier robot IDs/oracles remain regression examples and must not be presented as EV factory data.

The official event is an open-ended AI-native development/agentic-engineering hackathon. No EV-specific required theme or track was found. EV assembly is our chosen domain for Track A Builder plus the separate Neo4j bonus. Use Qoder in development and substantive Neo4j queries; the app's core manual issue workflow still works without AI.

YOUR EV DELIVERABLES
- Coordinate the move from the earlier assembly-quality-v3 brief to assembly-quality-v4. Reuse the existing scaffold. Publish exact shared source types before Codey/Ali consume them; feature implementations still merge only at the end.
- Freeze supplier versus internal origin fields, internal production lots/work orders, generic vehicle entities with build ID/nullable VIN, manufacturing-lot trace roots, in-house-manufacturing causes and vehicle count names. Update API validators/contracts and relevant tests together. Do not silently reinterpret legacy robot/food DTOs.
- Provide the reference catalogs and API responses needed to show both sourcing routes in manual issue detail. Keep public source records/provenance distinct from local issue facts and verified fixes.
- Give the in-app agent bounded server tools for relevant prior verified fixes, component origin/vehicle context and evidence-linked issue insights. No direct browser database credentials or unconstrained write queries. Model absence must not block manual issue creation or retrieval.
- Final acceptance must prove an EV issue persists, exposes both origin paths, records reviewed attribution, reuses a compatible fix as a new proposal and requires a new verification. Verify supplier-lot and manufacturing-lot vehicle queries separately. A passed old robotics fixture is not this acceptance proof.

You are my senior application engineer and integration lead. I am Zubair, building RecallRadius with Codey/Cody and Ali for a one-day hackathon. Implement my lane, coordinate the shared contract and perform the final integration when all three branches are ready.

REPOSITORY AND TEAM
Use https://github.com/zubair480/belle-hackathon . We all have access. Inspect current commits and preserve teammate work; do not create another repository. Codey owns data/Neo4j/domain persistence and analytics. Ali owns frontend and pitch. I own the foundation, shared contracts, application APIs, optional runtime AI, integration, verification and submission preparation.

We develop independently and merge feature branches only at the end. Read docs/SHARED_CONTRACT.md, docs/TECHNICAL_BLUEPRINT.md, docs/JUDGE_SUBMISSION_KIT.md and both quality and assembly fixtures. The active contract is assembly-quality-v4; earlier industry specifications are superseded.

PRODUCT PRIORITY
RecallRadius is an internal issue and learning workspace for EV vehicle assembly. The first complete flow is manual issue creation -> assignment -> cause investigation -> relevant prior verified fix -> new fix application -> verification -> closure -> reuse and analytics. Supplier notices, CSVs and assembly tracing add context; they must not block an operator from reporting an issue.

FIRST: COMMON FOUNDATION
1. Reuse the existing Next.js/TypeScript scaffold in this repository; do not create a competing application. Pin the dependency manifest and lockfile. Include Zod, Neo4j's JavaScript driver and a lightweight testing setup.
2. Finalize shared schemas/types in src/contracts/issues.ts and src/contracts/recall.ts before parallel work. Include the full DTOs for issue lists/detail, reference catalogs, comments, cause assessments, fix versions, verifications, transitions, similar resolutions, analytics and trace results.
3. Freeze route names, service signatures, statuses, required evidence, pagination, expectedVersion fields, idempotency keys and error codes. Distinguish counts from nullable rates, current from historical containment, and reporting/assignment from causal attribution. Communicate identical definitions to Codey and Ali.
4. Add the current prompt/brief/fixture pack and an .env.example with placeholders only. Publish a minimal foundation commit and share its exact branch/SHA. If branches already exist, coordinate the v4 contract update without merging their feature implementations early.
5. Use codex/zubair-api-integration; Codey uses codex/codey-data-graph and Ali codex/ali-ui-pitch. I own src/app/**, src/contracts/**, src/server/ai/**, src/server/application/**, tests/api/**, tests/integration/**, root configuration/README and docs/handoffs/ZUBAIR.md.

P0: ISSUE APIs AND ORCHESTRATION
Implement the agreed routes for creating/listing/viewing/editing issues, comments, assignments, cause assessments, fix revisions, verification, status transitions, similar resolutions and insights. Provide a seeded reference catalog for teams, stations, suppliers and defect codes so the manual form works immediately.

Use dependency injection and typed service doubles during independent development. Codey's real services export the corresponding domain methods from src/server/graph/index.ts. He owns graph persistence, transitions, retrieval and analytics. I own HTTP validation, actor/workspace context, errors and orchestration; do not recreate his business engine in route handlers.

Creating an issue must work without uploads or AI. Persist edits/assignments and serve the saved issue after reload. Allow unknown context, but validate linked IDs. Use server-supplied identity and expectedVersion to reject stale updates, and idempotency keys to avoid duplicate creation. Route status changes through the transition service rather than arbitrary PATCH.

Require a passed verification tied to the applied fix version before closure. A reused historical resolution is a new proposal requiring its own verification. Keep cause hypotheses and confirmed supplier/team attribution separate. A single documented synthetic demo identity is acceptable locally; do not present it as production authentication.

P0: OPTIONAL AI THAT SERVES THE WORKFLOW
After the manual loop works, add one small feature: structure an operator's free-text issue report into an editable draft, or explain relevant verified resolutions already retrieved from Neo4j. Use one provider through an explicit server API key; developer subscriptions do not substitute for configured application credentials.

AI output must cite supplied evidence or retrieved issue/fix IDs, preserve unknowns and stay a proposal. It must not invent fixes, confirm root causes, blame teams/suppliers, close issues, change machine settings or execute arbitrary Cypher. Runtime AI failure leaves the manual workflow usable. Keep model calls outside retryable database transactions and credentials server-side.

P1: ASSEMBLY CONTEXT AND EXPORTS
Connect Codey's controlled import, trace, history, late-evidence and comparison services through the shared routes. Preserve installation/removal intervals, old revisions and unknown origins. A BOM or shared crate is not an actual serial relationship. Keep entity counts and unit kinds separate.

Generate issue/investigation CSV exports from stored results, with clear status, attribution and evidence identifiers. Escape CSV cells correctly and protect against spreadsheet formula interpretation. Defer OCR, general ERP/MES integration, CAD, machine control and deployment polish.

TEST MY LANE INDEPENDENTLY
Test request validation, explicit errors, stale-version conflicts, duplicate commands, unauthorized workspace references, proposed-versus-verified fixes, failed verification and unavailable AI/database responses using service doubles. Mark those tests accurately as API/unit tests; they do not establish actual Neo4j persistence.

FINAL MERGE AND REAL ACCEPTANCE
When all three handoff SHAs are ready, integrate them in codex/final-integration based on the common foundation. Preserve each teammate's implementation, resolve conflicts, mount Ali's RecallWorkspace and wire Codey's real services. Disable mocks, run typecheck/build and lane tests, then test the complete UI/API/Neo4j workflow.

Required end-to-end proof:
- Manually create an issue with no CSV/AI, save it, reload and retrieve it.
- Assign it; distinguish the reporting team, owner and reviewed cause.
- Retrieve a compatible prior verified fix with evidence, copy it as a new proposal and leave the old fix unchanged.
- Block closure before successful verification; record a failed result without closing; then verify a corrected fix and close. Preserve reopening/history behavior.
- Find the new verified resolution from a subsequent similar issue.
- Show traceable team/process/supplier insights. Final Test reporting must not automatically become causal blame, and linked suppliers must not become confirmed faults.
- Match the synthetic supplier metrics: SUP-A 4 issues/3 affected units/20 inspected (15%); SUP-B 2/2/10 (20%). Missing denominators return N/A.
- For the retained robotics regression fixture only, verify the common two-to-three shipped-unit/customer change, replacement history, crate control and old-run preservation against the real database.

Missing credentials leave those integration checks unverified; do not report a pass from mocks. The existing Python assembly and quality-fixture checks are supporting oracles, not finished application tests.

HACKATHON DELIVERY
Target Track A and the separate Neo4j bonus. Capture actual Qoder development contributions, one real graph-backed resolution query, issue-to-assembly relationships and analytics drilldown. Use Ali's focused demo: report -> retrieve prior fix -> apply/verify -> persist/reuse -> team/supplier insight. Keep claims tied to working features.

Prepare the README, run instructions, evidence of sponsor use, backup recording and form content. Publishing social posts or submitting externally requires my separate instruction. Put changed files, actual commands/results, contract version, branch SHA and limitations in docs/handoffs/ZUBAIR.md.

Start with the shared foundation and exact issue contracts, then implement my API lane. Do not wait for other feature branches to finish before making progress with typed service doubles.


REPOSITORY CONTEXT UPDATE
Read docs/prompts/ZUBAIR_NEXT_STEPS.md and the latest integration handoffs first. The v4 source contract was published at 71e4773; Ali's UI and Zubair's API are already merged on codex/final-integration. Earlier statements about pending source migration or rebuilding the foundation are historical. Preserve existing code and teammate commits; inspect current branch state before work.
