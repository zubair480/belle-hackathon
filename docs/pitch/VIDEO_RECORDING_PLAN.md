# Video recording plan (3 minutes, graph-backed build)

Deck: `docs/pitch/RecallRadius_Judge_Deck.pptx` (10 slides, speaker notes inside each slide).
Slides 3 to 6 carry public industry figures (Warranty Week, WardsAuto, NHTSA, analyst market
estimates); each of those slides names its source in the footer and says "not our measurements".
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

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 to 0:15 | Slide 1 | "RecallRadius. One EV fails final inspection. Where did the part come from, and has anyone fixed this before? All records in this demo are synthetic." |
| 0:15 to 0:30 | Slide 2 | "The buyer is the head of quality at an EV assembler that buys some parts and makes others. Today the receipt, the manufacturing lot, the last fix and its verification live in four systems, and the team that found the defect gets the blame." |
| 0:30 to 0:50 | Slides 3 and 4 | "This is not a small problem. Forty global carmakers paid fifty-eight billion dollars in warranty claims in 2024, and the claims rate rose from 1.9 to 2.2 percent in one year. Every EV maker pays it, Rivian's claims grew sixty-two percent, and electrical systems lead US recalls. Public figures, not ours." |
| 0:50 to 1:05 | Slides 5 and 6 (optional in the 3-minute cut; keep for the judges' deck) | "Cost of poor quality runs five to thirty percent of revenue. We take cost out on three lines: investigation time, repeated issue families, and verified fix reuse. Those are the three numbers a pilot measures, and pricing follows them." |
| 1:05 to 1:20 | App, Vehicles, DEMO-EV-005, tap the charge port | "Both origins come from the graph: the connector was bought, lot DEMO-SUP-LOT-01; the bracket was made in-house, lot DEMO-MFG-LOT-01, work order WO-DEMO-0001. Parts without a record say so. We never invent provenance." |
| 1:20 to 1:40 | App, Report issue, fill, Save, press F5, assign to In-house Manufacturing | "Report from the part. No CSV, no alert, no model call. Saved as version one in Neo4j. Reload: same record, with its audit entry. Assign it." |
| 1:40 to 1:55 | App, Investigation, record confirmed in-house cause | "A reviewed cause assessment: confirmed, in-house manufacturing, bracket forming. The header now shows three separate facts: who reported, who is assigned, who is confirmed causal. The supplier stays linked, not blamed." |
| 1:55 to 2:25 | App, Resolution: reuse FIX-BRKT-PRIOR-V1, Save proposal, Close disabled, Mark applied, Fail, Pass, Close | "The graph walks issue, fix and verification relationships and finds the bracket fix verified on DEMO-EV-002, with why it matched and its limits. Reuse creates a new proposal; the original is never edited. Close is blocked until this vehicle passes its own check. First verification fails, the failure is kept. Second passes. Close." |
| 2:25 to 2:35 | App, Team & supplier insights | "Final Inspection reported it and caused none. In-house Manufacturing caused it and reported none. The supplier rate reads N/A because there is no complete inspection cohort. We show N/A, not zero." |
| 2:35 to 2:50 | Slides 8 and 9 | "Why Neo4j: these are relationship questions over lots, origins, installations, fixes and verifications. Twenty-two of twenty-two HTTP acceptance steps pass against the live Aura instance, twenty-three of twenty-three after a server restart, and the runner refuses to run against the in-memory double." |
| 2:50 to 3:00 | Slide 10 | "Not built: CSV import in graph mode, late-evidence correction, supplier cohorts. AI is optional and off by default. The ask: one bounded pilot with three measured numbers. Thank you." |

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

Update the numbers on slide 9 only from `docs/evidence` or a live `GET /api/insights`. The
industry figures on slides 3 to 6 come from the sources named in each footer; change them only
with a newer edition of the same source.
