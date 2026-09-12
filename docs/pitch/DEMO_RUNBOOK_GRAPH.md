# Demo runbook, graph-backed build (2026-09-12)

This is the click-by-click plan for the live demo on the integrated build with real Neo4j.
It supersedes the numbers in `SCRIPT_3MIN.md` and `SCRIPT_90S.md`, which were written against
mock data (their "80-unit cohort", "lighting supplier" and "August 23" lines do not exist in the
real graph). Every line here was observed on the shared Aura instance today.

## Before the demo (10 minutes)

1. Terminal in the repo: `npm run neo4j:check` must print `connected`. Then `npm run dev`
   (port 3000) or keep the running dev server on 3111. Open the app; the top bar must read
   **"Live API · Neo4j graph services"**. If it says "service double", stop: `.env.local` is wrong.
2. Optional cleanup so counts are small and readable: `npm run neo4j:cleanup-acceptance` removes
   the issues created by today's automated acceptance runs (titles "Charge-port connector
   misaligned on DEMO-EV-005" / "Bracket skew on DEMO-EV-004" created by qa-reviewer-demo) and
   leaves the seeded `ISS-BRKT-PRIOR`, `ISS-CONN-SUPPLIER`, all entities and provenance. After it,
   Insights shows Final Inspection 1 reported / 0 confirmed, In-house Manufacturing 1 confirmed,
   supplier linked 1 / confirmed 1 / rate N/A. Re-running `npm run neo4j:seed` restores anything
   the seed owns; the cleanup never touches Codey's or Ali's nodes.
3. Open a second browser tab on the app for the stale-edit moment (optional).
4. Have `docs/evidence/acceptance-graph-7bd3cbcf-after.json` ready to show if asked for
   persistence proof (23/23 after a server restart).
5. Say once at the start: "All factory records are synthetic; the plant, suppliers and vehicles are fictional."

## Three-minute run

**0:00 to 0:20, the problem.** Vehicles view, sedan card `DEMO-EV-005` selected.
Say: "Final Inspection finds the charge-port connector sitting proud on this build. The connector
was bought from a supplier; the bracket under it was made in-house. Today those records, the last
fix and its verification live in different systems, and the team that found the defect usually
gets the blame."

**0:20 to 0:50, both origins from the graph.** Tap the charge port on the 3D sketch (front
port). The panel shows `CONN-0005` as "Bought from supplier · DEMO-SUP-LOT-01" and `BRKT-0005`
as "Made in-house · DEMO-MFG-LOT-01 · WO-DEMO-0001 · In-house Manufacturing". Point at the
"producer, not a confirmed cause" wording. Parts drawn without a record say "No backend record";
say: "we never invent provenance."

**0:50 to 1:20, report and save.** Click "Report issue on this part" (or "+ New issue"). Title
"Charge-port connector misaligned on DEMO-EV-005", severity Major, defect Connector misaligned,
station Final inspection, step Charge-port module install, reporting team Final Inspection. Save.
Say: "No CSV, no alert, no model call. Saved v1 in Neo4j." Press F5: the same issue reloads with
its audit entry. Assign to In-house Manufacturing in the Overview panel and save.

**1:20 to 1:45, reviewed attribution.** Investigation tab, "+ Record cause assessment": state
confirmed, type In-house manufacturing, team In-house Manufacturing, station Bracket forming cell,
step Bracket forming, one sentence of rationale. Save. Point at the header: reported by Final
Inspection, confirmed causal team In-house Manufacturing, supplier "linked, no confirmed fault".

**1:45 to 2:25, verified reuse.** Resolution tab. Say: "The graph query walks issue, fix and
verification relationships and finds the bracket fix verified on DEMO-EV-002, with why it
matched and its limits." Click "Reuse as new proposal" on `FIX-BRKT-PRIOR-V1`, then "Save proposal".
Show the disabled Close button: "Requires a passed verification of an applied fix". Click "Mark
applied and request verification". "Record verification" with Fail: status returns to In progress,
the failure is kept, Close still blocked. "Record verification" with Pass, then "Close with
verified fix v1". Say: "The old fix was never edited; this vehicle passed its own check."

**2:25 to 2:45, history and reuse.** History tab: created, cause, fix proposed from
`FIX-BRKT-PRIOR-V1`, applied, fail, pass, close. Click Reopen once to show the close event survives,
then close again. Say: "The next bracket issue retrieves this resolution the same way."

**2:45 to 3:00, honest analytics.** Team & supplier insights. Read the three team columns:
"Final Inspection reported it and caused none; In-house Manufacturing caused it and reported
none. The connector supplier is linked, confirmed on one earlier case, and its rate shows N/A
because we have no complete inspection cohort. We show N/A, not zero." Click a count to open the
issues behind it. Close: "Neo4j Aura holds the issue, the parts, both lots, the teams, the causes,
the fix lineage and the evidence as one connected record, and we proved it survives a server
restart."

## Ninety-second version

Vehicles (tap charge port, both origins, 15 s) → New issue, save, F5 (20 s) → Investigation:
confirmed in-house cause (15 s) → Resolution: reuse, Close blocked, pass verification, close (30 s)
→ Insights: three columns and N/A (10 s).

## Likely questions, short answers

- **Why a graph?** The answers are relationship questions: which vehicles hold parts from this lot,
  which verified fix connects to this defect and part, which team is confirmed causal versus
  reporting. Those are traversals over lots, origins, installations, fixes and verifications.
- **Is that real Neo4j?** Yes, Aura. Health endpoint says graph services; the acceptance runner
  refuses to run against the in-memory double; 22/22 before and 23/23 after a restart.
- **What about AI?** Optional. The assistant uses a labelled deterministic planner with read-only
  server tools; a live model needs a configured key and never confirms causes or closes issues.
- **What is not built?** CSV import in graph mode only records a revision marker; late-evidence
  correction is not wired; supplier rates need an inspection cohort we have not seeded; robotics
  regression fixture is not loaded into Neo4j.

## If something breaks

- Badge says "backend unreachable": Aura paused or credentials wrong. Run `npm run neo4j:check`.
  Free Aura instances pause after inactivity; open the console and resume, then reload.
- A form refuses with INVALID_REFERENCE: a sketch-only part was marked; remove it and save.
- STALE_VERSION banner: someone else saved; click "Reload latest" and redo the edit.
- Total failure: show `docs/evidence/BROWSER_ACCEPTANCE_RUN_2026-09-12.md` and the screenshots,
  and say plainly that this is a recording of the same flow.
