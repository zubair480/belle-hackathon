# Browser acceptance (separate from HTTP acceptance)

The HTTP runner (`npm run acceptance`) proves the API and database. This checklist proves the
operator workflow through Ali's `RecallWorkspace` in a real browser with mocks disabled
(`NEXT_PUBLIC_RECALL_UI_MOCKS=false`, `RECALL_SERVICES=graph`). Record each item as PASS / FAIL /
NOT RUN with a screenshot name. Do not mark PASS from the HTTP runner or from mock mode.

Preconditions: server started with real graph services; `GET /api/health` shows
`servicesMode: graph`, `servicesRegistered: true`; browser at the app root.

| # | Step in the browser | Expected | Result | Screenshot |
| --- | --- | --- | --- | --- |
| 1 | New issue form: fill title, reporting team Final Inspection, station Final Inspection, mark CPM-0005, CONN-0005, BRKT-0005, DEMO-EV-005, defect Connector misaligned, severity major; save | Detail page shows status open, version 1, created audit entry; no AI or import used | | |
| 2 | Reload the page (F5) | Same issue reloads from the server with identical fields | | |
| 3 | Detail: origin panel | Connector labelled "Bought from supplier" with batch code; bracket labelled "Made in-house" with lot, work order and team; vehicle shows build id and no VIN | | |
| 4 | Assign to In-house Manufacturing; open a second tab, assign again from the stale tab | First save succeeds; stale tab shows a stale-version error with draft preserved and a reload action | | |
| 5 | Record hypothesis (supplier) then confirmed cause (in-house manufacturing, bracket cell) | Cause list shows the hypothesis superseded and the confirmed cause current; header shows Reporter = Final Inspection, Assigned = In-house Manufacturing, Confirmed cause = In-house Manufacturing; supplier shown as linked, not confirmed | | |
| 6 | Similar resolutions panel | Prior verified bracket fix listed with match reasons, applicability warnings and verification evidence; no proposed fix shown as verified | | |
| 7 | Click reuse | New proposal created with state proposed and a link to the source fix; source issue still closed with its fix verified | | |
| 8 | Click close before verification | Blocked with a verification-required message | | |
| 9 | Record failed verification | Issue remains open; failure visible in history; close still blocked | | |
| 10 | Record passed verification, then close | Status closed; applied fix shows verified; audit shows the transition | | |
| 11 | Reopen | Status in_progress; close event and both verifications still visible | | |
| 12 | Create a later bracket issue and open its similar resolutions | The new verified resolution from step 10 is listed | | |
| 13 | Insights page | Final Inspection counted as reporter not cause; In-house Manufacturing counted as confirmed cause; connector supplier shows linked count > confirmed count and rate N/A; clicking a count opens the issues behind it | | |
| 14 | Trace supplier lot LOT-SUP-01 and manufacturing lot LOT-MFG-01 (if the assembly view is included) | Both list DEMO-EV-002..005; DEMO-EV-003 appears once although two modules are affected | | |
| 15 | Stop the server, start it again, open the issue URL from step 1 | Issue and full history load unchanged | | |
| 16 | Set `RECALL_AI_PROVIDER=none` and try the AI draft button | Clear "unavailable, enter manually" message; manual form still works | | |
| 17 | Stop the database and reload the issue list | Backend-unavailable state with a retry action; no sample data shown as success | | |

Run date, server SHA, browser and tester name:
