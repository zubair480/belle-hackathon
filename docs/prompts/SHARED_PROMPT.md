CURRENT MILESTONE - READ FIRST
The v4 source contract is already published, and Ali's UI plus Zubair's API are integrated on codex/final-integration. The user reports that Codey is provisioning Neo4j in the cloud. Current continuation tasks are [Ali next steps](ALI_NEXT_STEPS.md) and [Zubair next steps](ZUBAIR_NEXT_STEPS.md). Follow those before the original build-order instructions below. Codey retains ownership of graph services and EV data. Zubair owns the remaining final integration; preserve work already merged. Actual database persistence remains unverified until the graph-backed checks and restart test pass.

EV VEHICLE ASSEMBLY UPDATE
The agreed industry is an EV vehicle manufacturer/assembler: buy some parts, manufacture others in-house, assemble subassemblies and finished cars. Read docs/EV_ASSEMBLY_SCOPE.md before the rest of this prompt. It defines the current demo and takes precedence over legacy robotics fixture examples. Proposed shared contract: assembly-quality-v4; Zubair must publish its exact source schema before implementations depend on it. Preserve existing code and coordinate the migration. Earlier robot IDs/oracles remain regression examples and must not be presented as EV factory data.

The official event is an open-ended AI-native development/agentic-engineering hackathon. No EV-specific required theme or track was found. EV assembly is our chosen domain for Track A Builder plus the separate Neo4j bonus. Use Qoder in development and substantive Neo4j queries; the app's core manual issue workflow still works without AI.

EV CONTRACT AND DEMO
Represent purchased supplier batches and internally manufactured lots/work orders separately. Attach origin to actual lots/instances; a part family may have multiple sourcing routes. Assemblies link actual component serials to module serials and vehicle build IDs, with optional VINs. Store maker/team/process links as provenance, separate from confirmed defect responsibility. Add an in-house-manufacturing cause category and vehicle-specific trace/count fields in the coordinated v4 contract.

The synthetic demo is a misaligned charge-port module on DEMO-EV-005: purchased connector plus an in-house mounting bracket. Final Inspection reports it; reviewed evidence identifies a bracket manufacturing issue; a prior verified fix becomes a new proposal and requires new verification. Trace the manufacturing lot to other recorded vehicles, and use a separate supplier-caused case to demonstrate supplier analytics. Public EV complaints/recalls remain external evidence, not factory history or locally verified fixes. Merge the three feature branches only at the end.

You are helping our three-person team build RecallRadius in https://github.com/zubair480/belle-hackathon for the B.E.L.L.E / Qoder / Neo4j hackathon. Read this shared prompt, docs/PROJECT_CONTEXT.md, docs/SHARED_CONTRACT.md and your assigned role prompt before implementing.

CURRENT PRODUCT
We are building for EV vehicle assembly with purchased and in-house manufactured components. RecallRadius is an internal issue and learning workspace, not just an external recall-alert reader. Operators can manually open an issue, mark the affected component/assembly/station, save observations and evidence, assign a team, investigate causes, apply and verify a fix, and preserve that knowledge in Neo4j for the next similar issue.

The app also connects supplier batches, serials, installations/replacements and shipments. This helps explain an issue's production context and impact. A part can be removed and replaced, so current configuration and historical exposure are separate. A design BOM or shared crate does not prove actual installation.

TEAM AND SUPPLIER INSIGHTS
Track reporting team, assigned team and confirmed causal team independently. A team that finds a defect did not necessarily cause it. Likewise, linking a supplier to an issue is not proof of supplier fault. Preserve hypotheses, confirmations, evidence and changes in attribution. Show recurring defect families and process areas, with drilldown to actual issues.

Report raw counts honestly. Show rates only when a matching inspection/production cohort is known; missing denominators mean N/A. Distinct issues are not the same as distinct defective units. The supplied quality fixture illustrates this difference.

REUSABLE FIXES
A graph query should find prior verified fixes using issue type, part/revision, process context and reviewed cause. Show why each match is relevant, its applicability limits and verification evidence. Reuse creates a new proposed fix linked to the original. The new issue needs its own verification before closure. Keep old fixes, versions and audit history intact.

HACKATHON TARGET
Target Track A - Developers (Builder), plus the separate Neo4j bonus. Use Qoder for actual development and document accepted work. Neo4j must perform substantive relationship queries for verified-fix retrieval, issue/assembly context and analytics. Optional AI may structure a report or explain retrieved evidence. The core workflow must work without a model call and must not depend on an uploaded dataset to create an issue.

TEAM OWNERSHIP
- Codey/Cody: data integration, Neo4j schema, issue/fix persistence, domain rules, graph queries, analytics and data tests.
- Ali: frontend, API client/mocks, issue/resolution screens, evidence/drilldown, pitch and demo scripts.
- Zubair: shared foundation/contracts, APIs, optional AI, integration, final tests and submission preparation.

Work on the assigned codex/ feature branches. We merge feature implementations only at the end. Agree the common contract before working in parallel. Zubair coordinates contract changes; do not independently rename fields or implement a second copy of a teammate's logic.

EXISTING REPOSITORY
The repository already has a Next.js/TypeScript foundation, pinned dependencies, app shell and src/contracts/recall.ts. Those source schemas still describe the superseded earlier domain. The new documentation targets assembly-quality-v4; publishing it does not mean the source migration is implemented. Zubair must first update the shared source contracts and publish their exact agreed state. Preserve existing useful code and teammate commits rather than rebuilding a separate app.

ONE-DAY PRIORITY
First deliver a real saved manual issue -> assignment -> prior verified resolution -> new fix -> verification/closure -> reuse and a team/supplier drilldown. Add assembly tracing as supporting context once that loop works. Defer CAD/photo drawing, live robot control, broad ERP/MES connectors, predictive scoring and full CAPA/8D.

Mark mocks explicitly; a backend failure must not silently return fake success. Distinguish synthetic fixture checks from real API/UI/Neo4j tests. Keep credentials out of source. Each handoff must identify contract version, branch SHA, exports, setup commands, actual test results and limitations. Zubair owns the final merge.

Now follow your individual role prompt and implement your owned milestone. If a shared dependency is missing, identify it precisely and continue independent work such as fixture review, UI mocks, typed service doubles or pitch preparation.
