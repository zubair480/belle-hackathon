# RecallRadius project context

> Current domain: **EV vehicle assembly**, including purchased components and parts manufactured in-house. Read [EV assembly scope](EV_ASSEMBLY_SCOPE.md) for the demo, sourcing model, public data and verified hackathon fit. The proposed contract is `assembly-quality-v4`; source migration and EV fixtures are still implementation work. Earlier robotics fixtures remain labelled regression examples, not the EV demo.

Active product/contract: **assembly-quality-v4**. This is the current agreed direction for https://github.com/zubair480/belle-hackathon . Read this with the shared prompt and your role prompt.

## What the team is building

RecallRadius is an internal issue and learning workspace for EV vehicle assembly with purchased and in-house manufactured components. A user can create an issue in the app, mark an affected part, serial, assembly, station or process, save observations/evidence, assign a team, investigate cause, record corrective work, verify a fix, and retain the result in Neo4j for later reuse.

It is not limited to externally reported issues or uploaded datasets. Supplier notices and imports are additional entry paths. Manual creation and saving must work without either, and without a runtime AI call. Selecting items/locations and adding notes/evidence is the first annotation feature; CAD/photo drawing can follow later.

The knowledge graph connects issues, parts/revisions/serials, assembly relationships, teams, stations, suppliers, defect types, cause assessments, fix versions, verifications and evidence. Similar-resolution search retrieves relevant verified fixes and explains their applicability. Applying a past fix creates a new proposal and requires verification in the new case.

## Attribution and analytics

Separate who reported an issue, who owns it now, and who is confirmed to have caused it. Store detection location separately from causal location. Preserve cause hypotheses, confirmations, rejections and historical changes. A supplier associated with a part is not automatically at fault.

Show team/process/supplier breakdowns, repeated issue families, backlog and fix reuse with drilldown to evidence. Use distinct issue counts and distinct affected-unit counts appropriately. Normalized rates require matching inspected/processed-unit cohorts; unknown or incomplete denominators mean N/A, not zero or a fabricated ranking. This supports process improvement rather than an unsupported blame score.

## Team and merge agreement

| Person | Ownership | Branch |
| --- | --- | --- |
| Codey/Cody | Data integration, Neo4j domain persistence, issue/fix services, genealogy, analytics and data tests | codex/codey-data-graph |
| Ali | Frontend, typed client and visible mocks, user interactions, pitch and demo script | codex/ali-ui-pitch |
| Zubair | Shared foundation/contracts, APIs, optional AI, integration, testing and submission preparation | codex/zubair-api-integration |

All three have access to this repository. Work independently and merge feature branches only at the end in codex/final-integration. Coordinate shared interfaces early; that does not require early feature merges. Each person supplies a branch SHA, setup instructions, contract version and actual test results.

Claude subscriptions can support development assistance. Actual Qoder development work must be performed and documented for the hackathon. Configure any application-model API separately; do not assume the development subscription supplies runtime API credits.

## Existing source code and migration status

A scaffold already exists: commit 19b0f74, followed by line-ending normalization dfdaae591bb4118a2d9126a884e897102dcd6847. Keep its pinned dependencies, lockfile, app shell and useful infrastructure. Do not independently scaffold three applications.

**This update publishes prompts, documentation and synthetic reference data. It does not implement the new product.** Existing src/contracts/recall.ts, tests/api/contract.test.ts, the app placeholder, package description and legacy reference script still represent the earlier food/lot model. Their historical frozen label does not make them the v4 source contract.

Zubair's first engineering milestone is to migrate the shared source contract to assembly-quality-v4 and add src/contracts/issues.ts, retaining useful error-envelope, ROUTES, DomainError, limits and injection patterns. Coordinate the change from the earlier v3 brief to v4 with teammates; include supplier and in-house production origins, manufacturing-lot trace roots, vehicle build IDs/nullable VINs, vehicle count fields, and issue/detail/catalog/analytics DTOs, service signatures, idempotency and expectedVersion behavior, closure verification and manual inputs. Update relevant contract tests, app copy and scripts consistently. Share the exact agreed contract state with Codey and Ali before they depend on it. The application migration belongs to the feature work, not this documentation push.

Legacy files under docs/research are historical, not active build requirements. The current EV scenario is in docs/EV_ASSEMBLY_SCOPE.md. Earlier data in docs/reference/quality and docs/reference/assembly remains useful for regression checks, but is not EV factory data. Do not mix old kilogram quantities with new serialized unit counts.

## One-day scope and demonstration

P0: manually create/save/reload an issue; assign it; retrieve a compatible prior verified fix; apply a new fix version; record verification and close; retrieve that resolution for another issue; show team/supplier counts and drilldown.

P1: component/assembly impact context, installation/replacement history, controlled imports, a small complete supplier-rate cohort and optional AI report drafting or evidence explanation.

Later: broad ERP/MES connectors, CAD/image drawing, live robots, predictive models, full CAPA/8D, supplier chargebacks and advanced analytics. The MVP data model retains room for deeper process/supplier history without claiming those capabilities are already implemented.

Main story: Final Inspection reports a charge-port alignment issue on DEMO-EV-005. The graph shows a purchased connector and an in-house mounting bracket. Reviewed evidence identifies the internal manufacturing process in this synthetic case. A compatible prior bracket fix becomes a new proposal and requires new verification. The reporting team remains distinct from the confirmed causal team; a linked supplier is not automatically blamed.

The earlier robotics regression story shows a suspect encoder batch, a missing origin record, and a replacement. Current containment and historical exposure differ; removing a part does not establish engineering clearance. Shared crate membership is not an installation.

## Hackathon alignment

Enter Track A - Developers (Builder), plus the separate Neo4j bonus. Qoder must contribute to actual development. Neo4j must perform meaningful relationship queries for prior fixes, assembly context and evidence-linked analytics, rather than merely holding flat tickets. Optional AI uses retrieved evidence; it does not invent causes, approve fixes or control machines.

The live event page describes an open-ended AI-native development and agentic-engineering challenge; no EV-specific theme or track was found. EV manufacturing is the team-selected domain. Source: https://luma.com/l74b4u7b?tk=gEueM2 .

Builder weights: Qoder/AI use 25%, execution 25%, innovation 20%, impact 15%, story 15%. Keep the judge demo centered on one reliable issue-to-verified-knowledge loop. Track B targets a Qoder Desktop Agent workflow and is not the selected direction. No maximum tool count was found in the reviewed event materials; deployment provider selection is deferred.

Sources: [organizer deck](https://www.canva.com/design/DAHUt_zVr_4/As1pUraRGt4HDH2EvCtBwA/view#11) and [submission form](https://docs.google.com/forms/d/e/1FAIpQLSeFEB5HWuUGIKssCZD68Hl9ufNaU4abz-_hRJGbYMhlxt1jEQ/viewform). Recheck live logistics before submitting. The three-minute script is a preparation target, not a verified pitch limit.

## What has actually been checked

The supporting Python assembly case passed 23 reference checks. The synthetic quality fixture's supplier arithmetic and compatible-fix example were validated. These checks do not establish real Neo4j persistence, workflow transitions, UI behavior, production accuracy or customer demand. Each lane must record actual application tests before those claims appear in the pitch.
