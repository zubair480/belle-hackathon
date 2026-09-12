EV VEHICLE ASSEMBLY UPDATE - READ FIRST
The agreed industry is an EV vehicle manufacturer/assembler: buy some parts, manufacture others in-house, assemble subassemblies and finished cars. Read docs/EV_ASSEMBLY_SCOPE.md before the rest of this prompt. It defines the current demo and takes precedence over legacy robotics fixture examples. Proposed shared contract: assembly-quality-v4; Zubair must publish its exact source schema before implementations depend on it. Preserve existing code and coordinate the migration. Earlier robot IDs/oracles remain regression examples and must not be presented as EV factory data.

The official event is an open-ended AI-native development/agentic-engineering hackathon. No EV-specific required theme or track was found. EV assembly is our chosen domain for Track A Builder plus the separate Neo4j bonus. Use Qoder in development and substantive Neo4j queries; the app's core manual issue workflow still works without AI.

YOUR EV DELIVERABLES
- Add supplier origin and internal manufacturing lot/work-order provenance under the agreed v4 schemas. Keep manufacturing transformations distinct from installation edges. Use generic component/subassembly/vehicle kinds, stable internal build IDs and nullable VINs.
- Create a separately labelled EV fixture with a purchased connector, in-house bracket, assembled charge-port module and finished vehicle. Include a prior verified compatible fix, the new manual issue, a reviewed internal-manufacturing cause, and a separate confirmed supplier-caused case. Retain legacy fixture tests without treating their robot outputs as EV validation.
- Query from a supplier batch OR internal manufacturing lot through produced components and actual installations to distinct vehicles. Show both origin paths on the issue. Attribute faults only through reviewed cause evidence; the manufacturing team is not automatically at fault.
- Cache a reviewed sample of NHTSA EV complaints/recalls with source IDs, URLs and retrieval dates. Keep external records separate from synthetic factory identity; do not invent complaint-to-batch, real supplier-to-demo-part or VIN joins.
- Test both sourcing paths, manual persistence, new verification on fix reuse, distinct vehicle counts, incompatible revisions and unknown origin. Leave deeper transformation history to a later milestone.

You are my senior data and Neo4j engineer. I am Codey/Cody, building RecallRadius with Ali and Zubair for a one-day hackathon. Implement my lane with working persistence, meaningful tests and a handoff for our final merge.

REPOSITORY AND COORDINATION
Use https://github.com/zubair480/belle-hackathon . We all have access. Inspect the current repository and preserve teammate work. Start from Zubair's agreed foundation commit; use or create codex/codey-data-graph. We work independently and merge feature branches only at the end. Do not create a competing app or replacement repository.

Read docs/SHARED_CONTRACT.md, docs/TECHNICAL_BLUEPRINT.md, docs/reference/quality/quality_issue_reference.json, docs/reference/assembly/assembly_reference_case.py and assembly_reference_output. The active contract is assembly-quality-v4. These files supersede earlier industry prompts. Follow the current EV vehicle assembly scope and discrete serial counts.

PRODUCT
RecallRadius is an internal manufacturing issue and learning workspace for EV vehicle assembly. Operators can create issues themselves, mark the affected part/assembly/station, assign teams, investigate causes, record and verify fixes, and reuse relevant previous resolutions. External supplier alerts and CSVs are additional inputs, not prerequisites.

Neo4j must power the actual issue/solution relationships, component genealogy and evidence-based team/supplier analytics. This is our substantive graph contribution for Track A and the Neo4j bonus. Qoder must perform real development work, with accepted contributions recorded for the judges.

