// RecallRadius: Cypher to show the live dataset in the Aura Query tool (console.neo4j.io > Query).
// Connect to the instance the app uses: neo4j+s://7bd3cbcf.databases.neo4j.io, user 7bd3cbcf,
// password from .env.local (never paste it anywhere else). Workspace id: synthetic-ev-assembler.
// Run one block at a time. The graph view renders the MATCH results as nodes and relationships.

// 1. What is loaded: node counts per label for the app's workspace.
MATCH (n) WHERE n.ws = 'synthetic-ev-assembler'
RETURN labels(n)[0] AS label, count(*) AS nodes
ORDER BY nodes DESC;

// 2. The demo vehicle and everything installed in it, with origins (graph view).
MATCH (v:Entity {ws: 'synthetic-ev-assembler', id: 'DEMO-EV-005'})
OPTIONAL MATCH p = (part:Entity)-[:INSTALLED_IN*1..2]->(v)
OPTIONAL MATCH o = (part)-[:HAS_ORIGIN]->(:Origin)-[:FROM_SUPPLIER_LOT|PRODUCED_IN]->(lot)-[:SUPPLIED_BY|MADE_BY]->(who)
RETURN v, p, o;

// 3. Supplier-lot trace: every vehicle holding a part from the connector lot (DEMO-EV-003 appears once).
//    Graph ids are LOT-SUP-01 / LOT-MFG-01; the UI shows their display names DEMO-SUP-LOT-01 / DEMO-MFG-LOT-01.
MATCH (lot:SupplierLot {ws: 'synthetic-ev-assembler', id: 'LOT-SUP-01'})<-[:FROM_SUPPLIER_LOT]-(:Origin)<-[:HAS_ORIGIN]-(part:Entity)
MATCH (part)-[:INSTALLED_IN*1..2]->(vehicle:Entity {kind: 'vehicle'})
RETURN lot.id AS supplierLot, collect(DISTINCT part.id) AS parts, collect(DISTINCT vehicle.id) AS vehicles, count(DISTINCT vehicle) AS vehicleCount;

// 4. Manufacturing-lot trace: the in-house bracket lot.
MATCH (lot:MfgLot {ws: 'synthetic-ev-assembler', id: 'LOT-MFG-01'})<-[:PRODUCED_IN]-(:Origin)<-[:HAS_ORIGIN]-(part:Entity)
MATCH (part)-[:INSTALLED_IN*1..2]->(vehicle:Entity {kind: 'vehicle'})
RETURN lot.id AS mfgLot, collect(DISTINCT part.id) AS parts, collect(DISTINCT vehicle.id) AS vehicles;

// 5. Issues with their causes, fixes, verifications and fix lineage (graph view).
MATCH (i:Issue {ws: 'synthetic-ev-assembler'})
OPTIONAL MATCH c = (:Cause)-[:ASSESSES]->(i)
OPTIONAL MATCH f = (fx:Fix)-[:FIXES]->(i)
OPTIONAL MATCH vf = (:Verification)-[:VERIFIES]->(fx)
OPTIONAL MATCH d = (fx)-[:DERIVED_FROM]->(:Fix)
OPTIONAL MATCH t = (i)-[:REPORTED_BY|ASSIGNED_TO|LINKS_SUPPLIER|AFFECTS]->()
RETURN i, c, f, vf, d, t;

// 6. Attribution, the way the Insights page computes it: reported vs confirmed-cause per team.
MATCH (t:Team {ws: 'synthetic-ev-assembler'})
OPTIONAL MATCH (i:Issue {ws: 'synthetic-ev-assembler'})-[:REPORTED_BY]->(t)
WITH t, count(DISTINCT i) AS reported
OPTIONAL MATCH (c:Cause {ws: 'synthetic-ev-assembler', state: 'confirmed'})-[:RESPONSIBLE_TEAM]->(t)
RETURN t.name AS team, reported, count(DISTINCT c) AS confirmedCauses
ORDER BY team;

// 7. Full audit trail of one issue (replace the id with the one you create in the demo).
MATCH (a:Audit {ws: 'synthetic-ev-assembler'})-[:AUDITS]->(i:Issue {id: 'ISS-BRKT-PRIOR'})
RETURN a.seq AS seq, a.at AS at, a.kind AS kind, a.toStatus AS toStatus, a.actorId AS actor, a.summary AS summary
ORDER BY a.seq;

// 8. Everything in the workspace, small enough to render (about 200 nodes).
MATCH (n) WHERE n.ws = 'synthetic-ev-assembler' AND NOT n:Idem AND NOT n:Audit
OPTIONAL MATCH (n)-[r]->(m) WHERE m.ws = 'synthetic-ev-assembler'
RETURN n, r, m LIMIT 600;
