# RecallRadius shared build agreement

This is a proposed implementation contract for three people working independently and merging at the end. It does not describe an already-built application. Agree and freeze this document before creating the three feature branches.

Shared repository: https://github.com/zubair480/belle-hackathon . The user confirms that Codey/Cody, Ali and Zubair all have access. The repository was empty when inspected on September 12, 2026. Recheck its state before starting, because teammates may have added work since that inspection.

## Working agreement

Zubair creates one common Next.js/TypeScript foundation with the pinned package manifest and lockfile, shared Zod/TypeScript contracts, and research/fixture files. Everyone starts from that same commit. This initial foundation precedes parallel work; feature branches are merged only at the end.

Because the inspected repository has no initial commit, Zubair must publish that foundation first and share the exact base branch and commit SHA. Codey and Ali must not independently scaffold competing applications. If the foundation is still being prepared, they can review their requirements and fixture/pitch material, then begin implementation from the published SHA. All three use the shared repository, not separate replacement repositories.

| Owner | Branch | Owned paths |
| --- | --- | --- |
| Codey | `codex/codey-data-graph` | `src/server/data/**`, `src/server/graph/**`, `scripts/neo4j/**`, `fixtures/**`, `tests/data/**`, `docs/handoffs/CODEY.md` |
| Ali | `codex/ali-ui-pitch` | `src/components/recall/**`, `src/features/recall/**`, `tests/ui/**`, `docs/pitch/**`, `docs/handoffs/ALI.md` |
| Zubair | `codex/zubair-api-integration` | `src/app/**`, `src/contracts/**`, `src/server/ai/**`, `src/server/application/**`, `tests/api/**`, `tests/integration/**`, root configuration and README, `docs/handoffs/ZUBAIR.md` |

Ali exports `RecallWorkspace` from `src/features/recall/index.ts`. Zubair mounts it in the route at final integration. Codey exports the domain-service interface from `src/server/graph/index.ts`; its implementation can call his data modules. This keeps route files and shared configuration under one owner.

Zubair owns shared contract changes. Discuss a needed change early, publish its exact text to all three people, and record it in each handoff. This is coordination, not an early feature merge. Avoid individually renaming fields, paths or API routes.

Codey tests graph services directly. Ali uses explicit, visibly labeled UI mocks. Zubair uses injected domain-service doubles for API development. Real database integration is verified after the final merge. No unavailable backend is silently replaced by a successful mock response.

## Product scope

One synthetic food co-packer, one site `S1`, one kilogram-only process model, controlled CSV/text input and a suspect ingredient lot T17. Track known material paths, current inventory, outbound shipment lines, unresolved evidence and historical runs. QA owns operational actions. A displayed candidate hold is not an applied warehouse hold.

Keep `executionStatus` separate from `dataCompleteness`: an engine can finish successfully while its reviewed input still contains acknowledged gaps. Keep known-path and unresolved-evidence flags separate on each lot.

Material traversal follows input lot -> material event -> output lot. Pallet, brand, SKU, supplier and site relationships do not establish material incorporation. Possible cross-contact is outside this demo's material analysis and remains an explicit scope limitation. Absence of a recorded path is not a safety clearance.

## Shared API vocabulary

Zubair formalizes these definitions in `src/contracts/recall.ts` before the feature branches start. All identifiers are strings, all returned times are UTC ISO strings, quantities are finite nonnegative numbers in kg, and collections are arrays rather than Sets/Maps. Avoid importing server/Neo4j types into client code.

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

type RequestContext = { workspaceId: string; actorId: string };

type Scope = {
  siteId: string;
  eventFrom: string;
  eventToExclusive: string;
  inventoryAsOf: string;
  limitations: string[];
};

