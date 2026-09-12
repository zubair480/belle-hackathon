# Cody data/Neo4j handoff

- Contract: `assembly-quality-v4`
- Base commit: `defabb734233d776eff4e83c3c15d587c07218d9`
- Workspace: `synthetic-ev-assembler`
- Aura instance: AuraDB Free, GCP `us-central1`, instance id `7bd3cbcf` (provisioned via the Aura REST API with the account's OAuth2 client credentials; the earlier `workshop-neo4j` Free instance was deleted at the user's direction to free the account's single Free-tier slot). Default database name on this instance is `7bd3cbcf`, not `neo4j` — `NEO4J_DATABASE` in `.env.local` reflects that.

## Exported data services

`src/server/graph/index.ts` exports `traceServices`, which satisfies the frozen `TraceServices` contract:

- `previewImport`
- `previewLateEvidence`
- `acceptImport`
- `runTrace`
- `getTrace`
- `compareTraces`

It also exports `applySchema`, `verifyNeo4jConnectivity`, `closeNeo4jDriver`, `cacheNhtsaRecords`, and `loadNhtsaCache`.

Issue persistence is intentionally not included in this data-first slice. Zubair can compose `traceServices` with Cody's future `IssueServices` implementation as `graphServices` once that lane begins.

## Aura setup

1. Provision the selected AuraDB Free database in GCP `us-central1` through the Aura Console.
2. Capture the generated password immediately and store it in the approved secret store; it is never committed.
3. Create the ignored local server environment file:

```sh
NEO4J_URI=neo4j+s://<aura-instance>.databases.neo4j.io
NEO4J_USERNAME=<from Aura console; some instances use the instance id, not "neo4j">
NEO4J_PASSWORD=<secret>
NEO4J_DATABASE=<from Aura console; check with SHOW DATABASES if unsure — do not assume "neo4j">
AURA_INSTANCE_ID=<optional-instance-id>
```

Newer Aura instances can name both the Bolt username and the default database after the instance id rather than `neo4j`/`neo4j`. If the driver reports `Unable to get a routing table for database '<name>' because this database does not exist`, run `SHOW DATABASES` (no `database` argument on the session) to find the real name before assuming the instance is unhealthy.

4. Wait for Aura to report `running`, then run the scripts with a TypeScript runner. `tsx` is not added to the shared package manifest because root dependency ownership belongs to Zubair:

```sh
npx --yes tsx scripts/neo4j/apply-schema.ts
npx --yes tsx scripts/neo4j/seed-ev-fixture.ts
npx --yes tsx scripts/neo4j/cache-nhtsa-ev.ts
npx --yes tsx scripts/neo4j/query-demo-traces.ts <revisionId>   # optional: prints both EV_TRACE_DEMO trace results
```

The driver is server-only, uses one `neo4j+s://` Aura connection pool, verifies connectivity explicitly, selects `NEO4J_DATABASE` on every session, parameterizes Cypher, and closes every session in `finally`.

## Fixture and expected behavior

`fixtures/ev/` contains five controlled CSVs and a manifest. The fixture distinguishes supplier batch `LOT-SUP-01` from internal lot `LOT-MFG-01`, uses actual installation/removal records, and leaves `CONN-0099` as an explicit unknown origin in revision one. The late-evidence preview creates a new full revision that assigns only `CONN-0099` to the supplier batch; it does not create an installation.

`fixtures/regression/manifest.json` and `src/server/data/regression.ts` adapt the checked-in legacy robotics reference into the same five-file import shape under `synthetic-robot-assembler`. They are regression-only and must not be presented as EV factory data.

Fixture SHA-256 values:

- `entities.csv`: `04fad11b7a91aa36b056526dc7c26e030666c7b53ffd87f357fdd0bd8dd57137`
- `batches.csv`: `ef0e77d92f4ec687adf9880e4a84323a6ba4b3f8ca665b112ce2ac1892fec08d`
- `manufacturing_lots.csv`: `6819710f355cb89b19a837ad2ed873d48541a4e9c39874db030fe6969aa182c3`
- `installations.csv`: `ec039181207918d96cbb8c174dd49c70d0db14ef0bedc8bbed2472822b8d2295`
- `shipments.csv`: `1df3fcbbc532b22feb2b413ae8faaad5cbe4fc2da9bfbaa426a3e3a89e50b910`
- `nhtsa/ioniq5-2022-reviewed.json`: `2f43298357b906b573d1b13d40c4afd013d5073e06f3affc00e32e73c7ee6975`

At `EV_TRACE_DEMO.scope`, the supplier trace should report one onsite vehicle, two shipped vehicles, two customers, one loose candidate component, one quarantined component, and one unresolved-only vehicle. The manufacturing-lot trace should report one onsite vehicle, one shipped vehicle, one customer, one quarantined historical component, and one historical-only vehicle. Multiple affected components in one vehicle remain one vehicle count.

`fixtures/ev/nhtsa/ioniq5-2022-reviewed.json` is an external-context cache. `cacheNhtsaRecords` writes it only as `ExternalRecord` plus `Evidence`; it creates no links to synthetic entities, batches, installations, shipments, or cause attribution.

## Validation performed

- `npm run typecheck` — passed
- `npm run test:data` — passed: 3 files, **15 tests, 0 skipped** (real-Aura integration tests now run against the live instance; previously 4 were skipped for lack of credentials)
- `python3 docs/reference/assembly/assembly_reference_case.py` — passed: 23 legacy regression checks
- `python3 docs/reference/quality/build_quality_fixture.py` — passed
- `npx tsx scripts/neo4j/apply-schema.ts` — applied all constraints/indexes to the live Aura instance
- `npx tsx scripts/neo4j/seed-ev-fixture.ts` — accepted revision `rev-65babf5a3a3426393104508b` (dataHash `65babf5a...`); loaded 21 entities, 1 supplier batch, 2 manufacturing lots, 14 installations, 4 shipments, 7 evidence records
- `npx tsx scripts/neo4j/cache-nhtsa-ev.ts` — cached 2 reviewed NHTSA `ExternalRecord`s, unjoined to synthetic factory data
- `npx tsx scripts/neo4j/query-demo-traces.ts <revisionId>` (new verification script) ran `runTrace` for both `EV_TRACE_DEMO` roots against the live data and matched the documented expected counts exactly:
  - Supplier batch `LOT-SUP-01`: 1 onsite vehicle, 2 shipped, 2 customers, 1 loose candidate, 1 quarantined, 1 unresolved-only
  - Manufacturing lot `LOT-MFG-01`: 1 onsite vehicle, 1 shipped, 1 customer, 1 quarantined, 1 historical-only

The repository's `reference:*` npm aliases currently invoke `python`, which is not installed in this environment; `python3` ran the same scripts successfully.

## Limitations before final merge

- `tsx` is intentionally not added to `package.json` (root dependency ownership is Zubair's); run scripts with `npx --yes tsx <script>` after sourcing `.env.local`.
- The NHTSA cache is a bounded reviewed context fixture; refresh it from the documented public endpoints before presenting it as a current public-data sample.
- API routes, application wiring, shared-contract changes, and UI remain Zubair/Ali-owned work.
- The historical robotics fixtures are regression-only and must not be shown as EV factory data.
- Issue/resolution persistence (`createIssue`, `recordCauseAssessment`, `createFixRevision`, `recordVerification`, etc. from `docs/SHARED_CONTRACT.md`) is not yet implemented in this slice — only the trace/provenance data services (`traceServices`) are live. That is the next milestone.
