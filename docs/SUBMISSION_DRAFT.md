# Submission draft (prepared, NOT submitted)

Prepared 2026-09-12 for the B.E.L.L.E / Qoder / Neo4j hackathon form linked in
`docs/JUDGE_SUBMISSION_KIT.md`. External submission and any social post require Zubair's
separate instruction. Every claim below must be re-checked against `docs/handoffs/*.md` and the
acceptance report (`npm run acceptance` output) before the form is filled.

| Field | Value |
| --- | --- |
| Project title | RecallRadius |
| Track | A - Developers (Builder) |
| Neo4j bonus | Answer **Yes only if** the merged app ran the acceptance runner against real graph services (`mode: REAL graph services` in the report). Otherwise **No**. |
| Qoder use | Answer **Yes only if** Codey's/Ali's handoffs document actual Qoder-assisted development. |
| GitHub URL | https://github.com/zubair480/belle-hackathon |
| LinkedIn / X URL | required by the form; a post needs Zubair's explicit go |

## Description (keep under 200 words; verified-state version)

RecallRadius is an issue, investigation and reusable-resolution workspace for EV vehicle assembly plants that buy some parts and manufacture others in-house.

An operator reports a problem on a vehicle build, marks the affected module, component and station, and saves it with no import and no AI call. The issue shows both sourcing paths: the purchased charge-port connector back to its supplier batch, and the in-house bracket back to its manufacturing lot, work order and process. Quality reviews evidence and records the cause; the reporting team, the assigned team and the confirmed causal team stay separate, and a linked supplier is never a confirmed fault.

The graph retrieves a compatible prior verified fix with its reasons and evidence. Reuse creates a new proposal that needs its own verification; closure is blocked until a verification passes, and the original fix is preserved. Team and supplier insights drill down to the issues behind each count and show N/A when the inspection cohort is unknown.

[If verified: Neo4j persists the issues, genealogy and resolutions; Qoder was used for development.] All factory records in the demo are synthetic.

## Claims checklist (fill from actual results)

| Claim | Evidence required | Status |
| --- | --- | --- |
| Manual issue persists across restart | acceptance runner run twice with `--issue` after a server restart, REAL mode | unverified |
| Both origin paths on issue detail | runner steps "connector shows supplier origin" / "bracket shows in-house origin"; browser detail view | verified on double only (API + integrated UI) |
| Stale writes rejected, premature closure blocked | runner steps STALE_VERSION / VERIFICATION_REQUIRED | verified on double only |
| Fail then pass verification, closure, reopen history | runner steps 7-8 | verified on double only |
| Resolution retrievable from a later issue | runner step 9 | verified on double only |
| Linked supplier excluded, N/A rates | runner step 10 | verified on double only |
| Supplier-lot and manufacturing-lot traces, distinct vehicles | runner step 11 with the EV fixture revision | unverified (needs Codey's fixture) |
| Neo4j used substantively | Codey handoff + real integration suite output | unverified |
| Qoder used in development | Codey/Ali handoffs (Zubair's lane used Claude Code, not Qoder) | unverified |

## Three-minute demo (from the judge kit, EV story)

1. Final Inspection reports the misaligned charge-port connector on DEMO-EV-005 and marks the module, connector, bracket and vehicle.
2. Issue detail shows "Bought from supplier" for the connector and "Made in-house" for the bracket with lot, work order and team.
3. Quality confirms the bracket manufacturing cause; Final Inspection remains the reporter; the connector supplier remains linked, not confirmed.
4. The prior verified bracket fix is retrieved with match reasons; reuse creates a new proposal; the original stays verified.
5. A failed verification keeps the issue open; a passed verification closes it; reload shows the full history.
6. A later bracket issue retrieves the new resolution; insights show team and supplier counts with N/A where the cohort is unknown.

Backup: keep a recording of the same flow; label it as a recording.
