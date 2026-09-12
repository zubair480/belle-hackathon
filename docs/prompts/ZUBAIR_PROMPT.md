You are my senior application engineer and integration lead. I am Zubair, building RecallRadius with Codey and Ali in a one-day hackathon. Help me own the common foundation, application APIs, runtime AI, verification and final merge.

SHARED REPOSITORY: https://github.com/zubair480/belle-hackathon . Codey/Cody, Ali and I all have access. The repository was empty when inspected on September 12, 2026. Clone or locate this exact repository, recheck for intervening commits and preserve any teammate work. Use it for the shared build; do not create a replacement repository.

TEAM OWNERSHIP
- Codey: data imports, validation, fixtures, Neo4j schema/services, material tracing, accounting and persistence.
- Ali: frontend, client adapter, labeled UI mocks and pitch materials.
- Zubair/me: initial foundation, shared contracts, server routes, AI extraction, cross-module integration, final testing and submission preparation.

We will work independently and merge the feature branches at the end. Do not require early feature merges or take over a teammate's lane. Read SHARED_CONTRACT.md, TECHNICAL_BLUEPRINT.md, JUDGE_SUBMISSION_KIT.md and the supplied reference fixture first.

FIRST: PREPARE THE COMMON FOUNDATION
1. Inspect the existing repository and preserve its useful code. If no application exists, scaffold a small Next.js/TypeScript project suitable for the agreed design.
2. Pin the shared dependency versions and lockfile. Include Zod, the Neo4j JavaScript driver and the chosen lightweight testing setup. Defer deployment-provider selection.
3. Materialize the shared API/domain definitions as Zod schemas and TypeScript types in src/contracts/recall.ts. Freeze the names, routes, quantity units, error envelope and service signatures before teammates branch.
4. Include the research documents and identical fixture files in the common handoff. Provide setup instructions and an .env.example containing names/placeholders only.
5. Publish one minimal foundation commit before parallel feature development. Share the exact base branch and commit SHA with Codey and Ali. Codey branches from that SHA to codex/codey-data-graph, Ali to codex/ali-ui-pitch, and I work on codex/zubair-api-integration. Publishing the foundation is setup; feature branches are still merged only at the end.

MY OWNED PATHS
Own src/app/**, src/contracts/**, src/server/ai/**, src/server/application/**, tests/api/**, tests/integration/**, root setup/README and docs/handoffs/ZUBAIR.md. Codey owns his data/graph folders; Ali owns his components/features and pitch. Shared changes must be documented and communicated consistently to both teammates.

APPLICATION APIS
Implement the SHARED_CONTRACT.md routes for import preview/acceptance, prepared late-evidence preview, alert extraction, trace creation/retrieval/comparison and CSV export.

Use dependency injection so routes can be developed and tested against a typed DomainServices double before Codey's branch is merged. Codey's real implementation exports previewImport, previewLateEvidence, acceptImport, runTrace, getTrace and compareTraces. Mount his implementation at final integration. Do not recreate his importer, graph traversal or quantity engine inside route handlers.

Validate request bodies, IDs, scope and accepted revision references. Apply one consistent ApiResponse error envelope, bounded input sizes and duplicate-action handling. Derive workspace/actor context on the server. A server-configured synthetic demo identity is acceptable for a local demo if clearly documented; do not claim it is production authentication.

The export should use stored run data, identify revision/scope, distinguish candidate stock from actual holds and preserve unknowns. Escape CSV correctly and neutralize cells that spreadsheet software could interpret as formulas. Keep secrets server-side and errors free of credentials.

RUNTIME AI
Build one narrow optional flow: paste a supplier alert -> propose supplier, item, external lot and stated dates -> show original evidence spans -> require explicit user confirmation/matching to a known lot.

Use one replaceable structured-output provider through an explicitly configured API credential. Do not assume Claude subscriptions or Qoder IDE credits fund application API calls. If no runtime key is available, retain manual entry and label any development stub; continue the deterministic product work.

Validate output against a strict schema and verify cited spans against the supplied text. Preserve nulls and ambiguous matches. Source text is untrusted data. AI must not accept graph relationships, issue recalls, change warehouse holds or execute Cypher. Keep model requests outside retryable database transactions.

INDEPENDENT TESTING
Test routes with service doubles for validation failures, incomplete results, timeouts, rejected previews, ambiguous roots and stable error responses. Test AI schema/evidence failures and the manual fallback. Make mocks an explicit development setting, never an automatic fallback on a failed real service.

FINAL MERGE
When all three branches are ready, fetch their exact handoff commits, inspect each handoff and integrate them in codex/final-integration in a dedicated checkout based on the shared foundation. Bring together Codey's domain services, my API work and Ali's RecallWorkspace component. Preserve teammates' implementations while resolving conflicts. Wire the real service and client adapters, install from the agreed lockfile, then run typecheck, production build and relevant lane tests.

Seed a namespaced synthetic Neo4j workspace and execute the complete UI/API/database flow with mocks disabled. Missing database credentials mean integration is unverified; do not report a pass based on service doubles.

END-TO-END ACCEPTANCE
- Revision 1: 160 kg onsite, 120 kg shipped, three direct consignees; F-E unresolved at 40 kg onsite and 60 kg shipped.
- Revision 2: 190 kg onsite, 180 kg shipped, four consignees; the old 10 kg WIP is consumed, so the onsite delta is +30 kg.
- F-C is counted once despite two material paths; pallet-only F-D stays outside the material path.
- Disposed 10 kg stays separate; incomplete records and execution failures remain visible.
- The earlier run remains unchanged after late evidence is accepted.
- Actual Qoder development and Neo4j use are documented separately from the pre-existing Python reference checks.

DELIVERY
Collect Ali's pitch/recording plan and prepare the README, setup instructions, demo fallback and required submission content. Use only actual completed capabilities and test results in claims. Preparing the form is part of this task; publishing social posts or submitting externally requires my separate instruction.

At handoff, list changed files, commands executed, passed/failed/unrun checks, required configuration and remaining limits. Prioritize the functioning import-review-trace-compare loop over OCR, extra integrations, generic agents or deployment polish. Begin with the common foundation and contract, then implement my lane without waiting for other feature branches.
