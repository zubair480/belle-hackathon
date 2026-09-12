# Ali: finish the EV demo while Neo4j provisions

You are my senior frontend engineer and product storyteller. I am Ali, working with Zubair and Codey on RecallRadius for the B.E.L.L.E / Qoder / Neo4j hackathon. Continue the existing implementation and complete the tasks below. These are the current priorities; the original ALI_PROMPT.md remains the feature specification.

## Current context

RecallRadius serves an EV vehicle assembly plant that buys some parts and manufactures others in-house. Operators manually create issues, investigate evidence, reuse compatible verified fixes, verify each new application and retain the result for later reuse. Keep reporting team, assigned team and confirmed causal team separate; a linked supplier is not automatically at fault.

Repository: https://github.com/zubair480/belle-hackathon . The assembly-quality-v4 source contract is already published. Your frontend is already built and merged with Zubair's API lane on codex/final-integration, last checked at 69e43d1. Inspect current remote state before work because teammates may have advanced it. Do not recreate the app, repeat the source migration or overwrite teammate changes.

The user reports that Codey is provisioning a Neo4j cloud database. Real graph services are not yet wired in the checked integration commit. An in-memory service double supports API development; this is not durable database storage. The handoff reports 69 tests passed, 4 database tests skipped and 22/22 HTTP checks on the double. Those are previous results, not new verification you have performed.

Read docs/EV_ASSEMBLY_SCOPE.md and, on the integration branch, docs/handoffs/ALI.md, the latest entries in docs/handoffs/ZUBAIR.md and tests/integration/BROWSER_ACCEPTANCE.md. The status note on main predates the UI merge; the latest code and integration handoff take precedence.

## Ownership

The UI now lives in frontend/components/recall/**, frontend/features/recall/** and frontend/tests/ui/**. Keep the src/features/recall/index.ts re-export shim. Own docs/pitch/** and docs/handoffs/ALI.md as well. Zubair owns shared contracts, route wiring and the final integration branch; Codey owns Neo4j/domain persistence. Do not introduce an independent analytics or graph engine.

Keep UI fixes on your existing codex/ali-ui-pitch branch, compare against the current integration state and provide the tested SHA to Zubair. He handles incorporation into codex/final-integration. Preserve local edits and the already merged work.

## Do now

1. Run the browser journey against Zubair's actual HTTP routes with UI mocks disabled (NEXT_PUBLIC_RECALL_UI_MOCKS=false), while RECALL_SERVICES=double is used on the server. Start from the current integration build. Record this run separately as API-with-double development evidence; do not mark the real-Neo4j checklist as passed.
2. Complete the operator journey: select DEMO-EV-005 and its charge-port module; report alignment trouble; save/reload; assign; review cause evidence; find a prior verified fix; reuse it as a new proposal; apply; show failed verification keeps the issue open; pass verification and close; retrieve the new resolution for a later issue. Check draft preservation on errors, stale edits, loading/empty/unavailable states and metric drilldown.
3. Fix unsupported sketch hotspots. Some battery/cell sketch IDs currently return NOT_FOUND from the backend. Show a clear unavailable-record state or remove unsupported hotspots from the demo path. Do not manufacture sourcing, history or successful responses for these items. Keep the charge-port connector and bracket path reliable.
4. Make sourcing and attribution clear. Show Bought from supplier for the connector and Made in-house for the bracket with actual returned provenance. A vehicle build ID works without a VIN. If a vehicle's origin is null, label its identity neutrally and retain unknown provenance; do not assert an in-house origin without a record. Distinguish reporter, assigned team and reviewed causal team, and linked versus confirmed supplier fault.
5. Show backend mode accurately. A live HTTP connection alone does not mean Neo4j is connected. Use the existing health response in agreement with Zubair; show demo data when the service double is active. Never turn a real API failure into mock success. Do not expose credentials in the UI.
6. Rehearse the existing three-minute and 90-second scripts. Capture a backup recording of the stable flow, stating when it uses demo data. Keep all factory records labelled synthetic. Record genuine Qoder-assisted development contributions you performed; do not invent sponsor-use evidence or operational savings.

## When Codey and Zubair connect Neo4j

Repeat tests/integration/BROWSER_ACCEPTANCE.md against the graph-backed app with UI mocks disabled. Coordinate the server-restart test with Zubair, then reopen the saved issue and confirm the full history survived. Confirm both sourcing paths, proposed versus verified fixes, failed-then-passed verification, supplier/team labels and drilldown. Record PASS / FAIL / NOT RUN, server SHA, browser and screenshots. A prior HTTP or mock test does not substitute for this browser run.

## Handoff and finish

Run npm run typecheck and npm run test:ui for your changes; report exact commands/results and any limitations. Update docs/handoffs/ALI.md with changed files, UI/API issues still open, screenshots/recording location, backend mode used, pitch files and your branch SHA. Keep submission and public posting with Zubair; prepare the materials without sending them externally.

Your deliverable is a reliable, understandable EV issue-to-verified-fix demonstration and pitch. Fix the existing journey before adding more vehicle models, charts, animations or features. Start by inspecting the latest branch and running that journey.
