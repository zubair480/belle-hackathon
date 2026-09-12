# Pitch materials (Ali's lane)

- `SLIDES.md`: five-slide outline with speaker notes and the visual for each slide.
- `SCRIPT_3MIN.md` and `SCRIPT_90S.md`: demo scripts. Three minutes is a preparation target, not a verified limit.
- `screenshots/`: captured on September 12, 2026 from the dev server in **mock mode** (12-17 with the deterministic stub planner, no model) (`NEXT_PUBLIC_RECALL_UI_MOCKS=true`, branch `codex/ali-ui-pitch`, viewport 1440x900, headless Chromium). Every screen carries the "Sample data (mock mode)" banner. Recapture from the integrated build with mocks disabled before submitting.

| File | Shows |
| --- | --- |
| `01-vehicles.png` | Vehicles view: three sketched models, DEMO-EV-005 sketch, parts grouped by sourcing |
| `02-chargeport-zoom.png` | Zoom into the charge-port module; connector and bracket sub-sketch revealed |
| `03-connector-supplier.png` | Purchased connector: supplier, batch DEMO-SUP-LOT-01, receipt evidence, containment path |
| `04-bracket-inhouse.png` | In-house bracket: lot DEMO-MFG-LOT-01, work order, process, team (producer, not cause) |
| `05-new-issue-form.png` | New Issue form prefilled from the selected part |
| `06-issue-detail.png` | Saved issue: four attribution labels, affected items with origins, public evidence labelled |
| `07-resolution-prior-fix.png` | Similar-resolution panel with the prior verified bracket fix ranked first |
| `08-reuse-proposal.png` | Editable proposal copied from the prior fix, "Proposed from a verified prior resolution" |
| `09-proposed-fix.png` | Proposed fix saved; Close disabled until this issue's own verification passes |
| `10-insights.png` | Team and supplier insights with role-separated counts and N/A rates |
| `11-drilldown.png` | Metric drilldown listing the issues and evidence behind a count |
| `12-3d-vehicles.png` | 3D wireframe explorer (iso view), 56 recorded parts grouped by sourcing, open-issue markers |
| `13-3d-chargeport-zoom.png` | Zoom onto the charge-port module; connector and bracket children revealed, provenance rail |
| `14-3d-wiring-top.png` | Top view with the wiring overlay (HV orange, 12 V blue, signal green) |
| `15-chat-ignition-circuit.png` | Assistant: "Ignition does not respond on DEMO-EV-007" switches vehicle, highlights the start circuit, zooms to the start switch, lists the open issue |
| `16-chat-impact-customers.png` | Assistant: connector batch impact, vehicles on site / shipped and the customers that received them |
| `17-chat-markers.png` | Assistant: markers placed on bracket and connector, ready for "Open issue for marked items" |
| `18-3d-suv.png` | SUV body style (DEMO-EV-006) with its open issues on the sketch |
| `19-3d-sports.png` | Sports car body style (DEMO-EV-007) |
| `20-zoom-wire-hover.png` | Zoomed onto the start switch: attached wires revealed, hover tooltip on W-011 showing from/to, connectors, harness and circuit |
| `21-3d-outside.png` | Outside layer: perspective body shell with exterior parts only |
| `22-3d-inside.png` | (superseded: the Inside layer was removed; exterior-only sketch) |
| `23-3d-inside-zoom-wires.png` | Zoomed onto the fuse box inside: attached wires routed in lanes with connector dots |
| `24-3d-wiring-all-top.png` | All wiring from the top, inside layer |
| `25-new-issue-dialog.png` | Rebuilt New Issue dialog: sections, severity buttons, marked items, sticky footer summary |
| `26-real-tap-headlamp.png` | Real browser click on the left headlamp: zoomed, attached wires, hover tooltip on the bumper |
| `27-real-tap-chargeport.png` | Real browser click on the charge port from the full view: connector and bracket revealed |

Do not add customers, savings or accuracy claims. The judge kit in `docs/JUDGE_SUBMISSION_KIT.md` holds the 200-word description draft; Zubair submits.
