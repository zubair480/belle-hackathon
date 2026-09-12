"use client";
/**
 * Right rail of the vehicle explorer: every recorded part on the sketch grouped by sourcing
 * ("Bought from supplier" / "Made in-house" / "Unknown origin"), the selected part's provenance,
 * containment history and linked issues, and a one-tap "Report issue" action.
 */
import type { EntityContext, SourcingType } from "@/contracts/common";
import type { Issue } from "@/contracts/issues";
import type { ClientError } from "../../features/recall/api/types";
import { useWorkspace } from "../../features/recall/context";
import { ATTRIBUTION, SOURCING_LABEL, fmtDate } from "../../features/recall/format";
import { allParts, type SketchModel, type SketchVehicle } from "../../features/recall/sketches/models";
import { Empty, ErrorBanner, KV, Loading, SourcingBadge, StatusBadge } from "./primitives";

export type PartLoad = { status: "loading" | "ready" | "error"; data: EntityContext | null; error: ClientError | null };

export type PartPanelProps = {
  vehicle: SketchVehicle;
  model: SketchModel;
  contexts: Record<string, PartLoad | undefined>;
  issues: Issue[];
  selectedEntityId: string | null;
  onSelect: (id: string | null) => void;
  sourcingFilter: SourcingType | "all";
  onFilter: (f: SourcingType | "all") => void;
};

const GROUPS: Array<{ key: SourcingType; label: string }> = [
  { key: "supplier", label: SOURCING_LABEL.supplier },
  { key: "in_house", label: SOURCING_LABEL.in_house },
  { key: "unknown", label: SOURCING_LABEL.unknown },
];

