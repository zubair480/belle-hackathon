# RecallRadius: EV vehicle assembly scope

Decision recorded September 12, 2026. This is the current product scope. Read it with the shared and individual prompts. It supersedes the robotic-arm and standalone automotive-component positioning in earlier material.

## Product and customer

Build an issue, investigation and reusable-resolution workspace for an **electric passenger-vehicle manufacturer/assembler**. The plant buys some components from suppliers, manufactures others in-house, combines them into subassemblies, and assembles finished vehicles. The buyer hypothesis is the plant's head of quality or manufacturing operations; users include operators, incoming quality, in-house manufacturing, assembly, supplier quality and final inspection.

Pitch: **RecallRadius helps EV assembly teams trace problems across purchased parts, in-house manufacturing and finished vehicles, then reuse verified fixes to prevent repeated work.** Operational savings and willingness to pay remain pilot hypotheses.

The product covers the whole vehicle's assembly context. The one-day demo implements one bounded component/subassembly path, not a complete vehicle BOM or factory digital twin. Operators must be able to create, annotate, assign, investigate and save issues without an external dataset or model call.

## Purchased and internally manufactured parts

| Path | Example in the synthetic demo | Required provenance |
| --- | --- | --- |
| Purchased | Charge-port connector supplied in batch DEMO-SUP-LOT-01 | Supplier, supplier part/revision, batch, received component serial, receipt/inspection evidence |
| Made in-house | Connector mounting bracket produced in lot DEMO-MFG-LOT-01 | Internal part/revision, manufacturing lot, work order, site/process, manufacturing team, inspection evidence |
| Assembled in-house | Charge-port module combining the connector and bracket | Actual child serials, parent module serial, slots and installation/removal times |
| Finished vehicle | Module installed into DEMO-EV-005 | Internal vehicle build ID, actual module installation and current location; VIN is optional when not yet assigned |

These are fictional demonstration identifiers. They are not records about Hyundai, Ford or a real supplier. Do not invent real VINs or claim source documents prove our synthetic factory relationships.

Store origin at batch/physical-instance level because the same part number can be bought in one lot and made internally in another. A subassembly made in-house can contain purchased children. A maker, assembly team or process owner is not automatically a confirmed cause of a defect.

Proposed contract version: **assembly-quality-v4**. Zubair must publish the agreed source schemas before Codey and Ali depend on them. This docs update does not implement that migration. Retain existing issue lifecycle/service names; extend the shared contract with:

- `ProductionOrigin`: `sourcingType` = `supplier | in_house | unknown`; producer ID, part number/revision and production lot ID.
- Supplier origin: supplier ID, supplier batch code and evidence. Internal origin: site ID, manufacturing lot, work order ID, process step and manufacturing team. Keep unknowns explicit; do not disguise an internal team as a supplier.
- `EntityKind`: `component | subassembly | vehicle`; a vehicle has an internal build ID and nullable VIN. Keep displayed identifiers separate from entity IDs.
- Trace roots: `supplier_batch | manufacturing_lot | component_serial`. Use vehicle counts instead of robot counts.
- Cause type `in_house_manufacturing` alongside supplier component, assembly process, design, calibration, handling and unknown. A reviewed cause determines attribution independently of sourcing.
- Public evidence origin/provenance, source record ID, source URL and retrieval date; preserve the distinction between an alleged complaint, documented recall remedy and locally verified resolution.

The P0 manufacturing-lot relationship is lot -> produced component serial. A material-consumption history across multiple transformation steps is later work; do not represent manufacturing transformation as physical installation.

## One-day demonstration

All factory records in this story are synthetic. Work instructions are named placeholders, not real repair procedures or engineering specifications.

1. Final Inspection reports that the charge-port connector is misaligned on DEMO-EV-005. The operator creates an issue and marks its module, component and station in the app.
2. The graph exposes both paths: purchased connector -> supplier batch, and mounting bracket -> in-house manufacturing lot -> work order/process. Both are investigation context, not fault conclusions.
3. Quality reviews the evidence and confirms a bracket manufacturing issue in this synthetic case. Final Inspection remains the reporter; In-house Manufacturing becomes the confirmed causal team. The connector supplier remains linked without a confirmed fault.
4. The app retrieves a previous verified bracket issue with a compatible part revision/process. The engineer reviews its applicability and creates a new fix proposal linked to the previous resolution.
5. A user records corrective work under an approved work-instruction reference and a new passed verification. The issue closes and survives reload; a subsequent issue can retrieve the resolution.
6. A manufacturing-lot query identifies other recorded components/modules/vehicles for review. A separate seeded supplier-caused issue demonstrates the supplier path and evidence-linked analytics. Two suspect components in one vehicle count as one affected vehicle.

