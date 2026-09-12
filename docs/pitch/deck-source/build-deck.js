// RecallRadius judge deck (6 slides). Every number here was observed on the shared Aura
// instance or in docs/evidence on 2026-09-12. Run: node build-deck.js <out.pptx>
const pptxgen = require("pptxgenjs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "RecallRadius_Judge_Deck.pptx");

// Palette: graphite + electric copper (EV charge-port story), one accent, one muted.
const INK = "14181F"; // dominant dark
const PANEL = "1E242E"; // dark card
const PAPER = "FFFFFF";
const TINT = "F3F4F6"; // light card
const COPPER = "D9752B"; // accent
const COPPER_DK = "B85E1C";
const MUTED = "6B7280";
const LINE = "D1D5DB";
const SAGE = "3E8E6E"; // pass / verified
const RED = "C0392B"; // fail
const FONT_H = "Cambria";
const FONT_B = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.author = "RecallRadius team";
pres.title = "RecallRadius judge deck";

const W = 10;
const M = 0.5;

function title(slide, text, opts = {}) {
  slide.addText(text, {
    x: M, y: 0.38, w: W - 2 * M, h: 0.9, fontFace: FONT_H, fontSize: opts.size || 28, bold: true,
    color: opts.color || INK, isTextBox: true, margin: 0, valign: "top", fit: "shrink",
  });
}

function footer(slide, text, dark) {
  slide.addText(text, {
    x: M, y: 5.2, w: W - 2 * M, h: 0.25, fontFace: FONT_B, fontSize: 9, color: dark ? "9CA3AF" : MUTED,
    isTextBox: true, margin: 0, valign: "middle",
  });
}

function numberDot(slide, x, y, n, dark) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: 0.34, h: 0.34, fill: { color: COPPER }, line: { color: COPPER } });
  slide.addText(String(n), {
    x, y, w: 0.34, h: 0.34, fontFace: FONT_B, fontSize: 12, bold: true, color: PAPER, align: "center", valign: "middle",
    isTextBox: true, margin: 0,
  });
}

function card(slide, x, y, w, h, opts = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.08, fill: { color: opts.fill || TINT }, line: { color: opts.line || (opts.fill || TINT), width: 0.75 },
  });
}

