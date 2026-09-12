# RecallRadius judge submission kit

Prepared September 12, 2026 for the B.E.L.L.E / Qoder / Neo4j hackathon. This is preparation, not a submitted entry. The research reference harness is complete; an actual Qoder-built Neo4j application is still required before making those implementation claims.

## Entry and submission

Recommended entry: **Track A - Developers (Builder)** and the separate **Neo4j bonus**. The product centers on a working graph application. Track B is a Qoder Desktop Agent workflow track and would require a different demonstration.

Official sources: [organizer deck](https://www.canva.com/design/DAHUt_zVr_4/As1pUraRGt4HDH2EvCtBwA/view#11) and [live submission form](https://docs.google.com/forms/d/e/1FAIpQLSeFEB5HWuUGIKssCZD68Hl9ufNaU4abz-_hRJGbYMhlxt1jEQ/viewform), both inspected in Chrome during this research conversation.

| Item | What to prepare |
| --- | --- |
| Name and email | Your actual entrant details |
| Project title | RecallRadius |
| Description | Up to 200 words; use a truthful version of the draft below |
| Qoder use | Answer Yes only after real Qoder development work has been done |
| Track | A - Developers (Builder) |
| Neo4j use | Answer Yes only after the running application actually uses Neo4j |
| LinkedIn / X URL | A real public project post; required in the form and for prizes |
| GitHub URL | Optional field; recommended for README, code and demo links |

No dedicated video, slide or hosted-app field appeared in the form. Link these from the README. The deck lists 5:00 p.m. submission, 5:00-6:30 p.m. judging and 6:45 p.m. winners on September 12. It does not specify individual pitch length. The scripts below are preparation targets.

No maximum tool count was found. Use Qoder and Neo4j substantively, with one optional runtime extraction API. An ordinary application does not need every bonus example such as GraphRAG, agent memory or MCP. A deployment platform can be chosen later.

## One-line pitch

RecallRadius helps food co-packers trace a suspect ingredient through rework into customer shipments, exposing missing records before QA decides what to hold or investigate.

## Description draft

Use this prospective description while the product is being built. Before submission, revise it to accurately describe the features that actually work; do not convert unfinished plans into completed claims.

<!-- DESCRIPTION_START -->
RecallRadius is a proposed recall investigation workspace for food co-packers producing multiple customer brands. It traces a suspect ingredient through mixing, split batches and rework to identify candidate inventory holds and customer shipments for QA review.

The planned application uses Neo4j for material genealogy and Qoder IDE for development. AI proposes structured fields from supplier alerts; reviewed records and deterministic queries govern the trace. Every finding should expose its source evidence, while missing origins remain visible as unresolved scope.

Our synthetic demonstration follows one ingredient into three finished lots. A recovered rework record adds a fourth customer to the investigation, while preserving the earlier result. A product sharing only a pallet does not gain a material path.

The initial buyer is a co-packer's operations or quality leader. A paid pilot would test whether recurring record reconciliation and mock-recall preparation save enough staff time to justify adoption. RecallRadius supports investigation; QA retains authority over recall decisions, notices and stock disposition.
<!-- DESCRIPTION_END -->

The form has a 200-word limit. The draft is below that limit; count the edited final version again. If the application is complete, replace prospective language with precise demonstrated behavior and add actual usage evidence in the README.

## Three-minute demonstration

| Time | Show | Say |
| --- | --- | --- |
| 0:00-0:20 | Supplier alert and selected T17 identity | "A co-packer receives a supplier warning. That ingredient went into several brands, and some production was reworked. QA needs to know which records and shipments to investigate." |
| 0:20-1:05 | Confirmed alert fields, result table | "This accepted data revision shows 160 kg onsite and 120 kg shipped across three direct customers. These are investigation candidates, with evidence behind each row." |
| 1:05-1:45 | Expand F-C path; open the unresolved queue | "F-C receives this ingredient directly and through rework. We count its stock and shipment once. Another batch has a missing origin; we leave it unresolved instead of treating it as clear." |
| 1:45-2:30 | Accept late record and compare runs | "This recovered batch sheet connects that missing origin. Outbound scope grows to four customers and 180 kg. Onsite scope becomes 190 kg because the old WIP was consumed. The earlier run is preserved. Sharing a pallet still does not create an ingredient path for the control lot." |
| 2:30-3:00 | Graph query, Qoder evidence and buyer card | "Neo4j follows actual material relationships. Qoder helped build and test the application. The buyer is a co-packer's QA or operations leader; our next proof is a paid historical-data pilot measuring total time saved." |

The statements about Qoder, Neo4j and the running application are valid only after you implement and verify them. The current Python harness alone does not establish sponsor use.

## Ninety-second fallback

Spend 15 seconds on the co-packer's supplier-alert story, 25 on the initial table and one rework path, 30 on the late-record change and unresolved queue, and 20 on the real Qoder/Neo4j contribution and paid-pilot hypothesis. Skip graph animations and generic AI chat.

Keep an offline recording and reproducible fixture available. Clearly label a recording as a recording, and any simulation as a simulation. Do not present a seed script as a live importer or a precomputed answer as a live database trace.

## Rubric evidence to capture

| Criterion | Weight | Concrete proof |
| --- | --- | --- |
| Qoder / AI use | 25% | Two or three accepted Qoder development tasks; one reviewed extraction flow if built |
| Execution | 25% | Working import/review/trace path; real database tests; fallback and error states |
| Innovation | 20% | Evidence gaps plus reproducible scope changes across split/reworked lots |
| Impact | 15% | Named buyer and a bounded paid pilot with measurable operational outcomes |
| Story | 15% | Supplier warning, missing record, new customer scope, preserved earlier answer |
| Neo4j bonus | Separate | Actual many-to-many lineage traversal with event witnesses and changed results |

The numerical rubric is from the organizer deck. The suggested proof items are recommendations, not extra official requirements.

## README outline

1. Product problem, buyer and one-line pitch.
2. Run instructions, environment variable names and seeded synthetic case.
3. Working demo link and short backup recording, if available.
4. Event/lot diagram and explanation of material traversal versus pallet membership.
5. Reference expectations and actual application test results, distinguished from Python-only results.
6. Qoder contribution with specific accepted changes and Neo4j query evidence.
7. Scope: evidence-driven candidates, unresolved records, QA authority and unimplemented features.
8. Pilot proposal and primary research links.

Never commit secrets or real customer production records. All fixture names and quantities in the prepared demo are synthetic.

## Likely judge questions

**Why Neo4j?** Actual inputs and outputs create changing many-to-many relationships. The demonstration requires several hops, shared descendants, event witnesses and an explainable change when a missing link arrives. SQL could implement this too; the reason to use a graph is a direct, inspectable model of the problem.

**Is this already available?** Lot traceability and recall tools already exist, including Wherefour and FoodLogiQ. The proposed difference is a constrained overlay for reconciling incomplete records across systems and preserving uncertainty and changes. Customer pilots must prove that advantage.

**Why would anyone subscribe before a recall?** Recurring import reconciliation, brand traceability requests and mock-drill preparation. Emergency-only usage is a weak subscription proposition. Measure the frequency and total effort before setting the subscription price.

**What happens when records are missing?** Relevant lots stay in an unresolved queue. A missing link cannot be interpreted as proof of safety. The user sees the investigation boundary and the records needed to resolve it.

**Does a shared pallet spread the trace?** It does not establish material incorporation. Possible cross-contact is a separate QA assessment and can broaden an incident's scope. The product does not certify the control lot as safe.

**Can AI invent a link?** Its output is a proposal with source evidence. Accepted identities and manufacturing relationships require review and validation. Deterministic traversal uses those accepted records.

**What is verified today?** The research and synthetic Python reference case, with 22 passing checks. Update this answer after actual Qoder development, Neo4j integration and application testing; report only what has been executed.

## Proposed paid-pilot offer

Test $1,500 for four weeks at one facility, two agreed export formats and five historical challenge cases, with a designated customer QA reviewer. Deliver an import mapping, exceptions, reproducible trace reports and a measured mock-drill comparison. Quote specialist review separately if needed. These are proposed terms, not an accepted sale or established market price.

Measure onboarding hours, mapping reuse, missing-record detection, reviewer-confirmed shipment scope, quantity reconciliation and full task time. Do not claim avoided recalls, prevented illnesses, guaranteed compliance, unique market ownership or unmeasured speed.
