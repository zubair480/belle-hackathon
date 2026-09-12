You are my senior frontend engineer and product storyteller. I am Ali, building RecallRadius with Codey and Zubair for a one-day hackathon. Implement the UI and prepare a truthful, concise judge pitch.

REPOSITORY AND COORDINATION
Use https://github.com/zubair480/belle-hackathon . All three teammates have access. Inspect current work and branch from Zubair's agreed foundation; use or create codex/ali-ui-pitch. We develop independently and merge feature branches at the end. Do not independently scaffold a competing application.

Read docs/SHARED_CONTRACT.md, docs/TECHNICAL_BLUEPRINT.md, docs/JUDGE_SUBMISSION_KIT.md and docs/reference/quality/quality_issue_reference.json. Use assembly-quality-v3, including its manual issue workflow. These instructions supersede prior industry prompts.

PRODUCT AND USER
The user is an operator, manufacturing quality manager or production engineer assembling robots or physical hardware. They can report an issue inside the app, mark its component/assembly/station, assign it, learn from previous verified fixes and see process/team/supplier patterns. Imports and supplier notices are optional additional inputs.

YOUR FILE OWNERSHIP
Own src/components/recall/**, src/features/recall/**, tests/ui/**, docs/pitch/** and docs/handoffs/ALI.md. Export RecallWorkspace from src/features/recall/index.ts for Zubair to mount. Codey owns data/graph logic; Zubair owns routes, contracts and AI. Request shared configuration/dependency changes through Zubair.

P0: THE PRIMARY INTERFACE
1. Issue board and New Issue: a prominent manual creation action, status/severity, title, observed problem, reporting team, assigned team, detection station/process and optional part/serial/supplier links. Users can select/mark an affected item and add notes/evidence. Keep unknown fields editable; no CSV or AI is required to submit an issue.
2. Issue detail: issue history, assignments, observations, source evidence, affected serials and current status. Support comments/annotations and show saved state clearly. Reopening the view fetches the stored record. Distinguish current owner from who reported it.
3. Investigation and resolution: display cause hypotheses separately from confirmed/rejected causes. Show potential prior fixes with their originating issue, applicability, match reasons and successful verification. Reuse creates an editable new proposal. Provide apply, verification and status actions through the API; the server enforces transitions.
4. Team/supplier insights: filter by date, defect type, part family, process area, team role, supplier and status. Separate reported, assigned and confirmed-cause counts. Clicking a metric opens the underlying issue list and evidence.

P0: UX AND TRUTHFUL LABELS
- Start the app on the issue workflow, not an upload wizard or external-alert inbox.
- Treat marking up an issue as selecting a part/location plus notes/evidence for this day. CAD/photo drawing is optional later work.
- Separate detected-at station from confirmed causal station. A team that finds a defect did not necessarily cause it.
- Separate linked supplier, suspected supplier cause and confirmed supplier fault.
- A copied previous fix is “Proposed from a verified prior resolution.” Do not call the current problem solved until its own verification passes.
- Show verification failures, pending review, stale-update conflicts, loading, empty and unavailable-backend states. Disable duplicate submissions while pending and preserve useful draft input on errors.
- Render server-provided counts; do not create a second analytics engine in the frontend. Defect rates need a known matching denominator. Display N/A and coverage notes where unavailable.
- Use readable operational tables, concise cards and a compact evidence/relationship view. Reuse the shared design system and keep the layout desktop-first.

P1: ASSEMBLY CONTEXT
From issue detail, show the relevant component -> joint -> robot -> shipment path. Distinguish recorded current containment, historical containment and unresolved evidence. Keep replaced parts in history; removal is not automatic engineering clearance. A shared crate must never be shown as an installation.

Use the common assembly values: one current onsite robot and two shipped robots/customers initially; a late supplier certificate adds R005, increasing current shipped robots/customers to three. R006 is historical-only after replacement; R004 is crate-only. Keep robot counts separate from loose and quarantined component counts.

API AND INDEPENDENT DEVELOPMENT
Use the frozen issue and trace contracts and ApiResponse envelope. Implement a typed client with explicit development mocks matching the same DTOs. Label mock mode visibly; do not silently return sample success after a real endpoint fails. Record all API assumptions in the handoff. No database/model secrets belong in client code.

CORE DEMO STORY
An operator manually reports a joint-fastening problem on J005/R005. Final Test reports it and Mechanical Assembly owns the investigation. A prior verified JOINT-10 revision B fix is suggested. The user reviews applicability, records a cause, applies a new fix and verifies closure. Show how the graph preserves that resolution for a later issue and updates role-separated team analytics. Linking a supplier does not make it a confirmed supplier fault.

PITCH AND HACKATHON
Prepare five concise slides: user/problem; manual issue workflow; Neo4j issue/fix/assembly relationships; verified reuse and analytics demo; bounded paid pilot. Prepare three-minute and 90-second scripts. Track A and the separate Neo4j bonus are the targets. Describe real Qoder development and actual Neo4j queries, not just logos.

The differentiator to test is connected issue history, evidence and reusable fixes across assembly context. Do not invent customers, measured savings, automatic root-cause accuracy, compliance certification or completed features. Use only observed implementation/test results. Prepare content for Zubair to submit; do not publish social posts or submit the entry yourself.

HANDOFF
Run relevant UI checks for manual create/edit, errors, proposed-versus-verified resolution, attribution labels and metric drilldown. Record what was actually tested. Supply component exports, client/mock setup, screenshots if available, scripts and remaining work in docs/handoffs/ALI.md. Commit and push only your feature branch and give Zubair its SHA for the final merge.

Start with the manual issue form, issue detail and similar-resolution panel. Build the focused loop before chart polish, animation or extra slides.


REPOSITORY CONTEXT UPDATE
Read docs/prompts/SHARED_PROMPT.md and docs/PROJECT_CONTEXT.md first. A foundation already exists at dfdaae591bb4118a2d9126a884e897102dcd6847 (based on scaffold commit 19b0f74). Reuse it. The existing src/contracts/recall.ts and tests still encode the earlier domain; Zubair must migrate those source schemas to assembly-quality-v3 before teammates bind their implementations to the new contract. This documentation update does not perform that application migration. Preserve existing code and teammate commits.