// ---------- Slide 1: title / problem ----------
{
  const s = pres.addSlide();
  s.background = { color: INK };
  s.addText("RecallRadius", {
    x: M, y: 0.55, w: 6, h: 0.5, fontFace: FONT_B, fontSize: 14, color: COPPER, bold: true, charSpacing: 4,
    isTextBox: true, margin: 0,
  });
  s.addText("One EV fails final inspection. Where did the part come from, and has anyone fixed this before?", {
    x: M, y: 1.05, w: 6.1, h: 2.0, fontFace: FONT_H, fontSize: 30, bold: true, color: PAPER, isTextBox: true, margin: 0, valign: "top",
  });
  s.addText(
    "An issue-to-verified-fix workspace for EV vehicle assemblers, where every issue, part, lot, team, cause, fix and verification is one connected record in Neo4j.",
    { x: M, y: 3.2, w: 6.0, h: 0.9, fontFace: FONT_B, fontSize: 14, color: "D1D5DB", isTextBox: true, margin: 0, valign: "top" },
  );
  s.addText("B.E.L.L.E hackathon, San Francisco, 12 September 2026  ·  Team: Zubair (backend, contract, Neo4j, integration), Ali (frontend, pitch), Codey (data, trace fixtures)", {
    x: M, y: 4.3, w: 6.2, h: 0.6, fontFace: FONT_B, fontSize: 10.5, color: "9CA3AF", isTextBox: true, margin: 0, valign: "top",
  });

  // Right: the charge-port stack as a mini graph (vehicle > module > connector + bracket).
  const gx = 7.0;
  card(s, gx, 1.0, 2.5, 3.9, { fill: PANEL, line: "2C3440" });
  s.addText("DEMO-EV-005", { x: gx, y: 1.15, w: 2.5, h: 0.3, fontFace: FONT_B, fontSize: 11, bold: true, color: PAPER, align: "center", isTextBox: true, margin: 0 });
  s.addText("sedan build, VIN not assigned", { x: gx, y: 1.42, w: 2.5, h: 0.25, fontFace: FONT_B, fontSize: 9, color: "9CA3AF", align: "center", isTextBox: true, margin: 0 });
  const nodes = [
    { label: "CPM-0005", sub: "charge-port module", x: gx + 0.75, y: 1.95, fill: "2C3440" },
    { label: "CONN-0005", sub: "bought · DEMO-SUP-LOT-01", x: gx + 0.1, y: 3.15, fill: COPPER_DK },
    { label: "BRKT-0005", sub: "made · DEMO-MFG-LOT-01", x: gx + 1.4, y: 3.15, fill: "3E8E6E" },
  ];
  // edges
  s.addShape(pres.shapes.LINE, { x: gx + 1.25, y: 1.72, w: 0, h: 0.23, line: { color: "6B7280", width: 1.25 } });
  s.addShape(pres.shapes.LINE, { x: gx + 0.6, y: 2.65, w: 0.65, h: 0.5, line: { color: "6B7280", width: 1.25 }, flipH: true });
  s.addShape(pres.shapes.LINE, { x: gx + 1.25, y: 2.65, w: 0.65, h: 0.5, line: { color: "6B7280", width: 1.25 } });
  for (const n of nodes) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: n.x, y: n.y, w: 1.0, h: 0.7, rectRadius: 0.1, fill: { color: n.fill }, line: { color: n.fill } });
    s.addText([
      { text: n.label, options: { bold: true, fontSize: 9.5, color: PAPER, breakLine: true } },
      { text: n.sub, options: { fontSize: 7, color: "E5E7EB" } },
    ], { x: n.x, y: n.y, w: 1.0, h: 0.7, fontFace: FONT_B, align: "center", valign: "middle", isTextBox: true, margin: 0.03 });
  }
  s.addText("purchased connector and in-house bracket, one module, one build", {
    x: gx, y: 4.05, w: 2.5, h: 0.6, fontFace: FONT_B, fontSize: 8.5, italic: true, color: "9CA3AF", align: "center", isTextBox: true, margin: 0.05, valign: "top",
  });
  footer(s, "All factory records are synthetic. The plant, suppliers, vehicles and teams are fictional.", true);
  s.addNotes(
    "Say the synthetic-data line once. Final Inspection finds the charge-port connector sitting proud on DEMO-EV-005. The connector was bought from a supplier; the bracket under it was made in-house. Today those records, the last fix and its verification live in different systems, and the team that found the defect usually gets the blame.",
  );
}