P0: complete the saved issue -> reviewed prior fix -> new verification -> reusable knowledge loop, with one purchased path and one internal-production path visible. P1: deeper current/historical containment, replacement and late-evidence comparisons. Keep counts and drilldown usable even when inspection denominators are unknown. Closing a ticket does not automatically release a vehicle for shipment.

## Public EV data and its limits

Use NHTSA as supplemental external knowledge. The 2022 Hyundai IONIQ 5 endpoints returned **404 complaint records and 3 recall records** when checked on September 12, 2026. Those are all-component endpoint totals, not counts of confirmed assembly defects or charge-port failures. Recheck on ingestion and store the retrieval date.

- [IONIQ 5 complaints](https://api.nhtsa.gov/complaints/complaintsByVehicle?make=hyundai&model=ioniq%205&modelYear=2022): citizen/owner reports, symptoms and component categories.
- [IONIQ 5 recalls](https://api.nhtsa.gov/recalls/recallsByVehicle?make=hyundai&model=ioniq%205&modelYear=2022): campaign IDs, descriptions and published remedies.
- [NHTSA datasets and manufacturer communications](https://www.nhtsa.gov/nhtsa-datasets-and-apis): bulk files, investigations and technical communications.
- [vPIC](https://vpic.nhtsa.dot.gov/api/): vehicle specifications/VIN decoding, not a complete per-vehicle BOM.

Start with a small reviewed EV subset and preserve stable source IDs. Public records can support related-evidence search; matching a symptom or model/year is not proof of the same cause, applicable recall, supplier batch or installed part. A published remedy is not proof that a local repair passed verification. Public data does not supply our internal team history, actual component genealogy or inspection denominator. Do not join a public complaint to a synthetic vehicle as an actual occurrence.

The earlier Ford Explorer camera example remains historical research. It is not the selected EV factory or the new primary demo. Existing robotics reference scripts under `docs/reference/assembly` and `docs/reference/quality` remain regression examples for temporal tracing, deduplication and attribution arithmetic. Codey must create separately labelled EV fixtures before the EV demo; merely relabelling a robot output is not an EV implementation test.

## Hackathon alignment verified from the event page

The official brief describes AI-native software development and agentic engineering and explicitly leaves the challenge open-ended. **No EV-specific theme or EV track was found in the reviewed event page and organizer track descriptions.** EV manufacturing is our chosen application domain. Do not present it as an organizer requirement.

Enter **Track A: Builder**, using Qoder IDE in actual development, and pursue the separate Neo4j bonus. The organizer asks for meaningful graph use and lists agent memory, a Neo4j-backed agent, GraphRAG and Aura/MCP as possible bonus directions. They are not all mandatory features.

| Judging dimension | Demonstrate |
| --- | --- |
| Qoder/AI use, 25% | Actual Qoder-assisted planning, implementation or testing; the optional in-app agent explains retrieved evidence through server tools |
| Technical execution, 25% | A real persisted manual issue, verification-gated closure and retrieved resolution with mocks disabled |
| Innovation, 20% | Reusable issue knowledge connected to both purchased and internally made components and their vehicle context |
| Impact, 15% | A named quality-manager buyer and a pilot measuring investigation time, repeated issues and verified fix reuse |
| Story, 15% | One EV fails inspection; evidence locates the problem, a reviewed fix is reused, and other recorded vehicles are identified for review |

Neo4j should answer actual relationship questions: which vehicles contain components from this supplier or manufacturing lot; which compatible verified resolution exists; and which process has repeated confirmed defects? Use server-side, bounded, parameterized queries. The frontend agent explains records and proposes drafts; human users confirm causes, fixes and operational decisions.

Source checked in Chrome: [event page and organizer updates](https://luma.com/l74b4u7b?tk=gEueM2). Also retain the [organizer deck](https://www.canva.com/design/DAHUt_zVr_4/As1pUraRGt4HDH2EvCtBwA/view#11). EV environmental benefits are motivation, not measured emissions or safety claims. Deployment remains deferred.

## Ownership and final merge

Codey: supplier and internal-production provenance, EV reference fixtures, graph persistence/queries and attribution-aware analytics. Ali: EV assembly UI, sourcing labels, manual issue/fix journey and pitch. Zubair: v4 source-contract coordination, APIs, agent tools, integration and acceptance checks. Reuse the existing scaffold and assigned feature branches; merge feature implementations only at the end under Zubair. No lane independently changes shared fields.
