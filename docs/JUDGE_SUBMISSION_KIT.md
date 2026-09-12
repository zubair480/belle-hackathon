# RecallRadius judge kit - robotic assembly

Active scope: `assembly-quality-v3`. The primary story is internal issue creation, verified resolution reuse and team/supplier insights for robotic or physical assembly. This is preparation; nothing has been submitted by this update. Synthetic reference checks are not proof of a working application.

## Pitch

RecallRadius helps robotic and hardware assembly teams report production issues, reuse verified fixes and identify recurring process or supplier problems from connected evidence.

The buyer hypothesis is a manufacturing quality or operations leader at a robotic-arm assembler or hardware contract manufacturer. Operators can report issues directly in the app; imports and supplier bulletins are additional sources. The product connects an issue to its part/assembly, reporting and responsible teams, reviewed cause, fix and verification.

## Hackathon fit

Recommend Track A - Developers (Builder), plus the separate Neo4j bonus. Actual issue-to-part-to-process relationships and verified fix retrieval justify the graph; assembly traversal supplies additional context. Capture genuine Qoder development contributions. Optional AI structures reports or explains graph-retrieved fixes, while reviewed records and deterministic rules govern the workflow.

The Builder rubric weights Qoder/AI use and execution at 25% each, innovation at 20%, and impact and story at 15% each. Demonstrate a working manual issue lifecycle before adding breadth. Neo4j is a separate bonus rather than a third track. The proposed team/supplier analytics must remain evidence-linked product features, not unsupported AI judgments.

Sources carried forward from the verified event materials: [organizer deck](https://www.canva.com/design/DAHUt_zVr_4/As1pUraRGt4HDH2EvCtBwA/view#11) and [submission form](https://docs.google.com/forms/d/e/1FAIpQLSeFEB5HWuUGIKssCZD68Hl9ufNaU4abz-_hRJGbYMhlxt1jEQ/viewform). The form asks for a description up to 200 words, track and sponsor-use answers, contact details and a social-post link; GitHub is optional. Link the demo/recording from the repository README. Recheck the live instructions before submitting.

## Description draft

<!-- DESCRIPTION_START -->
RecallRadius is a proposed issue and learning workspace for robotic and hardware assembly teams. Operators can report problems inside the app, mark affected parts or process locations, assign investigation and record verified resolutions.

The planned application uses Neo4j to connect issues, component serials, assembly relationships, teams, suppliers, causes, fixes and evidence. When a similar problem appears, it retrieves applicable verified fixes and explains their history. Reuse creates a new proposal that still needs verification in the current case.

Our demo follows a manually reported joint-fastening issue through assignment, a prior verified resolution, corrective work and closure. The resulting knowledge remains available to the next team. Dashboards distinguish the team that detected a defect from its confirmed cause, and supplier links from confirmed supplier faults.

Qoder supports development; optional AI structures reports or explains retrieved evidence. The next proof is a bounded pilot measuring investigation effort, repeated issues and verified fix reuse. Engineering teams retain authority over disposition and operational actions.
<!-- DESCRIPTION_END -->

Revise prospective wording only after those features actually work. The existing reference script alone does not prove Qoder/Neo4j application use.

## Three-minute demo

| Time | Show and explain |
| --- | --- |
| 0:00-0:20 | Operator finds a joint-fastening issue. Show that an issue can be entered directly, without an import or supplier alert. |
| 0:20-0:55 | Create/save the issue, mark J005/R005 and assign Mechanical Assembly. Final Test remains the reporting team. |
| 0:55-1:35 | Retrieve a compatible verified fix with its source issue, part revision and evidence. Reuse it as a new proposal. |
| 1:35-2:10 | Show recorded corrective work and a passed verification before closure. Reopen the saved record to show durable history. |
| 2:10-2:40 | Retrieve the fix for a later issue and drill into team/supplier counts. Explain reporting versus confirmed cause and counts versus rates. |
| 2:40-3:00 | Show the real Neo4j relationships, actual Qoder contribution and next paid-pilot hypothesis. |

Three minutes is a preparation target, not a verified individual pitch limit. Also prepare a 90-second version focused on manual issue creation, verified fix reuse and one evidence-linked insight. The assembly replacement/late-certificate scenario is an optional deeper technical demonstration after the primary flow works.

## Five-slide outline

1. Buyer and problem: recurring assembly issues and fixes lost across teams and records.
2. Product: manually reported issue -> assigned investigation -> verified fix -> reusable knowledge.
3. Engineering: Neo4j links issues, serials, process steps, cause assessments and evidence; rules govern closure and reuse.
4. Demonstration: verified resolution reuse and team/supplier analytics with drilldown and honest attribution.
5. Next proof: a one-site pilot with a named reviewer and measured investigation effort, recurrence and fix reuse.

Manufacturing traceability already exists in MES products. Do not claim an empty market, guaranteed compliance, prevented failures or measured savings. Test the narrower advantage of reconciling fragmented records and exposing uncertainty. Pricing and demand need new validation for this industry.