// ---------- Slide 2: the problem and the buyer ----------
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  title(s, "Four teams, four record systems, and the finder gets blamed");
  const cols = [
    { h: "Who buys", b: "Head of quality or manufacturing operations at an EV assembler that buys some components and makes others in-house. Users: final inspection, assembly, in-house manufacturing, supplier quality, quality engineering." },
    { h: "What breaks today", b: "An issue on the line touches a purchased connector and an in-house bracket. The receipt, the manufacturing lot, the earlier fix and its verification live in different records. Who reported, who is assigned and who caused it collapse into one blame column." },
    { h: "What we are not claiming", b: "No measured savings, no customers, no market-size figure. Traceability exists inside MES suites; we test a narrower advantage: one connected record from issue to verified fix, with attribution kept honest." },
  ];
  const cw = 2.9, gap = 0.15;
  cols.forEach((c, i) => {
    const x = M + i * (cw + gap);
    card(s, x, 1.5, cw, 3.1, { fill: i === 1 ? INK : TINT });
    const dark = i === 1;
    numberDot(s, x + 0.2, 1.7, i + 1);
    s.addText(c.h, { x: x + 0.65, y: 1.68, w: cw - 0.8, h: 0.38, fontFace: FONT_H, fontSize: 15, bold: true, color: dark ? PAPER : INK, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(c.b, { x: x + 0.2, y: 2.2, w: cw - 0.4, h: 2.65, fontFace: FONT_B, fontSize: 11.5, color: dark ? "E5E7EB" : "374151", isTextBox: true, margin: 0, valign: "top" });
  });
  footer(s, "Buyer and users are a hypothesis to test in a pilot, not a validated segment.");
  s.addNotes("Keep this to 20 seconds. The middle card is the pain; the right card is the honesty that judges reward.");
}

// ---------- Slide 3: the workflow (what the demo shows) ----------
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  title(s, "Report from the 3D sketch, save a real record, prove it with this vehicle");
  const steps = [
    { h: "Tap the charge port", b: "CONN-0005 shows \"Bought from supplier · DEMO-SUP-LOT-01\"; BRKT-0005 shows \"Made in-house · DEMO-MFG-LOT-01 · WO-DEMO-0001\". Parts with no record say so. We never invent provenance." },
    { h: "Report and save", b: "Title, severity, defect code, station, process step, reporting team. No CSV, no alert, no model call. Saved as v1 in Neo4j; F5 reloads it with its audit entry." },
    { h: "Confirm the cause", b: "Cause assessment: confirmed, type in-house manufacturing, team In-house Manufacturing, step Bracket forming. Header now separates reporter, assignee and confirmed causal team." },
    { h: "Reuse a verified fix", b: "Graph retrieval returns the bracket fix verified on DEMO-EV-002 with match reasons and limits. Reuse creates a new proposal; the original is never edited." },
    { h: "Fail, then pass, then close", b: "Close stays disabled until a passed verification of the applied fix. A failed verification is kept, status returns to in progress, then pass and close. Reopen keeps the full history." },
  ];
  const cw = 1.72, gap = 0.1, y0 = 1.5;
  steps.forEach((st, i) => {
    const x = M + i * (cw + gap);
    card(s, x, y0, cw, 3.1, { fill: TINT });
    numberDot(s, x + 0.15, y0 + 0.15, i + 1);
    s.addText(st.h, { x: x + 0.15, y: y0 + 0.58, w: cw - 0.3, h: 0.5, fontFace: FONT_H, fontSize: 12.5, bold: true, color: INK, isTextBox: true, margin: 0, valign: "top" });
    s.addText(st.b, { x: x + 0.15, y: y0 + 1.12, w: cw - 0.3, h: 2.2, fontFace: FONT_B, fontSize: 9.5, color: "374151", isTextBox: true, margin: 0, valign: "top" });
  });
  footer(s, "Every state above was cross-checked in the browser by reading the issue back through GET /api/issues/:id in graph mode (docs/evidence/BROWSER_ACCEPTANCE_RUN_2026-09-12.md).");
  s.addNotes("This is the three-minute demo path in docs/pitch/DEMO_RUNBOOK_GRAPH.md. If the live app is down, narrate over the screenshots and say plainly that it is a recording of the same flow.");
}

