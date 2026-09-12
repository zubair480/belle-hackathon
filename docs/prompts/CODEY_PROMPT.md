You are my senior data engineer and Neo4j engineer. I am Codey, building RecallRadius with Ali and Zubair in a one-day hackathon. Implement my assigned work, with useful tests and a clear handoff.

SHARED REPOSITORY: https://github.com/zubair480/belle-hackathon . All three teammates have access. It was empty when inspected, so first fetch/check its current state and use the exact foundation commit Zubair publishes. If it is still empty, review the fixture and design your lane while Zubair prepares the foundation; do not independently scaffold the entire app or create another repository.

We will develop independently and merge all three branches only at the end. Zubair owns the common foundation and shared contracts. Read SHARED_CONTRACT.md, TECHNICAL_BLUEPRINT.md, reference_case.py and reference_output before coding. If a referenced file is unavailable, identify the exact missing dependency and continue work that does not depend on it; do not invent a replacement fixture or incompatible contract.

PRODUCT
RecallRadius helps a food co-packer trace a suspect ingredient through mixing, split batches and rework to potentially affected inventory and customer shipments. It displays evidence and missing records. QA decides what to hold or recall.

YOUR OWNERSHIP
- Data ingestion, normalization and validation.
- Synthetic fixture conversion/loading and reproducible seed commands.
- Neo4j schema, constraints, accepted revisions and persistence.
- Material traversal, inventory/shipment accounting, evidence paths and saved trace results.
- Data/graph tests and a handoff for Zubair.

Use branch codex/codey-data-graph. Own src/server/data/**, src/server/graph/**, scripts/neo4j/**, fixtures/**, tests/data/** and docs/handoffs/CODEY.md. Ali owns UI/pitch. Zubair owns routes, shared contracts, AI and final integration. Request shared-contract or dependency changes through Zubair; keep them out of unrelated files.

IMPLEMENTATION
1. Use TypeScript, Zod and the official Neo4j JavaScript driver from the shared foundation. Work through Qoder IDE and record specific accepted development contributions.
2. Implement controlled CSV/text import with original submitted text, hashes and row locators. Group input/output allocation rows into complete events. Return preview issues before accepting data. Support the provided full fixture and prepared late-evidence correction.
3. Preserve supplier/source, item and external lot identity. A matching lot code alone must not merge two suppliers' lots. Preserve event time separately from recording time.
4. Build input LotSnapshot -> MaterialEvent -> output LotSnapshot relationships. Store quantities on allocations and evidence on their supporting records. Keep containers, brands, SKUs and sites outside material traversal.
5. Scope queries and identities by workspace and accepted revision. For this small MVP, immutable graph projections per revision are acceptable. Seed commands must affect only their namespaced synthetic records.
6. Implement fixed parameterized traversal with visited-lot deduplication and event witnesses. Count distinct stock positions and shipment lines once. Reconcile the movement ledger; never sum stock over paths.
7. Scan the entire declared cohort for missing origins and coverage gaps, including disconnected lots. Preserve knownMaterialPath and hasUnresolvedEvidence as independent flags. Unsupported units, invalid quantities, missing event references and conflicting duplicates need explicit errors or review.
8. Persist immutable runs, then compare compatible runs. A timeout or traversal limit must produce an incomplete result, not an apparently complete empty answer.

EXPORT THIS SERVICE INTERFACE
From src/server/graph/index.ts export the methods defined in SHARED_CONTRACT.md: previewImport, previewLateEvidence, acceptImport, runTrace, getTrace and compareTraces. Each receives server context first. Return domain DTOs; Zubair owns HTTP envelopes and routes. runTrace must save its result before returning it.

DEMO ACCEPTANCE
- Revision 1: 160 kg onsite, 120 kg shipped, three direct consignees, finished lots F-A/F-B/F-C.
- F-E remains unresolved: 40 kg onsite and 60 kg shipped.
- Revision 2: 190 kg onsite, 180 kg shipped, four consignees; F-E now has a material path.
- The late record consumes 10 kg of previously counted WIP. Do not report 200 kg onsite.
- F-C has two paths but is counted once.
- F-D shares a pallet only and never acquires a material path from that fact.
- Report 10 kg already disposed separately in both revisions.
- The earlier revision and run remain unchanged.

TESTS
Port the relevant 22 Python reference checks into your TypeScript/data tests. Add actual Neo4j integration checks for traversal, persistence and revision isolation. Test duplicate imports, conflicting IDs, ambiguous lot identity, missing references, impossible chronology, negative closing stock and unsupported units. Distinguish locally passed logic tests from database checks actually executed.

BUILD ORDER
First deliver real Neo4j traversal of revision 1 through the exported service. Then add validated import/review, revision 2 and comparison. Keep OCR, live ERP connectors, GraphRAG, autonomous notices and a full EPCIS implementation outside this day.

HANDOFF
Provide changed files, public exports, setup/seed/test commands, required environment-variable names, observed test results and remaining limitations in docs/handoffs/CODEY.md. Include examples matching the frozen DTOs. Commit and push only your feature branch to the shared repository and provide its commit SHA. Keep it ready for Zubair's final merge; do not perform the team merge yourself.

Start by inspecting the repository, stating the files you own and checking the shared contract. Then implement the first working graph milestone rather than stopping with a plan.
