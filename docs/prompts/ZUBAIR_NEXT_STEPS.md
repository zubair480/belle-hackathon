# Zubair: finish integration while Neo4j provisions

You are my senior application engineer and integration lead. I am Zubair, working with Ali and Codey on RecallRadius for the B.E.L.L.E / Qoder / Neo4j hackathon. Continue the existing implementation and complete the tasks below. These are the current priorities; the original ZUBAIR_PROMPT.md remains the feature specification.

## Current context

RecallRadius serves an EV vehicle assembly plant using purchased components and parts manufactured in-house. Its core is a manually saved issue, reviewed cause, compatible previous fix, new verification and reusable resolution. Supplier and internal manufacturing origins are distinct; source ownership does not automatically establish fault.

Repository: https://github.com/zubair480/belle-hackathon . The assembly-quality-v4 source contract is already published on main. Your API lane and Ali's frontend are already combined on codex/final-integration, last checked at 69e43d1. Inspect remote updates and local edits before continuing. Reuse this branch for integration work; do not restart scaffolding, redo the v4 migration or repeat merges already present.

The user reports that Codey is provisioning a Neo4j cloud instance. His graph implementation was not on the remote at the last check. The current integration app serves actual HTTP routes backed by an explicit in-memory double, with UI mocks disabled. The latest handoff reports 69 tests passed, 4 Neo4j tests skipped and 22/22 HTTP acceptance checks on that double. Its post-server-restart persistence check failed as expected because the double is in memory. Treat these as recorded development results, not completed database integration.

Read docs/EV_ASSEMBLY_SCOPE.md, src/contracts/common.ts, src/contracts/issues.ts, src/contracts/recall.ts and, on the integration branch, docs/handoffs/ALI.md, the latest entries in docs/handoffs/ZUBAIR.md, tests/integration/acceptance-expectations.json and tests/integration/BROWSER_ACCEPTANCE.md. The status note on main predates Ali's merge.

## Ownership

Own src/app/**, src/contracts/**, src/server/application/**, src/server/ai/**, tests/api/**, tests/integration/**, shared configuration and final integration. Ali owns the existing frontend/** implementation and pitch; Codey owns graph services, domain persistence, seeds and queries. Request compatible exports and data from Codey; do not duplicate his Neo4j engine while the instance provisions.

## Do now

1. Check the integrated HTTP workflow using RECALL_SERVICES=double and NEXT_PUBLIC_RECALL_UI_MOCKS=false. Confirm health/backend mode, create/save/reload, both sourcing paths, stale-write errors, reviewed attribution, compatible prior fixes, new proposals, apply/verification/closure, later reuse and drilldown. A page reload can work on the double; persistence across a server restart cannot.
2. Use the existing runner for a labelled dry run: npm run acceptance -- --base http://localhost:3000 --allow-double --out acceptance-double.json . Investigate new failures and report them accurately. Preserve the runner's refusal to claim real integration on a double. Coordinate with Ali on unsupported sketch entities rather than inventing successful entity responses.
3. Prepare Codey's integration requirements. Confirm he exports graphServices implementing the published DomainServices interface from src/server/graph/index.ts and provides his branch SHA, setup/seed commands, actual test results and EV fixture revision. Compare his fixture against acceptance-expectations.json, EV_DEMO and EV_TRACE_DEMO. Agree any mapping explicitly; do not weaken expected vehicle counts or fabricate paths to get a pass.
4. Verify the lifecycle contract with Codey: request_verification for a fix applies that fix and records the relevant audit history; reuse preserves the source fix and creates a new proposal; closure requires a passed verification for the applied version; a failed verification keeps work open; reporting/assignment and confirmed cause remain separate. Check current shared definitions before changing behavior.
5. Prepare the cloud connection using the returned URI/database name and the project's existing environment-variable names. Credentials belong in local/server configuration and must not be committed or printed. Instance provisioning alone does not mean schemas, seeds, graph queries or service exports exist.
6. Keep the optional runtime AI secondary to the reliable manual workflow. It may draft issue fields or explain retrieved resolutions, with evidence IDs and explicit unavailable states. Do not require a model key to complete the core demo. Record actual Qoder-assisted development performed by any team member and collect their evidence for the pitch.
7. Prepare docs/SUBMISSION_DRAFT.md, README run instructions and a concise status update based on current implementation. Separate UI mock, API-with-double and real graph checks. Ali owns the recording/scripts; use only verified feature claims. EV manufacturing is our selected application domain for Track A Builder and the Neo4j bonus, not an official EV-specific track.

## When Codey's instance and branch are ready

1. Review his handoff, preserve all teammate changes and integrate his completed branch into codex/final-integration. Take any final UI fixes from Ali deliberately. Wire graphServices in src/server/application/wiring.ts and the integration tests through the agreed exports.
2. Load the EV seed into the intended demo workspace/database. Set RECALL_SERVICES=graph and NEXT_PUBLIC_RECALL_UI_MOCKS=false. Confirm health reports graph services registered, then prove the connection with actual reads/writes; the mode label alone is not database evidence. Keep runtime AI disabled if no live provider is configured.
3. Run the relevant lane/integration tests, npm run typecheck, npm run build and the real HTTP acceptance runner WITHOUT --allow-double. Use the agreed EV expectations/revision, save a report, and resolve failures instead of substituting the double.
4. Prove durable persistence: run npm run acceptance -- --base http://localhost:3000 --out acceptance-graph-before.json ; stop and restart the application server without resetting the database; then run npm run acceptance -- --base http://localhost:3000 --persist-from acceptance-graph-before.json --out acceptance-graph-after.json . Preserve the reports, server SHA and recorded restart. Verify the saved issue, cause/fix/verification history and source fix are intact.
5. Verify supplier-lot and in-house manufacturing-lot traces independently, including distinct vehicle counts when more than one suspect component is installed in one car. Run real Neo4j queries for compatible verified-fix retrieval and evidence-linked analytics. Ali performs the separate browser acceptance journey against the same integrated app.
6. Update handoffs, README/status and submission claims from actual results. Prepare the repository/demo evidence for judges. Public posting and form submission still require the user's explicit instruction; do not send them automatically.

## Handoff and finish

Record the integrated SHA, Codey's merged SHA, setup and seed commands without secrets, backend/provider modes, exact checks/results and remaining failures in docs/handoffs/ZUBAIR.md. The finish condition is the EV issue workflow demonstrated in the browser with real Neo4j persistence, reusable verified fixes and both sourcing paths. Keep the work focused on completing that integrated flow before adding features.
