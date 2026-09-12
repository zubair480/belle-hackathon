# Browser acceptance run, 2026-09-12 (Zubair, graph mode)

Server: `codex/final-integration` at `3b052ef` running `npm run dev` on port 3111 with
`RECALL_SERVICES=graph`, `NEXT_PUBLIC_RECALL_UI_MOCKS=false`, `RECALL_AI_PROVIDER=none`,
`RECALL_AGENT_PROVIDER=stub`. `GET /api/health`: `servicesMode: graph`, `servicesRegistered: true`,
`neo4jConfigured: true`. Database: Neo4j Aura free instance (5.27). Browser: the Claude Code Browser
pane (Chromium) driving Ali's `RecallWorkspace`. Every state below was cross-checked by reading the
issue back through `GET /api/issues/:id`, which in graph mode reads from Neo4j.

Issue created in this run: `ISS-MTYY6BIL6AA61F`.

| # | Checklist step | Result | Observed |
| --- | --- | --- | --- |
| 1 | New issue form: title, description, severity major, defect Connector misaligned, station Final inspection, process step Charge-port module install, reporting team Final Inspection; save | PASS | detail page `saved v1`, status open, audit `created`; title was typed twice by the automation (cosmetic) |
| 1a | Mark CPM-0005, CONN-0005, BRKT-0005, DEMO-EV-005 on the sketch before saving | NOT RUN | the form has no item picker; marking happens on the 3D sketch, which this automation did not drive. API acceptance covers marked-entity creation |
| 2 | Reload the page and reopen the issue | PASS | issue reloaded from Neo4j with identical fields |
| 3 | Origin panel for both sourcing paths | PASS (on the earlier issue `ISS-MTYXQKFKF1DFA6`) | connector "Supplier · Demo Connector Supplier · DEMO-SUP-LOT-01", bracket "In-house · DEMO-MFG-LOT-01 · WO-DEMO-0001", vehicle "VIN not assigned", "no origin record" |
| 4 | Assign to In-house Manufacturing; stale edit from a second tab | PASS / NOT RUN | assignment saved (`v3`, "Issue saved"); the second-tab stale write was not exercised in the browser (STALE_VERSION covered by the HTTP runner) |
| 5 | Record confirmed in-house manufacturing cause (bracket cell, bracket forming) | PASS | "Assessment saved", header shows Reporter Final Inspection, Confirmed causal team In-house Manufacturing, "no confirmed supplier fault" |
| 6 | Similar resolutions panel | PASS | graph-retrieved verified fixes with reasons and applicability limits; seeded `FIX-BRKT-PRIOR-V1` listed with "same confirmed cause type" and "same process step" reasons; supplier never a reason |
| 7 | Reuse as new proposal | PASS | editor "Proposed from a verified prior resolution. Copied from FIX-MTYXNRB87B01BC"; saved as `FIX-MTYYA2ZY7A3192` state proposed, source untouched |
| 8 | Close before verification | PASS | Close button disabled with "Requires a passed verification of an applied fix" |
| 9 | Mark applied and request verification; record failed verification | PASS | status pending_verification with `fix_applied` audit; after fail: status in_progress, fix stays applied, audit "Verification failed; back to work" |
| 10 | Record passed verification; close | PASS | fix verified; "Close with verified fix v1"; status closed, `currentFixRevisionId` set (`v9`) |
| 11 | Reopen | PASS | status in_progress, both verifications and the close event retained (`v10`); History tab lists the full audit trail |
| 12 | Later bracket issue retrieves the new resolution | NOT RUN in browser | proven by the HTTP runner (step "new verified resolution retrievable from a later issue", REAL mode) |
| 13 | Insights page | PASS | Final Inspection reported 14 / confirmed cause 0; In-house Manufacturing confirmed cause 8; supplier linked 7 vs confirmed 1, rate "N/A · no complete cohort"; drilldown counts rendered |
| 14 | Trace supplier lot and manufacturing lot | NOT RUN in browser | proven by the HTTP runner (both roots, DEMO-EV-003 counted once) |
| 15 | Stop and restart the server, reopen the saved issue | PASS (earlier issue) | `docs/evidence/acceptance-graph-after.json`: `ISS-MTYXQKFKF1DFA6` retrieved after restart with identical history; also reopened in the browser |
| 16 | AI draft button with `RECALL_AI_PROVIDER=none` | NOT RUN | |
| 17 | Database down state | NOT RUN | |

Console: only 404s for sketch-only entity ids (BATT-0005 and similar), which have no backend record
by design. No application errors.

Remaining for Ali: steps 1a, 4 (second tab), 12, 14, 16 and 17 in the browser, plus screenshots.
