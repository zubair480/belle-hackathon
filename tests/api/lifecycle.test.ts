/**
 * Lifecycle contract checks agreed with Ali and required from Codey (see
 * docs/INTEGRATION_REQUIREMENTS_CODEY.md section 2), exercised against the double.
 */
import { describe, expect, it } from "vitest";
import type { ApiResponse } from "@/contracts/common";
import { EV_DEMO, type FixRevision, type Issue, type IssueDetail } from "@/contracts/issues";
import { createServiceDouble } from "@/server/application/double";
import { createHandlers } from "@/server/application/handlers";

const post = (body: unknown) => new Request("http://t/", { method: "POST", body: JSON.stringify(body) });
const data = async <T>(r: Response): Promise<T> => {
  const b = (await r.json()) as ApiResponse<T>;
  if (!b.ok) throw new Error(`${b.error.code}: ${b.error.message}`);
  return b.data;
};
let n = 0;
const key = () => `lifecycle-key-${String(++n).padStart(4, "0")}`;

function api() {
  const services = createServiceDouble();
  return createHandlers({ services: () => services, context: () => ({ workspaceId: EV_DEMO.workspaceId, actorId: "qa" }), aiProvider: () => null, serviceTimeoutMs: 500, aiTimeoutMs: 500, describeWiring: () => ({}) });
}

describe("lifecycle: request_verification applies the fix and records audit history", () => {
  it("proposed -> applied on request_verification with fixRevisionId; verified after pass", async () => {
    const h = api();
    const issue = await data<Issue>(await h.issueCreate(post({ idempotencyKey: key(), title: "Bracket skew on DEMO-EV-004", description: "x", origin: "manual", detectedAt: "2026-09-12T11:00:00Z", reportingTeamId: EV_DEMO.teams.finalInspection, assignedTeamId: EV_DEMO.teams.inHouseManufacturing, detectionStationId: null, processStepId: null, entityIds: ["BRKT-0004"], partNumber: EV_DEMO.parts.bracket, partRevision: "A", linkedSupplierIds: [], defectCode: EV_DEMO.defectCodes.bracketDimension, severity: "major", evidenceIds: [] })));
    let cur = await data<Issue>(await h.issueTransition(post({ idempotencyKey: key(), action: "start_work", expectedVersion: issue.version }), issue.id));
    const fix = await data<FixRevision>(await h.issueFix(post({ idempotencyKey: key(), summary: "Reuse", steps: [{ order: 1, instruction: "Apply WI." }], applicability: { partNumber: EV_DEMO.parts.bracket, partRevision: "A", processStepId: EV_DEMO.processSteps.bracketForming, limitations: [] }, sourceFixRevisionId: EV_DEMO.priorVerifiedFixId, evidenceIds: [] }), issue.id));
    expect(fix.state).toBe("proposed");
    cur = (await data<IssueDetail>(await h.issueGet(issue.id))).issue;
    const wrongFix = await h.issueTransition(post({ idempotencyKey: key(), action: "request_verification", expectedVersion: cur.version, fixRevisionId: EV_DEMO.priorVerifiedFixId }), issue.id);
    expect(wrongFix.status).toBe(400); // fix belongs to another issue
    cur = await data<Issue>(await h.issueTransition(post({ idempotencyKey: key(), action: "request_verification", expectedVersion: cur.version, fixRevisionId: fix.id }), issue.id));
    let detail = await data<IssueDetail>(await h.issueGet(issue.id));
    expect(detail.fixes[0]).toMatchObject({ id: fix.id, state: "applied" });
    expect(detail.fixes[0]?.appliedAt).not.toBeNull();
    expect(detail.issue.currentFixRevisionId).toBe(fix.id);
    expect(detail.audit.some((a) => a.kind === "fix_applied" && a.subjectId === fix.id)).toBe(true);
    expect(detail.issue.status).toBe("pending_verification");

    await data(await h.issueVerification(post({ idempotencyKey: key(), fixRevisionId: fix.id, outcome: "fail", method: "Gauge", resultNotes: "fail", evidenceIds: [] }), issue.id));
    detail = await data<IssueDetail>(await h.issueGet(issue.id));
    expect(detail.issue.status).toBe("in_progress");
    expect(detail.fixes[0]?.state).toBe("applied");
    expect(detail.audit.some((a) => a.kind === "transition" && a.fromStatus === "pending_verification" && a.toStatus === "in_progress")).toBe(true);

    await data(await h.issueVerification(post({ idempotencyKey: key(), fixRevisionId: fix.id, outcome: "pass", method: "Gauge", resultNotes: "pass", evidenceIds: [] }), issue.id));
    detail = await data<IssueDetail>(await h.issueGet(issue.id));
    expect(detail.fixes[0]?.state).toBe("verified");
    cur = await data<Issue>(await h.issueTransition(post({ idempotencyKey: key(), action: "close", expectedVersion: detail.issue.version, fixRevisionId: fix.id }), issue.id));
    expect(cur.status).toBe("closed");

    // The source fix and its issue were never touched.
    const prior = await data<IssueDetail>(await h.issueGet(EV_DEMO.priorIssueId));
    expect(prior.fixes.find((f) => f.id === EV_DEMO.priorVerifiedFixId)).toMatchObject({ state: "verified", version: 1, sourceFixRevisionId: null });
    expect(prior.issue.status).toBe("closed");
  });
});
