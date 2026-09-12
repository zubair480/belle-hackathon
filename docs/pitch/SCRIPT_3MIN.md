# Three-minute demo script

Target, not a verified pitch limit. Run the app in the integrated build with mocks disabled if the final merge passed; otherwise say "sample data" out loud at the start. Every sentence below is something the app actually shows on this branch.

**0:00 – 0:20 · The problem (slide 1)**
"Final Inspection just found a charge-port connector sitting proud on vehicle DEMO-EV-005. The connector was bought from a supplier. The bracket it sits on was made in-house. Today the receipt, the manufacturing lot, the last fix and its verification live in four different places, and the team that found the defect usually gets the blame. RecallRadius connects those records so the plant can trace the problem and reuse a verified fix."

**0:20 – 0:55 · Report from the sketch (Vehicles view)**
Click the sedan. "Three synthetic models; white sketches, black background. Every drawn part is coloured by its recorded origin: blue bought from a supplier, purple made in-house, yellow unknown." Tap the charge port. "It zooms in. Here is the purchased connector with its supplier batch and receipt evidence, and the in-house bracket with its lot, work order, forming process and manufacturing team, labelled producer, not cause." Click Report issue on this part. "The module, connector, bracket and build ID are prefilled. No CSV, no alert, no model call. The build ID works before a VIN exists." Save. "The record is stored and reloaded from the server. Four separate labels: reported by Final Inspection, currently unassigned, detected at Final Inspection, confirmed causal team not confirmed."

**0:55 – 1:35 · Prior verified fix (Resolution tab)**
"The graph query asks: which prior fix was verified on the same defect code, part and process step?" Point at the top card. "Verified on August 23 on DEMO-EV-002, issue ISS-BRKT-PRIOR. Why it matched: same defect code, same part number. Its limits: revision A brackets only, verified on one vehicle. Below it, the supplier connector fix ranks lower because it only shares the defect family." Click Reuse. "This creates an editable proposal linked to the source. The label says Proposed from a verified prior resolution. Close is disabled. The old fix is never edited."

**1:35 – 2:10 · Verification-gated closure**
Start work, mark applied. "Record a failed verification: the issue stays open for work and the failure is kept." Record a pass. "Now, and only now, Close is enabled with the verified fix. Reopen keeps the whole history." Open History. "Every step is an audit event with an actor and time."

**2:10 – 2:40 · Honest analytics (Insights)**
"Reported, assigned and confirmed-cause counts are separate columns. Final Inspection reports three issues and caused none. In-house Manufacturing reported none and has one confirmed cause. The connector supplier is linked to two issues, confirmed at fault on one; the rate exists only because we have a complete inspection cohort of 80 units. The lighting supplier shows N/A, not zero." Click a count. "Every metric opens the issues and the evidence behind it."

**2:40 – 3:00 · Engineering and next proof (slides 3 and 5)**
"Neo4j holds issues, serials, lots, teams, cause assessments, fix versions, verifications and evidence as one connected record; the server enforces transitions, versions and verification before closure. We developed in Qoder; the actual sessions are listed in the submission. Next proof is a one-site pilot measuring investigation time, repeated issues and verified fix reuse. Engineering keeps authority over dispositions; closing a ticket does not release a vehicle."