// ---------- Slide 4: why a graph (Neo4j) ----------
{
  const s = pres.addSlide();
  s.background = { color: INK };
  title(s, "Why Neo4j: the questions are relationship questions", { color: PAPER });
  // Left: relationship diagram (subset of the real model).
  const lx = M, ly = 1.45;
  card(s, lx, ly, 4.6, 3.55, { fill: PANEL, line: "2C3440" });
  const node = (label, x, y, fill, w = 1.15) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.4, rectRadius: 0.08, fill: { color: fill }, line: { color: fill } });
    s.addText(label, { x, y, w, h: 0.4, fontFace: FONT_B, fontSize: 9, bold: true, color: PAPER, align: "center", valign: "middle", isTextBox: true, margin: 0 });
  };
  const edge = (x, y, w, h, flipH) => s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color: "9CA3AF", width: 1, endArrowType: "triangle" }, flipH: !!flipH });
  const lbl = (t, x, y, w = 1.2, align = "center") => s.addText(t, { x, y, w, h: 0.2, fontFace: FONT_B, fontSize: 7, color: "9CA3AF", align, isTextBox: true, margin: 0 });
  // row 1
  node("Supplier", lx + 0.2, ly + 0.25, "4B5563");
  node("SupplierLot", lx + 1.7, ly + 0.25, COPPER_DK);
  node("MfgLot", lx + 3.2, ly + 0.25, SAGE);
  edge(lx + 1.35, ly + 0.45, 0.35, 0, false); lbl("SUPPLIED_BY", lx + 1.05, ly + 0.05, 0.95);
  // row 2
  node("Origin", lx + 1.7, ly + 1.15, "374151");
  edge(lx + 2.27, ly + 0.65, 0, 0.5); lbl("FROM_SUPPLIER_LOT", lx + 2.3, ly + 0.72, 1.1);
  edge(lx + 2.85, ly + 1.35, 0.35, 0); lbl("PRODUCED_IN", lx + 2.75, ly + 1.55, 0.7);
  node("Team", lx + 3.2, ly + 1.15, "4B5563");
  edge(lx + 3.77, ly + 0.65, 0, 0.5); lbl("MADE_BY", lx + 3.8, ly + 0.72, 0.6);
  // row 3
  node("Entity (part)", lx + 0.2, ly + 1.15, "374151");
  edge(lx + 1.35, ly + 1.35, 0.35, 0); lbl("HAS_ORIGIN", lx + 1.2, ly + 1.57, 0.65);
  node("Entity (vehicle)", lx + 0.2, ly + 2.05, "374151");
  edge(lx + 0.77, ly + 1.55, 0, 0.5); lbl("INSTALLED_IN", lx + 0.02, ly + 1.7, 0.7, "right");
  // row 4
  node("Issue", lx + 1.7, ly + 2.05, COPPER);
  edge(lx + 1.35, ly + 2.25, 0.35, 0, true); lbl("AFFECTS", lx + 1.25, ly + 2.47, 0.55);
  node("Cause", lx + 3.2, ly + 2.05, "374151");
  edge(lx + 2.85, ly + 2.25, 0.35, 0, true); lbl("ASSESSES", lx + 2.75, ly + 2.47, 0.6);
  node("Fix", lx + 1.7, ly + 2.85, "374151");
  edge(lx + 2.27, ly + 2.45, 0, 0.4, false); lbl("FIXES", lx + 2.33, ly + 2.55, 0.5, "left");
  node("Verification", lx + 3.2, ly + 2.85, SAGE);
  edge(lx + 2.85, ly + 3.05, 0.35, 0, true); lbl("VERIFIES", lx + 2.75, ly + 2.67, 0.6);
  s.addText("Fix -[:DERIVED_FROM]-> Fix keeps reuse lineage; Cause -[:RESPONSIBLE_TEAM]-> Team keeps attribution separate from reporter and assignee.", {
    x: lx + 0.15, y: ly + 3.28, w: 4.3, h: 0.25, fontFace: FONT_B, fontSize: 7.5, italic: true, color: "9CA3AF", isTextBox: true, margin: 0,
  });

  // Right: the three traversals.
  const rx = 5.35, rw = 4.15;
  const qs = [
    { h: "Which vehicles hold parts from this lot?", b: "Trace from a supplier lot or manufacturing lot through Origin and INSTALLED_IN intervals. DEMO-EV-003 holds two parts from one lot and is counted once." },
    { h: "Which verified fix connects to this defect?", b: "Walk Issue, Fix, Verification and DERIVED_FROM. Deterministic score: defect code +3, part family +2, cause type +1, process step +1. Supplier and team are never a reason." },
    { h: "Who is confirmed causal, not just reporting?", b: "Team counts split into reported, assigned-open and confirmed-cause. Supplier linked versus confirmed. Rate is null without a complete inspection cohort." },
  ];
  qs.forEach((q, i) => {
    const y = 1.45 + i * 1.2;
    numberDot(s, rx, y + 0.02, i + 1);
    s.addText(q.h, { x: rx + 0.45, y, w: rw - 0.45, h: 0.35, fontFace: FONT_H, fontSize: 12.5, bold: true, color: PAPER, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(q.b, { x: rx + 0.45, y: y + 0.38, w: rw - 0.45, h: 0.75, fontFace: FONT_B, fontSize: 9.5, color: "D1D5DB", isTextBox: true, margin: 0, valign: "top" });
  });
  footer(s, "Neo4j Aura (5.x), driver 6.2, per-workspace uniqueness constraints on (ws, id). Model in src/server/graph/schema.ts and index.ts.", true);
  s.addNotes("Judges asking 'why a graph': the answers are traversals over lots, origins, installations, fixes and verifications, not joins on a fixed schema. Point at Origin: a part that is bought and a part that is made share one shape, so one query answers both.");
}

// ---------- Slide 5: proof (numbers) ----------
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  title(s, "What is real: verified against the live Aura instance today");
  const stats = [
    { n: "22 / 22", l: "HTTP acceptance steps passed against real graph services", sub: "runner refuses to run against the in-memory double" },
    { n: "23 / 23", l: "steps after a documented server restart", sub: "same issue, identical history, persistence step added" },
    { n: "114", l: "Vitest tests passed, 8 skipped with a stated reason", sub: "typecheck and next build pass at dc32792" },
    { n: "2 / 1", l: "seeded issues / open, on a clean demo database", sub: "acceptance-run issues removed before the demo" },
  ];
  const sw = 2.15, gap = 0.13, y0 = 1.45;
  stats.forEach((st, i) => {
    const x = M + i * (sw + gap);
    card(s, x, y0, sw, 1.95, { fill: i === 0 ? INK : TINT });
    const dark = i === 0;
    s.addText(st.n, { x: x + 0.15, y: y0 + 0.12, w: sw - 0.3, h: 0.75, fontFace: FONT_H, fontSize: 30, bold: true, color: dark ? COPPER : INK, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(st.l, { x: x + 0.15, y: y0 + 0.9, w: sw - 0.3, h: 0.6, fontFace: FONT_B, fontSize: 10.5, bold: true, color: dark ? PAPER : INK, isTextBox: true, margin: 0, valign: "top" });
    s.addText(st.sub, { x: x + 0.15, y: y0 + 1.5, w: sw - 0.3, h: 0.4, fontFace: FONT_B, fontSize: 8.5, color: dark ? "9CA3AF" : MUTED, isTextBox: true, margin: 0, valign: "top" });
  });
  // Insights strip (real numbers after cleanup)
  const iy = 3.6;
  card(s, M, iy, 9.0, 1.45, { fill: TINT });
  s.addText("Team & supplier insights, live", { x: M + 0.2, y: iy + 0.1, w: 4, h: 0.3, fontFace: FONT_H, fontSize: 12.5, bold: true, color: INK, isTextBox: true, margin: 0 });
  const rows = [
    ["Final Inspection", "reported 1", "confirmed cause 0"],
    ["In-house Manufacturing", "reported 0", "confirmed cause 1"],
    ["Demo Connector Supplier", "linked 1 · confirmed 1", "rate N/A, no complete cohort"],
  ];
  rows.forEach((r, i) => {
    const y = iy + 0.45 + i * 0.3;
    s.addText(r[0], { x: M + 0.2, y, w: 2.4, h: 0.28, fontFace: FONT_B, fontSize: 10.5, bold: true, color: INK, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(r[1], { x: M + 2.7, y, w: 2.3, h: 0.28, fontFace: FONT_B, fontSize: 10.5, color: "374151", isTextBox: true, margin: 0, valign: "middle" });
    s.addText(r[2], { x: M + 5.1, y, w: 3.7, h: 0.28, fontFace: FONT_B, fontSize: 10.5, color: i === 2 ? COPPER_DK : "374151", bold: i === 2, isTextBox: true, margin: 0, valign: "middle" });
  });
  footer(s, "Evidence: docs/evidence/acceptance-graph-7bd3cbcf-before.json and -after.json, acceptance-graph-final-dc32792.json, GET /api/insights on 2026-09-12. We show N/A, not zero.");
  s.addNotes("The runner labels a double run as a dry run and refuses to claim integration unless /api/health reports graph services. 22 before restart, 23 after because the persistence step is only counted when --persist-from is given. Insights numbers are the seeded state after cleanup; they grow during the live demo.");
}

// ---------- Slide 6: limits and the ask ----------
{
  const s = pres.addSlide();
  s.background = { color: INK };
  title(s, "What is not built, and the next proof", { color: PAPER });
  const lx = M, lw = 4.4, rx = 5.2, rw = 4.3, y0 = 1.45;
  card(s, lx, y0, lw, 3.55, { fill: PANEL, line: "2C3440" });
  s.addText("Not built or not verified", { x: lx + 0.2, y: y0 + 0.12, w: lw - 0.4, h: 0.35, fontFace: FONT_H, fontSize: 14, bold: true, color: COPPER, isTextBox: true, margin: 0 });
  s.addText([
    { text: "CSV import in graph mode records a revision marker only; late-evidence correction is not wired.", options: { bullet: true, breakLine: true, paraSpaceAfter: 5 } },
    { text: "Supplier rates need an inspection cohort we have not seeded, so they show N/A.", options: { bullet: true, breakLine: true, paraSpaceAfter: 5 } },
    { text: "AI is optional and off by default. The assistant ran a labelled deterministic planner; a live model was not called in the recorded demo.", options: { bullet: true, breakLine: true, paraSpaceAfter: 5 } },
    { text: "Qoder-assisted development is not evidenced from the backend lane; the frontend adapter is untested. We do not claim it.", options: { bullet: true, breakLine: true, paraSpaceAfter: 5 } },
    { text: "Robotics regression fixture is not loaded into Neo4j; those tests skip with a stated reason.", options: { bullet: true } },
  ], { x: lx + 0.2, y: y0 + 0.55, w: lw - 0.4, h: 2.9, fontFace: FONT_B, fontSize: 10.5, color: "E5E7EB", isTextBox: true, margin: 0, valign: "top" });

  card(s, rx, y0, rw, 3.55, { fill: COPPER_DK, line: COPPER_DK });
  s.addText("The ask: one bounded pilot", { x: rx + 0.2, y: y0 + 0.12, w: rw - 0.4, h: 0.35, fontFace: FONT_H, fontSize: 14, bold: true, color: PAPER, isTextBox: true, margin: 0 });
  s.addText([
    { text: "One site, one process or part family, one named quality reviewer.", options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: "Three measured numbers: investigation time per issue, repeated issue families, verified fix reuse.", options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: "Pricing follows those numbers, not the other way round.", options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: "Repo: github.com/zubair480/belle-hackathon, branch codex/final-integration.", options: { bullet: true } },
  ], { x: rx + 0.2, y: y0 + 0.55, w: rw - 0.4, h: 2.9, fontFace: FONT_B, fontSize: 11, color: PAPER, isTextBox: true, margin: 0, valign: "top" });
  footer(s, "Track A Builder plus the Neo4j bonus. EV assembly is our chosen domain. Nothing in the demo is a real factory record.", true);
  s.addNotes("End here. If asked about AI: it drafts and explains with citations that are verified against source spans, it never confirms a cause or closes an issue. If asked about Qoder: say what was and was not used.");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("wrote", f));
