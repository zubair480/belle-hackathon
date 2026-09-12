# RecallRadius judge deck (five slides)

Prepared by Ali for Zubair to submit. Track A Builder, plus the separate Neo4j bonus. EV assembly is our chosen domain, not an organizer track. Every claim below is either observed in this repository (see `docs/handoffs/ALI.md` for the exact checks) or explicitly marked as a hypothesis. Nothing in the demo is a real factory record.

---

## Slide 1: The buyer and the problem

**Title:** One EV fails final inspection. Where did the part come from, and has anyone fixed this before?

- Buyer hypothesis: head of quality or manufacturing operations at an EV vehicle assembler that buys some components and makes others in-house.
- Users: final inspection, assembly, in-house manufacturing, supplier quality, quality engineering.
- Problem: an issue found on the line touches a purchased connector and an internally made bracket. The receipt, the manufacturing lot, the earlier fix and the verification live in different records and different teams. The team that found the defect often gets blamed for it.
- What we are not claiming: no measured savings, no customers, no market-size figure. Manufacturing traceability exists in MES products; we test a narrower advantage.

Visual: `screenshots/12-3d-vehicles.png` (3D wireframe, parts grouped by "Bought from supplier / Made in-house / Unknown origin"); older 2D capture in `01-vehicles.png`.

---

## Slide 2: The manual issue workflow

**Title:** Report from the sketch, save a real record, assign it.

- Tap the charge-port module on the DEMO-EV-005 sketch; the app zooms in and shows the purchased connector (supplier, batch DEMO-SUP-LOT-01, receipt evidence) next to the in-house bracket (lot DEMO-MFG-LOT-01, work order, process, manufacturing team).
- "Report issue on this part" prefills the marked items. No CSV, no supplier alert, no model call is needed to save an issue.
- The saved record shows four separate labels: reported by, currently assigned to, detected at station / process owner, confirmed causal team. Build ID works before a VIN exists.
- Backend failure keeps the draft and the idempotency key; it never shows fake success.

Visual: `screenshots/13-3d-chargeport-zoom.png`, `screenshots/05-new-issue-form.png`, `screenshots/06-issue-detail.png`.

Assistant (harness on the Qoder Agent SDK): "Ignition does not respond on DEMO-EV-007" switches the sketch to that vehicle, highlights the start circuit and its six wires with connectors, zooms to the start switch and lists the open no-wake issue. "Who did we supply with parts from this connector batch?" runs the assembly trace and names the fleet and dealer that received vehicles from the same batch. "Circle the bracket and the connector" places markers that flow into the New Issue draft. In the recorded demo the deterministic stub planner ran; say so unless the Qoder planner was exercised with a token. Visual: `screenshots/15-chat-ignition-circuit.png`, `16-chat-impact-customers.png`, `17-chat-markers.png`.

---

## Slide 3: Why a graph (Neo4j)

**Title:** Issues, parts, lots, teams, fixes and evidence are one connected record.

Relationship questions the workspace asks the server (contract `assembly-quality-v4`):

1. Which recorded components, modules and vehicles come from this supplier batch or manufacturing lot? (`GET /api/entities/:id`, trace roots `supplier_batch | manufacturing_lot | component_serial`)
2. Which prior fix was verified on a compatible defect code, part revision and process step? (`GET /api/issues/:id/similar-resolutions`, verified fixes ranked first, with match reasons and applicability warnings)
3. Which team has confirmed causes, separately from who reported and who is assigned? Which supplier is linked versus confirmed at fault? (`GET /api/insights`, every count carries its issue ids for drilldown)

Rules the server enforces: status lifecycle, `expectedVersion` on edits, idempotency keys, closure only with a passed verification of the applied fix. Hypotheses never enter confirmed-cause counts.

The platform wiring design (56 part slots, 12 circuits, 45 wires) ships as a Neo4j import in `frontend/data/ev-platform/neo4j/` with example Cypher in its README. Cypher and persistence are Codey's lane; paste the actual queries from `docs/handoffs/CODEY.md` here before submitting. Do not show this slide as "Neo4j-backed" until the integrated run with mocks disabled has passed.

Visual: the relationship diagram from `docs/TECHNICAL_BLUEPRINT.md` (supplier batch -> connector serial; work order -> lot -> bracket serial; both -> module -> EV build; evidence supports).

---

## Slide 4: Verified reuse and honest analytics (the demo)

**Title:** A verified fix becomes a proposal, not a solution, until this vehicle passes its own check.

- The similar-resolution panel returns the prior bracket fix from DEMO-EV-002 with its verification date, "why it matched" (same defect code, same part number) and its limits (revision A only, one synthetic vehicle).
- Reuse creates an editable proposal labelled "Proposed from a verified prior resolution". Close stays disabled. Apply, record a failed verification (issue stays open), record a passed verification, close.
- A later issue retrieves the new resolution.
- Insights: Final Inspection has reported issues and zero confirmed causes; In-house Manufacturing has one confirmed cause and zero reports. The connector supplier is linked to two issues, confirmed at fault on one, with a rate only because a complete inspection cohort exists; the lighting supplier shows N/A.

Visual: `screenshots/07-resolution-prior-fix.png`, `screenshots/09-proposed-fix.png`, `screenshots/10-insights.png`, `screenshots/11-drilldown.png`.

---

## Slide 5: What we built today and the next proof

**Title:** Working loop today, bounded paid pilot next.

Observed in this repository on September 12, 2026 (mock mode; see handoff for the exact commands):

| Check | Result |
| --- | --- |
| TypeScript typecheck | passed |
| Vitest: 16 contract tests (foundation) + 16 UI tests (Ali) | 32 passed |
| Production build (`next build`) | passed |
| Browser run of create -> detail -> reuse -> proposed fix, insights drilldown | screenshots captured, no console errors |

Not yet verified: real Neo4j persistence, the HTTP routes, and the integrated run with mocks disabled. Those are Codey's and Zubair's lanes and the final merge gate.

Next proof: a one-site pilot with one process/part family, a named quality reviewer, and three measured numbers: investigation time per issue, repeated issue families, and verified fix reuse. Pricing follows those numbers, not the other way round.

Tooling: Qoder was the development IDE for this hackathon; list the actual Qoder-assisted sessions (planning, implementation, tests) with dates in the submission. Do not list a session that did not happen.
