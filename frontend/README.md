# frontend (Ali's lane)

The RecallRadius UI: sketch-first EV assembly quality workspace on contract `assembly-quality-v4`.

```
frontend/
  components/recall/   screens and widgets (VehicleSketch, PartPanel, IssueDetail, ResolutionPanel, InsightsView, ...) + recall.css
  features/recall/     RecallWorkspace shell, typed API client, labelled mock, sketch geometry, hooks, labels
  tests/ui/            vitest suites (mock rules in node, rendered workflows in jsdom)
```

- Export: `RecallWorkspace` from `frontend/features/recall/index.ts`. `src/features/recall/index.ts` re-exports it so the app route can keep importing `@/features/recall`.
- Mock mode: `NEXT_PUBLIC_RECALL_UI_MOCKS=true` (visible banner). Live mode is the default and never falls back to sample data.
- Commands from the repo root: `npm run dev`, `npm run test:ui`, `npm run typecheck`, `npm run build`.
- Contracts are imported from `src/contracts/*` (Zubair's) via the `@/contracts/*` alias; nothing here imports server code.

See `docs/handoffs/ALI.md` for tested results and API assumptions, and `docs/pitch/` for the judge materials.
