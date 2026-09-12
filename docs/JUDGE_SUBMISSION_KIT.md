# RecallRadius judge kit - EV vehicle assembly

> Current domain: **EV vehicle assembly**, including purchased components and parts manufactured in-house. Read [EV assembly scope](EV_ASSEMBLY_SCOPE.md) for the demo, sourcing model, public data and verified hackathon fit. The proposed contract is `assembly-quality-v4`; source migration and EV fixtures are still implementation work. Earlier robotics fixtures remain labelled regression examples, not the EV demo.

Active scope: `assembly-quality-v4`. The primary story is internal issue creation, verified resolution reuse and team/supplier insights for EV vehicle assembly. This is preparation; nothing has been submitted by this update. Synthetic reference checks are not proof of a working application.

## Pitch

RecallRadius helps EV assembly teams trace problems across purchased parts, in-house manufacturing and finished vehicles, then reuse verified fixes to prevent repeated work.

The buyer hypothesis is a manufacturing quality or operations leader at an EV vehicle assembly plant that buys components and manufactures other parts in-house. Operators can report issues directly in the app; imports and supplier bulletins are additional sources. The product connects an issue to its part/assembly, reporting and responsible teams, reviewed cause, fix and verification.

## Hackathon fit

Recommend Track A - Developers (Builder), plus the separate Neo4j bonus. Actual issue-to-part-to-process relationships and verified fix retrieval justify the graph; assembly traversal supplies additional context. Capture genuine Qoder development contributions. Optional AI structures reports or explains graph-retrieved fixes, while reviewed records and deterministic rules govern the workflow.

The Builder rubric weights Qoder/AI use and execution at 25% each, innovation at 20%, and impact and story at 15% each. Demonstrate a working manual issue lifecycle before adding breadth. Neo4j is a separate bonus rather than a third track. The proposed team/supplier analytics must remain evidence-linked product features, not unsupported AI judgments.

The live event brief is open-ended and focuses on AI-native software development and agentic engineering. No EV-specific track or required EV theme was found. Describe EV assembly as our chosen application domain. [Event page and organizer updates](https://luma.com/l74b4u7b?tk=gEueM2).

Sources carried forward from the verified event materials: [organizer deck](https://www.canva.com/design/DAHUt_zVr_4/As1pUraRGt4HDH2EvCtBwA/view#11) and [submission form](https://docs.google.com/forms/d/e/1FAIpQLSeFEB5HWuUGIKssCZD68Hl9ufNaU4abz-_hRJGbYMhlxt1jEQ/viewform). The form asks for a description up to 200 words, track and sponsor-use answers, contact details and a social-post link; GitHub is optional. Link the demo/recording from the repository README. Recheck the live instructions before submitting.

## Description draft

<!-- DESCRIPTION_START -->
RecallRadius is a proposed issue and learning workspace for EV vehicle assembly teams. Operators can report problems inside the app, mark affected parts or process locations, assign investigation and record verified resolutions.

The planned application uses Neo4j to connect issues, component serials, assembly relationships, teams, suppliers, causes, fixes and evidence. When a similar problem appears, it retrieves applicable verified fixes and explains their history. Reuse creates a new proposal that still needs verification in the current case.

Our synthetic demo follows an EV charge-port alignment issue through purchased-connector and in-house-bracket provenance, reviewed attribution, reuse of a prior verified fix and new verification before closure. The resulting knowledge remains available to the next team. Dashboards distinguish the team that detected a defect from its confirmed cause, and supplier links from confirmed supplier faults.

Qoder supports development; optional AI structures reports or explains retrieved evidence. The next proof is a bounded pilot measuring investigation effort, repeated issues and verified fix reuse. Engineering teams retain authority over disposition and operational actions.
<!-- DESCRIPTION_END -->

Revise prospective wording only after those features actually work. The existing reference script alone does not prove Qoder/Neo4j application use.

## Three-minute demo

| Time | Show and explain |
| --- | --- |
| 0:00-0:20 | Final Inspection finds an EV charge-port alignment issue. Show that an issue can be entered directly, without an import or supplier alert. |
| 0:20-0:55 | Create/save the issue on DEMO-EV-005; show the supplier connector and in-house bracket origins. Final Inspection remains the reporter; reviewed evidence determines responsibility. |
| 0:55-1:35 | Retrieve a compatible verified fix with its source issue, part revision and evidence. Reuse it as a new proposal. |
| 1:35-2:10 | Show recorded corrective work and a passed verification before closure. Reopen the saved record to show durable history. |
| 2:10-2:40 | Retrieve the fix for a later issue and drill into team/supplier counts. Explain reporting versus confirmed cause and counts versus rates. |
| 2:40-3:00 | Show the real Neo4j relationships, actual Qoder contribution and next paid-pilot hypothesis. |

Three minutes is a preparation target, not a verified individual pitch limit. Also prepare a 90-second version focused on manual issue creation, verified fix reuse and one evidence-linked insight. EV lot-impact and replacement views are optional after the primary flow works. The old encoder/robot fixture is a regression example, not the EV presentation.

## Five-slide outline

1. Buyer and problem: recurring assembly issues and fixes lost across teams and records.
2. Product: manually reported issue -> assigned investigation -> verified fix -> reusable knowledge.
3. Engineering: Neo4j links issues, serials, process steps, cause assessments and evidence; rules govern closure and reuse.
4. Demonstration: verified resolution reuse and team/supplier analytics with drilldown and honest attribution.
5. Next proof: a one-site pilot with a named reviewer and measured investigation effort, recurrence and fix reuse.

Manufacturing traceability already exists in MES products. Do not claim an empty market, guaranteed compliance, prevented failures or measured savings. Test the narrower advantage of reconciling fragmented records and exposing uncertainty. Pricing and demand need new validation for this industry.
