import { CONTRACT_VERSION, DEMO, ROUTES } from "@/contracts/recall";

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
          Foundation scaffold. Contract version <code>{CONTRACT_VERSION}</code>. The RecallWorkspace UI is mounted
          here at final integration.
        </p>
        <p>
          Synthetic demo workspace <code>{DEMO.workspaceId}</code>, site <code>{DEMO.siteId}</code>, root lot{" "}
          <code>{DEMO.rootLotId}</code>. Health endpoint: <code>{ROUTES.health.path}</code>.
        </p>
        <p className="rr-muted">
          Absence of a recorded material path is not a safety clearance. QA retains authority over holds and recalls.
        </p>
      </div>
    </main>
  );
}