export function PartPanel({ vehicle, model, contexts, issues, selectedEntityId, onSelect, sourcingFilter, onFilter }: PartPanelProps) {
  const ws = useWorkspace();
  const parts = allParts(model).map(({ part, parent }) => ({ part, parent, id: part.entityId(vehicle.suffix) }));
  const vehicleLoad = contexts[vehicle.entityId];
  const sourcingOf = (id: string): SourcingType | "unrecorded" => {
    const c = contexts[id];
    if (!c || c.status === "loading") return "unknown";
    if (c.status === "error" || !c.data) return "unrecorded";
    return c.data.entity.origin?.sourcingType ?? "unknown";
  };
  const counts = { supplier: 0, in_house: 0, unknown: 0, unrecorded: 0 };
  for (const p of parts) counts[sourcingOf(p.id)] += 1;
  const recordedTotal = counts.supplier + counts.in_house + counts.unknown;
  const issuesFor = (id: string) => issues.filter((i) => i.entityIds.includes(id));
  const openIssues = issues.filter((i) => i.status !== "closed");
  const selected = parts.find((p) => p.id === selectedEntityId) ?? null;
  const selectedLoad = selectedEntityId ? contexts[selectedEntityId] : undefined;

  return (
    <aside className="rrx-panel" aria-label="Vehicle parts and provenance">
      <section className="rrx-card rrx-panel-section">
        <div className="rrx-card-head">
          <div>
            <h2 style={{ marginBottom: 2 }}>{vehicle.buildId}</h2>
            <div className="rrx-muted rrx-small">
              {model.name} · {model.platform} · {model.bodyStyle}
            </div>
          </div>
          <span className="rrx-badge rrx-badge--muted">Sample vehicle</span>
        </div>
        {vehicleLoad?.status === "loading" ? <Loading label="Loading vehicle record" /> : null}
        {vehicleLoad?.status === "error" && vehicleLoad.error ? <ErrorBanner error={vehicleLoad.error} /> : null}
        {vehicleLoad?.status === "ready" && vehicleLoad.data ? (
          <KV
            rows={[
              ["Build ID", <span className="rrx-mono" key="b">{vehicleLoad.data.entity.vehicle?.buildId ?? vehicle.buildId}</span>],
              ["VIN", vehicleLoad.data.entity.vehicle?.vin ? <span className="rrx-mono">{vehicleLoad.data.entity.vehicle.vin}</span> : <span className="rrx-muted">Not assigned yet (build ID is the working identifier)</span>],
              ["Location state", vehicleLoad.data.entity.locationState],
              ["Open issues", openIssues.length ? <button type="button" className="rrx-count-btn" onClick={() => ws.navigate("issues")}>{openIssues.length}</button> : "0"],
            ]}
          />
        ) : null}
        <div className="rrx-row" style={{ marginTop: 10 }}>
          <button type="button" className="rrx-btn rrx-btn--primary" onClick={() => ws.openNewIssue({ entityIds: [vehicle.entityId], contextNote: `Reported from vehicle ${vehicle.buildId}` })}>
            + Report issue on this vehicle
          </button>
        </div>
      </section>

      {selected ? (
        <section className="rrx-card rrx-panel-section rrx-part-detail" data-testid="part-detail" aria-live="polite">
          <div className="rrx-origin-head">
            <div>
              <h3 style={{ marginBottom: 0 }}>{selected.part.label}</h3>
              <span className="rrx-mono rrx-muted">{selected.id}</span>
            </div>
            <button type="button" className="rrx-btn rrx-btn--sm rrx-btn--ghost" onClick={() => onSelect(null)}>
              Back to vehicle
            </button>
          </div>
          {selectedLoad?.status === "loading" || !selectedLoad ? <Loading label="Loading part record" /> : null}
          {selectedLoad?.status === "error" && selectedLoad.error ? (
            <>
              <ErrorBanner error={selectedLoad.error} />
              <p className="rrx-muted rrx-small">This part is drawn on the sketch but the backend has no record for it. No provenance is shown.</p>
            </>
          ) : null}
          {selectedLoad?.status === "ready" && selectedLoad.data ? <PartProvenance ctx={selectedLoad.data} issues={issuesFor(selected.id)} /> : null}
          <div className="rrx-row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="rrx-btn rrx-btn--primary"
              onClick={() => {
                const e = selectedLoad?.data?.entity;
                const parentIds = selectedLoad?.data?.currentParents.map((p) => p.id) ?? [];
                ws.openNewIssue({
                  entityIds: [selected.id, ...parentIds.filter((id) => id !== selected.id)],
                  partNumber: e?.partNumber ?? null,
                  partRevision: e?.partRevision ?? null,
                  linkedSupplierIds: e?.origin?.supplierId ? [e.origin.supplierId] : [],
                  contextNote: `Reported from ${selected.part.label} ${selected.id} on ${vehicle.buildId}`,
                });
              }}
            >
              + Report issue on this part
            </button>
          </div>
        </section>
      ) : (
        <section className="rrx-card rrx-panel-section">
          <Empty>Tap a part on the sketch to zoom in and see where it came from, what it sits in, and any issues linked to it.</Empty>
        </section>
      )}
      <section className="rrx-card rrx-panel-section">
        <div className="rrx-card-head">
          <h3>Recorded parts on this sketch</h3>
          <span className="rrx-muted rrx-small">{recordedTotal} recorded{counts.unrecorded ? `, ${counts.unrecorded} not in backend` : ""}</span>
        </div>
        <div className="rrx-sourcing-bar" aria-hidden="true">
          <span style={{ width: `${recordedTotal ? (counts.supplier / recordedTotal) * 100 : 0}%`, background: "var(--rr-supplier)" }} />
          <span style={{ width: `${recordedTotal ? (counts.in_house / recordedTotal) * 100 : 0}%`, background: "var(--rr-inhouse)" }} />
          <span style={{ width: `${recordedTotal ? (counts.unknown / recordedTotal) * 100 : 0}%`, background: "var(--rr-unknown)" }} />
        </div>
        <div className="rrx-row" role="group" aria-label="Filter parts by sourcing">
          {(["all", "supplier", "in_house", "unknown"] as const).map((f) => (
            <button key={f} type="button" className={`rrx-btn rrx-btn--sm${sourcingFilter === f ? "" : " rrx-btn--ghost"}`} aria-pressed={sourcingFilter === f} onClick={() => onFilter(f)}>
              {f === "all" ? `All (${recordedTotal})` : `${SOURCING_LABEL[f]} (${counts[f]})`}
            </button>
          ))}
        </div>
        {GROUPS.map((g) => {
          const list = parts.filter((p) => sourcingOf(p.id) === g.key && (sourcingFilter === "all" || sourcingFilter === g.key));
          if (!list.length) return null;
          return (
            <div key={g.key} style={{ marginTop: 10 }}>
              <div className="rrx-label" style={{ color: `var(--rr-${g.key === "in_house" ? "inhouse" : g.key})` }}>
                {g.label} · {list.length}
              </div>
              <ul className="rrx-partlist">
                {list.map((p) => {
                  const n = issuesFor(p.id).filter((i) => i.status !== "closed").length;
                  return (
                    <li key={p.id} data-selected={selectedEntityId === p.id} onClick={() => onSelect(p.id)} data-testid={`partlist-${p.part.slot}`}>
                      <span className="rrx-dot" style={{ color: `var(--rr-${g.key === "in_house" ? "inhouse" : g.key})` }} />
                      <span className="rrx-part-name">
                        {p.parent ? <span className="rrx-muted">↳ </span> : null}
                        {p.part.label}
                      </span>
                      <span className="rrx-part-id rrx-mono">{p.id}</span>
                      {n ? <span className="rrx-badge rrx-badge--blocking">{n}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {counts.unrecorded ? (
          <p className="rrx-muted rrx-small" style={{ marginTop: 8 }}>
            Parts drawn on the sketch but not recorded in the backend are listed as "not in backend"; nothing is invented for them.
          </p>
        ) : null}
      </section>

    </aside>
  );
}

export function PartProvenance({ ctx, issues }: { ctx: EntityContext; issues: Issue[] }) {
  const ws = useWorkspace();
  const e = ctx.entity;
  const o = e.origin;
  const sourcing = o?.sourcingType ?? "unknown";
  const evidenceById = new Map(ctx.evidence.map((x) => [x.id, x]));
  const originEvidence = (o?.evidenceIds ?? []).map((id) => evidenceById.get(id)).filter(Boolean);
  const vehicleParent = ctx.currentParents.find((p) => p.kind === "vehicle");
  const historicalOnly = ctx.historicalVehicleIds.filter((v) => !ctx.currentVehicleIds.includes(v));
  const removed = ctx.installations.filter((i) => i.childId === e.id && i.removedAt !== null);
  return (
    <div className="rrx-stack">
      <div className="rrx-row">
        <SourcingBadge sourcing={sourcing} />
        <span className="rrx-badge rrx-badge--muted">{e.kind}</span>
        <span className="rrx-badge rrx-badge--muted">{e.locationState}</span>
      </div>
      {sourcing === "supplier" && o ? (
        <KV
          rows={[
            ["Supplier", <button type="button" className="rrx-count-btn" key="s" onClick={() => ws.navigate("insights")}>{ws.lookup.supplier(o.supplierId)}</button>],
            ["Supplier part / revision", `${o.partNumber}${o.partRevision ? ` rev ${o.partRevision}` : ""}`],
            ["Supplier batch", <span className="rrx-mono">{o.supplierBatchCode ?? "—"}</span>],
            ["Received serial", <span className="rrx-mono">{e.serialNumber}</span>],
            ["Receipt / inspection evidence", originEvidence.length ? originEvidence.map((x) => <div key={x!.id}><span className="rrx-mono">{x!.id}</span> · {x!.sourceName}</div>) : <span className="rrx-muted">None recorded</span>],
          ]}
        />
      ) : null}
      {sourcing === "in_house" && o ? (
        <KV
          rows={[
            ["Internal part / revision", `${o.partNumber}${o.partRevision ? ` rev ${o.partRevision}` : ""}`],
            ["Manufacturing lot", <span className="rrx-mono">{o.manufacturingLotCode ?? "—"}</span>],
            ["Work order", <span className="rrx-mono">{o.workOrderId ?? "—"}</span>],
            ["Site / process", `${o.siteId ?? "—"} / ${ws.lookup.process(o.processStepId)}`],
            ["Manufacturing team", <span>{ws.lookup.team(o.manufacturingTeamId)} <span className="rrx-muted rrx-small">(producer, not a confirmed cause)</span></span>],
            ["Inspection evidence", originEvidence.length ? originEvidence.map((x) => <div key={x!.id}><span className="rrx-mono">{x!.id}</span> · {x!.sourceName}</div>) : <span className="rrx-muted">None recorded</span>],
          ]}
        />
      ) : null}
      {sourcing === "unknown" ? (
        <div className="rrx-banner">Origin not recorded for {e.partNumber}. Neither a supplier nor an internal lot is known. This stays a review item; nothing is assumed.</div>
      ) : null}

      <div>
        <div className="rrx-label">Recorded current containment</div>
        <div className="rrx-path" data-testid="containment-path">
          <span className="rrx-path-node">{e.id}</span>
          {ctx.currentParents.map((p) => (
            <span key={p.id} style={{ display: "contents" }}>
              <span className="rrx-path-sep">→</span>
              <span className={`rrx-path-node${p.kind === "vehicle" ? " rrx-path-node--vehicle" : ""}`}>
                {p.id}
                {p.kind === "vehicle" && p.vehicle ? <span className="rrx-muted"> {p.vehicle.vin ? `VIN ${p.vehicle.vin}` : "no VIN yet"}</span> : null}
              </span>
            </span>
          ))}
          {vehicleParent ? (
            <>
              <span className="rrx-path-sep">→</span>
              <span className="rrx-path-node rrx-muted">{vehicleParent.locationState === "shipped" ? "shipped (shipment record)" : vehicleParent.locationState}</span>
            </>
          ) : e.kind === "vehicle" ? (
            <>
              <span className="rrx-path-sep">→</span>
              <span className="rrx-path-node rrx-muted">{e.locationState}</span>
            </>
          ) : (
            <span className="rrx-muted"> (not currently installed)</span>
          )}
        </div>
      </div>
      {historicalOnly.length || removed.length ? (
        <div>
          <div className="rrx-label">Historical containment</div>
          {removed.map((i) => (
            <div key={i.id} className="rrx-small">
              Installed in <span className="rrx-mono">{i.parentId}</span> ({i.slotId}) {fmtDate(i.installedAt)} → removed {fmtDate(i.removedAt)}
            </div>
          ))}
          {historicalOnly.length ? <div className="rrx-small">Previously reached vehicle(s): {historicalOnly.join(", ")}</div> : null}
          <div className="rrx-muted rrx-small">Removal is not engineering clearance; the historical record is kept for review.</div>
        </div>
      ) : null}
      {ctx.currentChildren.length ? (
        <div>
          <div className="rrx-label">Currently contains</div>
          <div className="rrx-chips">
            {ctx.currentChildren.map((c) => (
              <span key={c.id} className="rrx-chip">
                <SourcingBadge sourcing={c.origin?.sourcingType} compact /> {c.id}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <div className="rrx-label">Linked issues</div>
        {issues.length ? (
          <ul className="rrx-partlist">
            {issues.map((i) => (
              <li key={i.id} onClick={() => ws.openIssue(i.id)}>
                <StatusBadge status={i.status} />
                <span className="rrx-part-name">{i.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="rrx-muted rrx-small">No issues linked to this part.</span>
        )}
      </div>
      {ctx.limitations.length ? (
        <ul className="rrx-warnlist rrx-small">
          {ctx.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      <p className="rrx-muted rrx-small" style={{ marginBottom: 0 }}>
        {ATTRIBUTION.linkedSupplier} and producing team are provenance only. Fault is established by a reviewed cause on an issue.
      </p>
    </div>
  );
}
