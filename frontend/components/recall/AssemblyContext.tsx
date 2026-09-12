"use client";
/** P1: component -> subassembly -> vehicle -> shipment context for each marked entity. */
import type { IssueDetail } from "@/contracts/issues";
import { useWorkspace } from "../../features/recall/context";
import { PartProvenance } from "./PartPanel";
import { Empty, SourcingBadge } from "./primitives";

export function AssemblyContext({ detail }: { detail: IssueDetail }) {
  const ws = useWorkspace();
  if (!detail.entityContexts.length) return <Empty>No assembly context recorded for the marked items. Unknown relationships are not invented.</Empty>;
  return (
    <div className="rrx-stack">
      <p className="rrx-muted rrx-small">
        Recorded current containment follows installation intervals active now. Historical containment includes removed parts. A shared crate, design BOM or common part number is never shown as an installation.
      </p>
      {detail.entityContexts.map((ctx) => (
        <section key={ctx.entity.id} className="rrx-card" data-testid={`context-${ctx.entity.id}`}>
          <div className="rrx-card-head">
            <h3>
              {ctx.entity.id} <span className="rrx-muted">· {ctx.entity.partNumber}{ctx.entity.partRevision ? ` rev ${ctx.entity.partRevision}` : ""}</span>
            </h3>
            <div className="rrx-row">
              <SourcingBadge sourcing={ctx.entity.origin?.sourcingType} kind={ctx.entity.kind} />
              <button type="button" className="rrx-btn rrx-btn--sm" onClick={() => ws.openEntity(ctx.entity.id)}>
                Show on sketch
              </button>
            </div>
          </div>
          <PartProvenance ctx={ctx} issues={[]} />
        </section>
      ))}
    </div>
  );
}