type TraceRequest = { revisionId: string; rootLotIds: string[]; scope: Scope };
type ReviewIssue = {
  id: string; code: string; severity: "warning" | "blocking";
  message: string; lotIds: string[]; evidenceIds: string[];
};
type Evidence = {
  id: string; sourceName: string; sourceHash: string;
  locator: string; text: string;
};
type TraceRow = {
  lotId: string; productLabel: string; brandLabel: string | null;
  onsiteKg: number; shippedKg: number;
  shipmentLineIds: string[]; consigneeIds: string[];
  knownMaterialPath: boolean; hasUnresolvedEvidence: boolean;
  evidenceIds: string[]; issueIds: string[];
};
type TraceResult = {
  runId: string; revisionId: string; rootLotIds: string[];
  createdAt: string; engineVersion: string; dataHash: string; scope: Scope;
  executionStatus: "completed" | "incomplete";
  dataCompleteness: "reviewed_scope" | "gaps_found" | "unreviewed";
  known: { onsiteKg: number; shippedKg: number; consigneeCount: number };
  unresolvedOnly: { onsiteKg: number; shippedKg: number };
  disposedKg: number;
  rows: TraceRow[]; issues: ReviewIssue[]; evidence: Evidence[];
  paths: Array<{ inputLotId: string; eventId: string;
    outputLotId: string; evidenceIds: string[] }>;
  consignees: Array<{ id: string; name: string }>;
};
type ImportInput = {
  files: Array<{ name: string; text: string }>;
  scope: Scope; baseRevisionId?: string;
};
type ImportPreview = {
  previewId: string; baseRevisionId: string | null;
  canAccept: boolean; issues: ReviewIssue[]; sourceHashes: string[];
  coverage: { expected: string[]; received: string[]; missing: string[] };
};
type RevisionInfo = { revisionId: string; acceptedAt: string; dataHash: string };
type TraceComparison = {
  earlierRunId: string; laterRunId: string;
  comparable: boolean; reasons: string[];
  delta: { onsiteKg: number; shippedKg: number; consigneeCount: number } | null;
  addedLotIds: string[]; addedConsigneeIds: string[]; resolvedIssueIds: string[];
};
```

The actor and workspace are supplied by the server, not accepted from arbitrary browser input. For the local synthetic demo, use an explicitly documented server-configured demo context. That is not production authentication.

API routes, owned by Zubair:

| Method and route | Input | Output inside `ApiResponse` |
| --- | --- | --- |
| `POST /api/imports/preview` | `ImportInput` | `ImportPreview` |
| `POST /api/imports/:id/accept` | expected base revision, if applicable | `RevisionInfo` |
| `POST /api/demo/late-evidence/preview` | `baseRevisionId` | `ImportPreview` |
| `POST /api/alerts/extract` | `sourceId`, `text` | validated, unconfirmed alert draft |
| `POST /api/incidents/:id/traces` | `TraceRequest` | `TraceResult` |
| `GET /api/traces/:id` | path ID | `TraceResult` |
| `GET /api/traces/:id/compare?other=:laterId` | two run IDs | `TraceComparison` |
| `GET /api/traces/:id/export` | path ID | CSV download; JSON envelope only on error |

Codey's service methods, called by Zubair, accept context as their first argument and return domain objects directly: `previewImport(ctx, input)`, `previewLateEvidence(ctx, {baseRevisionId})`, `acceptImport(ctx, {previewId, expectedBaseRevisionId?})`, `runTrace(ctx, request)`, `getTrace(ctx, {runId})`, `compareTraces(ctx, {earlierRunId, laterRunId})`. `runTrace` persists the immutable result before returning it. Zubair provides HTTP translation and exports; he does not duplicate graph or ledger logic.

The late-evidence route is explicitly a prepared demo action, not an arbitrary PDF reader. It stages the supplied fixture correction, including superseding R-UNK's provisional opening balance, for human review. Acceptance creates a new revision and a separate call creates a new trace.

## Common fixture and expected outcomes

The handoff pack includes `reference_case.py` and its `reference_output` JSON. These are the source of truth for synthetic event allocations and expected quantities. They are a reference implementation, not a finished graph backend. Use the identical lots and amounts in every lane; do not fabricate unrelated demo data.

The trace root is T17; all fixture lots belong to the common synthetic workspace and site S1. The event window is September 1 through 10, 2026, represented as `2026-09-01T00:00:00Z` to exclusive `2026-09-11T00:00:00Z`. The inventory cutoff is the end of September 10. Missing noncausal fixture metadata, such as precise outbound timestamps, may be filled with explicitly labeled synthetic values consistently after production and before the cutoff; document these additions and do not change quantities or genealogy.

| Expected output | Revision 1 | Revision 2 |
| --- | --- | --- |
| Known-path onsite stock | 160 kg | 190 kg |
| Known-path outbound shipments | 120 kg | 180 kg |
| Distinct direct consignees | 3 | 4 |
| Finished lots with a path | F-A, F-B, F-C | F-A, F-B, F-C, F-E |
| Unresolved-only finished stock | F-E: 40 kg onsite, 60 kg shipped | 0 in this fixture |
| Already disposed | 10 kg | 10 kg |
| F-D | No recorded material path | No recorded material path |

F-C is reachable directly from T17 and through rework. Count its inventory and shipment once. F-C and F-D share pallet P9; that grouping must not propagate the material trace. R-UNK starts with an explicitly provisional 20 kg opening quantity and missing origin. The late record consumes WIP101 10 kg and CLEAN-R 10 kg to produce R-UNK 20 kg. It replaces, rather than adds to, that provisional opening. Consequently onsite scope rises by 30 kg, not 40 kg. The first run remains unchanged.

`known` includes all lots with a known path, including any with additional unresolved evidence. `unresolvedOnly` excludes known-path lots to avoid double counting. Inventory quantities come from distinct positions and shipments from distinct source lines. Quantities must not be summed over graph paths.

## Final merge and definition of done

Zubair performs the final feature merge in a dedicated integration branch or checkout based on the foundation. Incorporate Codey's domain services, Zubair's API/application work and Ali's UI/pitch. Resolve import/configuration conflicts without replacing a teammate's implementation with a shortcut.

Run typecheck, production build, lane tests and actual Neo4j integration checks. Disable UI/API mocks explicitly, exercise both reference revisions through the UI, inspect evidence and confirm the old run is unchanged. Missing credentials mean database integration is unverified; they must not produce a fabricated pass.

The final demo is: review/import -> select/confirm T17 -> trace -> inspect rework and gaps -> preview/accept late evidence -> compare old and new runs. Keep a backup recording. Only describe features and sponsor usage that were actually demonstrated.
