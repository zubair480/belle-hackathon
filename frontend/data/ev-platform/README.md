# EV-PLATFORM-1 parts and wiring dataset (synthetic)

Design-level data for the demo EV platform, prepared by Ali for Codey to load into Neo4j. Every identifier is fictional. The same files drive the frontend's 3D sketch, the part search index and the wiring overlay, so the graph and the UI share one vocabulary.

| File | Content |
| --- | --- |
| `parts.json` | 56 part slots: label, synonyms (for search), kind, optional parent slot, system, zone, side, entity-id prefix/suffix, part number/revision, sourcing template (supplier batch or in-house lot/work order/process/team), free-form spec |
| `wiring.json` | 12 circuits (with synonyms such as "ignition"), 42 connectors, 45 wires (from/to slot, connectors, harness, voltage class HV/LV/signal, gauge, colour, signal name) |
| `export-neo4j.mjs` | `node frontend/data/ev-platform/export-neo4j.mjs` regenerates `neo4j/` |
| `neo4j/*.csv` | `part_slots`, `circuits`, `connectors`, `wires`, `zones`, `systems` for `LOAD CSV` |
| `neo4j/import.cypher` | Inline `MERGE` script (no file access needed); namespaced by `platform` + `revision` |

## Graph model

```
(:Platform)                        {id, revision}
(:PartSlot)-[:IN_ZONE]->(:Zone)    slot, label, kind, side, sourcing, supplierId | manufacturingLotCode ...
(:PartSlot)-[:IN_SYSTEM]->(:System)
(:PartSlot)-[:DESIGNED_CHILD_OF]->(:PartSlot)        connector/bracket -> charge-port module; cells/BMS -> pack
(:Connector)-[:ON_PART]->(:PartSlot)
(:Wire)-[:FROM_PART]->(:PartSlot), (:Wire)-[:TO_PART]->(:PartSlot)
(:Wire)-[:FROM_CONNECTOR]->(:Connector), (:Wire)-[:TO_CONNECTOR]->(:Connector)
(:Wire)-[:PART_OF_CIRCUIT]->(:Circuit)
(:Wire)-[:ROUTED_IN]->(:PartSlot)                    the harness the wire runs in
(:Entity)-[:INSTANCE_OF_SLOT]->(:PartSlot)           per-vehicle serial -> design slot (see the comment at the end of import.cypher)
```

Entity ids per vehicle follow `prefix-<buildSuffix>[-side]`, for example `WHL-0005-FL`, `LAMP-0006-R`, `CONN-0005`. This matches the mock data and the `EV_DEMO` ids in the shared contract.

## Example questions (Cypher)

Ignition does not respond: which parts and wires are on the start circuit, and which harness carries them?

```cypher
MATCH (c:Circuit {id: 'C-START', platform: 'EV-PLATFORM-1', revision: 'v1'})<-[:PART_OF_CIRCUIT]-(w:Wire)
MATCH (w)-[:FROM_PART]->(a:PartSlot), (w)-[:TO_PART]->(b:PartSlot)
OPTIONAL MATCH (w)-[:ROUTED_IN]->(h:PartSlot)
RETURN w.id, w.signal, a.label AS fromPart, b.label AS toPart, h.label AS harness, w.voltageClass
ORDER BY w.id;
```

Which vehicles contain a part from a suspect harness lot, via the design slot?

```cypher
MATCH (n:PartSlot {supplierBatchCode: 'DEMO-LVH-LOT-03'})<-[:INSTANCE_OF_SLOT]-(e:Entity)
MATCH (e)-[:INSTALLED_IN*1..3]->(v:Entity {kind: 'vehicle'})
RETURN DISTINCT v.id, collect(DISTINCT n.label) AS parts;
```

Everything electrically reachable from the start switch within three wires:

```cypher
MATCH (s:PartSlot {slot: 'start-switch'})
MATCH path = (s)<-[:FROM_PART|TO_PART]-(:Wire)-[:FROM_PART|TO_PART]->(:PartSlot)
RETURN path LIMIT 50;
```

## Limits

- Design data, not measured harness routing; wire paths in the 3D sketch are drawn between part positions.
- One platform revision. Vehicle-specific deviations (replaced connector on DEMO-EV-006, unknown windshield origin on 005/007, older bracket lot on 002) live in the mock/service data, not here.
- Codey owns persistence: copy or reference these files from `fixtures/` as he prefers; do not treat them as measured factory data.
