You are my senior frontend engineer and product storyteller. I am Ali, building RecallRadius with Codey and Zubair in a one-day hackathon. Implement the interface and prepare the judge pitch.

SHARED REPOSITORY: https://github.com/zubair480/belle-hackathon . All three teammates have access. It was empty when inspected. Check its current state and branch from the exact foundation commit Zubair publishes. While that foundation is being prepared, work on the demo narrative and screen outline; do not scaffold a competing app or create another repository.

We will work independently and merge only at the end. Start from Zubair's common foundation. Read SHARED_CONTRACT.md, TECHNICAL_BLUEPRINT.md and JUDGE_SUBMISSION_KIT.md. Use the supplied fixture outcomes for every mock and screen; do not create a second demo story with different quantities.

PRODUCT AND USER
RecallRadius helps a food co-packer's quality manager investigate a suspect ingredient. The user needs to see which lots, stock positions and customer shipments have a recorded material path, which records are missing, and what changes when evidence arrives.

YOUR OWNERSHIP
- Frontend components, interactions, client API adapter and explicitly labeled development mocks.
- Evidence display, unresolved queue and revision comparison.
- Pitch narrative, concise slides, three-minute script and 90-second fallback.
- UI checks and handoff documentation.

Use branch codex/ali-ui-pitch. Own src/components/recall/**, src/features/recall/**, tests/ui/**, docs/pitch/** and docs/handoffs/ALI.md. Export RecallWorkspace from src/features/recall/index.ts. Zubair will mount it in the application route. Codey owns imports/graph logic; Zubair owns API routes, AI and integration. Coordinate changes to shared contracts, package files or app routes through Zubair.

BUILD FOUR CONNECTED VIEWS
1. Import and review: select the supported CSVs, preview row/coverage issues, and accept an eligible import. Include pasted supplier-alert input, an editable AI draft, source evidence and explicit confirmation of the matching lot. Manual lot selection must work when AI is unavailable.
2. Trace results: show revision, investigation scope, execution status, quantities and customer count. Put an actionable table before the graph. Include lot/product/brand, onsite and shipped quantities, consignees, evidence and unresolved flags.
3. Evidence and gaps: clicking a row opens its supporting source text/locator and material-event path. Show unknown origins and missing records in a separate queue, including records outside the known-path results.
4. Revision comparison: preview and accept the prepared late evidence through the API, run a new trace, and compare it with the preserved earlier run. Explain added customers, resolved issues and quantity changes.

DESIGN RULES
- Use a clean desktop-first operations interface with clear typography and restrained color. Reuse the shared app styling. Favor readable tables and short explanations over animation.
- Use the labels “Traced potential impact,” “Unresolved scope,” and “No recorded material path.” Never label a lot “safe” merely because it has no recorded path.
- Known-path and unresolved-evidence flags can coexist. Show both when appropriate.
- Keep known-path, unresolved-only and disposed quantities separate. Do not independently calculate business totals; render the API values.
- Distinguish a completed computation from complete evidence. Missing data must not look like a successful clean result.
- Provide loading, empty, validation-error, incomplete-run and unavailable-backend states. Disable duplicate acceptance/trace actions while pending.
- Label sample/mock mode visibly. Default final integration to real API calls; never silently fall back to fake success.

API COORDINATION
Implement a typed, swappable client using the routes and ApiResponse envelope in SHARED_CONTRACT.md. Build independently with mocks that match those schemas. API errors should show an understandable message and a recovery action. Neo4j credentials and runtime model secrets must never appear in frontend code.

DEMO NUMBERS
Revision 1 has 160 kg onsite, 120 kg shipped and three direct customers. F-E remains unresolved at 40 kg onsite and 60 kg shipped. Revision 2 has 190 kg onsite, 180 kg shipped and four customers. The onsite increase is 30 kg because 10 kg of old WIP is consumed. Both revisions separately show 10 kg disposed. F-D shares only a pallet and stays outside the recorded material path.

PITCH
Tell the story of a co-packer receiving a supplier warning, tracing several brands, finding a missing rework record and discovering another customer in scope. Explain Codey's Neo4j material traversal and the team's actual Qoder development work. Use the submission kit's Track A and Neo4j-bonus guidance. A three-minute script is our preparation target, not a claimed official pitch limit.

Prepare a five-slide outline covering problem/buyer, workflow, graph/evidence, late-record demo and proposed paid pilot. Describe implemented capabilities truthfully. Pricing is an experiment; do not invent paying customers, prevented illnesses, time savings, certifications or completed features. Prepare content for Zubair to submit; do not publish or submit it yourself.

DONE WHEN
The complete interaction works against the agreed mocks, the API adapter is ready for real endpoints, error states work, keyboard/focus behavior is reasonable, quantities remain consistent and both scripts are ready. Record exactly which UI checks were run. Put setup, component exports, mock toggle, API assumptions, screenshots if available and remaining work in docs/handoffs/ALI.md. Commit and push only your feature branch to the shared repository and give Zubair its commit SHA.

Start with the trace table and evidence drawer, then build the late-record comparison. Add import polish and slides after the core story works. Implement within your owned paths and leave the final merge to Zubair.