YOUR FILE OWNERSHIP
Own src/server/data/**, src/server/graph/**, scripts/neo4j/**, fixtures/**, tests/data/** and docs/handoffs/CODEY.md. Zubair owns shared contracts, HTTP routes and AI; Ali owns UI and pitch. Coordinate contract or dependency changes through Zubair rather than editing shared files independently.

P0: ISSUE AND RESOLUTION SERVICES
1. Persist manually created issues, comments, entity/station annotations, assignments and audit history in Neo4j. A saved issue must survive a page/server reload. Do not make the application depend on imported data or a model call to report an issue.
2. Use separate nodes/relationships for Issue, Team, Station, ProcessStep, Supplier, DefectType, CauseAssessment, FixRevision, Verification and Evidence. Link issues to actual component, subassembly and vehicle serials/build IDs where known. Missing context stays unresolved.
3. Export the shared issue services: createIssue, listIssues, getIssue, updateIssue, addIssueComment, recordCauseAssessment, createFixRevision, recordVerification, transitionIssue, findSimilarResolutions and getInsights. Zubair defines the exact DTO signatures in the shared foundation; receive server context first and return domain objects.
4. Enforce lifecycle transitions and optimistic concurrency. Close only after a passed verification for the applied fix version, with an identifiable verifier and result evidence. A failed verification does not close an issue. Reopening preserves all prior events. Make create commands idempotent.
5. Store reporting team, assigned team and confirmed causal team separately. Distinguish linked suppliers from confirmed supplier causes. Keep hypotheses, rejected causes and superseded cause assessments in history; use only the current confirmed primary cause for causal metrics.
6. Retrieve prior verified fixes through relevant graph relationships: defect code, part number/revision, process step and reviewed cause. Return match reasons, applicability warnings and supporting verification. Unknown or incompatible revisions require review. A shared supplier/team alone is not proof that a fix applies.
7. Reusing a fix creates a new proposal linked through sourceFixRevisionId to its original. Never edit the old fix or auto-close the new issue. The new application needs its own verification.

P0: TEAM, PROCESS AND SUPPLIER INSIGHTS
Return filterable counts and drilldown IDs for reported issues, assigned backlog, confirmed causes, affected process areas and recurring defect families. Separate detection location from causal location. Count distinct issues or distinct affected units according to the displayed metric.

Retain the earlier quality fixture as an arithmetic regression example: SUP-A has four confirmed issues across three distinct units among 20 inspected units (15%); SUP-B has two issues across two units among 10 (20%). Linked or unconfirmed supplier issues must not enter confirmed-fault numerators. Incomplete/missing denominators return null/N/A, not zero or a fabricated rate. Explain that different cards can overlap and are not additive blame scores.

P1: ASSEMBLY DATA AND IMPACT CONTEXT
Use controlled entity, batch, installation/removal and shipment inputs with evidence hashes, preview validation and immutable accepted revisions. Preserve issuer + part + serial identity. A design BOM does not prove an actual installation.

Model child serial -> parent serial/slot with installation and removal intervals. Current paths use the selected configuration time. Historical paths require overlapping intervals across all hops. A removed component leaves current containment but remains in relevant history pending engineering review. Reject simultaneous parent/slot conflicts and invalid references. A shared crate is not an assembly path.

Support the existing trace-service contract: previewImport, previewLateEvidence, acceptImport, runTrace, getTrace and compareTraces. Count a vehicle with two suspect components once. Keep loose parts, quarantined parts and whole-machine counts separate. Preserve previous trace results when new evidence arrives.

ACCEPTANCE AND TESTING
- Create a manual issue, retrieve it, assign it, record a cause and fix, block premature closure, pass verification, close and retrieve that resolution for another issue.
- A reused fix is a new proposal; the old verified fix remains unchanged.
- Final Test can report a problem confirmed to originate in Mechanical Assembly. Its linked supplier is not automatically blamed.
- Analytics match docs/reference/quality/quality_issue_reference.json, including distinct units and N/A denominators.
- In the legacy robotics regression fixture only, initial current scope has one onsite robot, two shipped robots and two customers. A late certificate adds R005, producing three shipped robots/customers. Replaced-part robot R006 stays historical-only; crate-only R004 remains outside the recorded batch path.
- Run meaningful real Neo4j service tests. Distinguish those from the 23 pre-existing Python assembly reference checks and the quality-fixture validation. Do not claim application persistence or lifecycle correctness based on fixtures alone.

BUILD ORDER AND HANDOFF
First deliver manual issue persistence, verified fix retrieval and the supplier/team count query through the exported services. Then finish lifecycle invariants and assembly context. Defer generic connectors, CAD, live robots, predictive scoring and full CAPA/8D.

Keep queries parameterized and workspace-scoped, seeds namespaced and secrets out of source. Put setup/seed/test commands, exports, observed results, contract version, base SHA and limitations in docs/handoffs/CODEY.md. Commit and push only your branch, share its final SHA, and leave the team merge to Zubair.

Begin by inspecting the repository and confirming your owned files, then implement the first persisted manual-issue milestone rather than stopping at a plan.


REPOSITORY CONTEXT UPDATE
Read docs/prompts/SHARED_PROMPT.md and docs/PROJECT_CONTEXT.md first. A foundation already exists at dfdaae591bb4118a2d9126a884e897102dcd6847 (based on scaffold commit 19b0f74). Reuse it. The existing src/contracts/recall.ts and tests still encode the earlier domain; Zubair must migrate those source schemas to assembly-quality-v4 before teammates bind their implementations to the new contract. This documentation update does not perform that application migration. Preserve existing code and teammate commits.
