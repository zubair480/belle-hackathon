import { CONTRACT_VERSION, ROUTES } from "@/contracts/recall";
import { EV_DEMO } from "@/contracts/issues";

/**
 * Foundation placeholder. At final integration Zubair replaces this body with
 * `import { RecallWorkspace } from "@/features/recall";` and renders it here.
 * Ali may mount RecallWorkspace here on codex/ali-ui-pitch for local development; that edit is
 * expected and will be taken at merge.
 */
export default function HomePage() {
  return (
    <main className="rr-container">
      <div className="rr-card">
        <h1 style={{ marginTop: 0 }}>RecallRadius</h1>
        <p className="rr-muted">
          Issue, investigation and reusable-resolution workspace for EV vehicle assembly. Contract{" "}
          <code>{CONTRACT_VERSION}</code>. The RecallWorkspace UI is mounted here at final integration.
        </p>
        <p>
          Synthetic demo workspace <code>{EV_DEMO.workspaceId}</code>, site <code>{EV_DEMO.siteId}</code>, demo vehicle{" "}
          <code>{EV_DEMO.vehicleBuildId}</code>. Health endpoint: <code>{ROUTES.health.path}</code>.
        </p>
        <p className="rr-muted">
          A linked supplier or producing team is not a confirmed cause. Closing an issue does not release a vehicle for
          shipment. All factory records in the demo are synthetic.
        </p>
      </div>
    </main>
  );
}
