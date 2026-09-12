# Video recording plan (3 minutes, graph-backed build)

Deck: `docs/pitch/RecallRadius_Judge_Deck.pptx` (4 slides, speaker notes inside each slide).
Slides 1 and 2 take fifteen seconds before the live demo, slides 3 and 4 fifteen seconds after it. Slide 2 carries public
industry figures (Warranty Week, WardsAuto, NHTSA) and says "not our measurements" in its footer.
Demo path: `docs/pitch/DEMO_RUNBOOK_GRAPH.md`. Every number in the deck was observed on the
shared Aura instance or in `docs/evidence` on 2026-09-12. Say "synthetic data" once, early.

## Setup (10 minutes before you press record)

1. Terminal in the repo:
   ```bash
   npm run neo4j:check
   ```
   must print `connected`. Then make sure the dev server is up (`npm run dev`, or the running one
   on port 3111) and `http://localhost:3111/api/health` shows `"servicesMode":"graph"`.
2. Open the app. The top bar must read **Live API · Neo4j graph services**. If it reads
   "service double", stop and fix `.env.local`.
3. Optional reset so the counts on screen match the deck (Final Inspection 1 / 0, In-house
   Manufacturing 0 / 1, supplier linked 1 · confirmed 1 · rate N/A):
   ```bash
   npm run neo4j:cleanup-acceptance
   ```
4. Open the deck in PowerPoint in Slide Show mode on one half of the screen, browser on the other
   half. Or record in two passes (slides, then app) and cut them together. Windows: `Win+Alt+R`
   (Xbox Game Bar) or OBS. Record at 1920×1080, browser zoom 110 to 125 percent so the badge and
   panel text are legible.
5. Close other tabs, silence notifications, and keep a second app tab ready only if you want the
   stale-edit moment (not needed for the 3-minute cut).

## Shot list and voiceover

Thirty seconds of slides in total. Fifteen seconds up front, two and a half minutes in the app, fifteen seconds to close.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 to 0:08 | Slide 1 | "RecallRadius. One EV fails final inspection. Where did the part come from, has anyone fixed this before? Synthetic data throughout." |
| 0:08 to 0:15 | Slide 2 | "Warranty is fifty-eight billion a year across forty carmakers and rising. We work on the step between finding a defect and proving the fix." |
| 0:15 to 0:40 | App, Vehicles, DEMO-EV-005, tap the charge port | "The connector was bought, lot DEMO-SUP-LOT-01. The bracket under it was made in-house, lot DEMO-MFG-LOT-01. Both come from the graph. Parts without a record say so; we never invent provenance." |
| 0:40 to 1:10 | App, Report issue, fill, Save, press F5, assign to In-house Manufacturing | "Report from the part. No CSV, no alert, no model call. Saved as version one in Neo4j. Reload: same record, with its audit entry. Assign it." |
| 1:10 to 1:35 | App, Investigation, record confirmed in-house cause | "A reviewed cause assessment: confirmed, in-house manufacturing, bracket forming. The header now separates who reported, who is assigned, who is confirmed causal. The supplier stays linked, not blamed." |
| 1:35 to 2:20 | App, Resolution: reuse FIX-BRKT-PRIOR-V1, Save proposal, Close disabled, Mark applied, Fail, Pass, Close | "The graph walks issue, fix and verification relationships and finds the bracket fix verified on DEMO-EV-002, with why it matched and its limits. Reuse creates a new proposal; the original is never edited. Close is blocked until this vehicle passes its own check. First verification fails and the failure is kept. Second passes. Close." |
| 2:20 to 2:45 | App, Team & supplier insights, then History tab | "Final Inspection reported it and caused none. In-house Manufacturing caused it and reported none. Supplier rate N/A, because there is no complete inspection cohort. We show N/A, not zero. And the whole trail is in History." |
| 2:45 to 2:53 | Slide 3 | "Relationship questions, so a graph. Twenty-two of twenty-two acceptance steps against live Aura, twenty-three after a restart." |
| 2:53 to 3:00 | Slide 4 | "Not built: CSV import in graph mode, supplier cohorts. AI off by default. The ask: one bounded pilot. Thank you." |

## Rules for the narration

- Say "synthetic" once at the start; never call anything a real factory record.
- Do not say "AI-powered" or "Qoder-built". The assistant ran a labelled deterministic planner;
  Qoder use is not evidenced from the backend lane.
- If the app breaks mid-recording, cut, run the fallback in the runbook, and record again. Do not
  narrate over a mocked screen as if it were live.

## After recording

- Upload the video where the form asks; keep the deck as PDF too (PowerPoint: File > Export).
- Submission form and any social post still need Zubair's explicit go; nothing is sent from here.

## Regenerating the deck

The generator is `docs/pitch/deck-source/build-deck.js` (pptxgenjs). Install pptxgenjs in any
folder, then:

```bash
node docs/pitch/deck-source/build-deck.js docs/pitch/RecallRadius_Judge_Deck.pptx
```

Update the product numbers on slide 3 only from `docs/evidence`. The industry figures on slide 2
come from the sources named in its footer; change them only with a newer edition of the same source.
