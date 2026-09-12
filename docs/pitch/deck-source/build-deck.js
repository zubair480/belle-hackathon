// RecallRadius judge deck, 4 slides. Slides 1 and 2 before the live demo, 3 and 4 after.
// Every product number was observed on the shared Aura instance or in docs/evidence on
// 2026-09-12; industry figures name their source in the slide footer.
// Run: node build-deck.js <out.pptx>
const pptxgen = require("pptxgenjs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "RecallRadius_Judge_Deck.pptx");

const INK = "14181F";
const PANEL = "1E242E";
const PAPER = "FFFFFF";
const TINT = "F3F4F6";
const COPPER = "D9752B";
const COPPER_DK = "B85E1C";
const MUTED = "6B7280";
const SAGE = "3E8E6E";
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
    x: M, y: 5.2, w: W - 2 * M, h: 0.3, fontFace: FONT_B, fontSize: 8.5, color: dark ? "9CA3AF" : MUTED,
    isTextBox: true, margin: 0, valign: "middle",
  });
}
function numberDot(slide, x, y, n) {
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

// ---------- Slide 1: title / the question ----------
{
  const s = pres.addSlide();
  s.background = { color: INK };
  s.addText("RecallRadius", {
    x: M, y: 0.55, w: 6, h: 0.5, fontFace: FONT_B, fontSize: 14, color: COPPER, bold: true, charSpacing: 4, isTextBox: true, margin: 0,
  });
  s.addText("One EV fails final inspection. Where did the part come from, and has anyone fixed this before?", {
    x: M, y: 1.05, w: 6.1, h: 2.0, fontFace: FONT_H, fontSize: 30, bold: true, color: PAPER, isTextBox: true, margin: 0, valign: "top",
  });
  s.addText(
    "An issue-to-verified-fix workspace for EV vehicle assemblers. Every issue, part, lot, team, cause, fix and verification is one connected record in Neo4j.",
    { x: M, y: 3.2, w: 6.0, h: 0.9, fontFace: FONT_B, fontSize: 14, color: "D1D5DB", isTextBox: true, margin: 0, valign: "top" },
  );
  s.addText("B.E.L.L.E hackathon, San Francisco, 12 September 2026  ·  Zubair (backend, contract, Neo4j, integration), Ali (frontend, pitch), Codey (data, trace fixtures)", {
    x: M, y: 4.3, w: 6.2, h: 0.6, fontFace: FONT_B, fontSize: 10.5, color: "9CA3AF", isTextBox: true, margin: 0, valign: "top",
  });
  const gx = 7.0;
  card(s, gx, 1.0, 2.5, 3.9, { fill: PANEL, line: "2C3440" });
  s.addText("DEMO-EV-005", { x: gx, y: 1.15, w: 2.5, h: 0.3, fontFace: FONT_B, fontSize: 11, bold: true, color: PAPER, align: "center", isTextBox: true, margin: 0 });
  s.addText("sedan build, VIN not assigned", { x: gx, y: 1.42, w: 2.5, h: 0.25, fontFace: FONT_B, fontSize: 9, color: "9CA3AF", align: "center", isTextBox: true, margin: 0 });
  const nodes = [
    { label: "CPM-0005", sub: "charge-port module", x: gx + 0.75, y: 1.95, fill: "2C3440" },
    { label: "CONN-0005", sub: "bought · DEMO-SUP-LOT-01", x: gx + 0.1, y: 3.15, fill: COPPER_DK },
    { label: "BRKT-0005", sub: "made · DEMO-MFG-LOT-01", x: gx + 1.4, y: 3.15, fill: SAGE },
  ];
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
  s.addNotes("Say the synthetic-data line once. Final Inspection finds the charge-port connector sitting proud on DEMO-EV-005. The connector was bought; the bracket under it was made in-house. Today those records, the last fix and its verification live in different systems, and the team that found the defect usually gets the blame. Then go straight to slide 2, then the live demo.");
}

// ---------- Slide 2: why the problem is big ----------
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  title(s, "The problem is measured in tens of billions a year");
  const stats = [
    { n: "$57.9B", l: "warranty claims paid by 40 global carmakers in 2024", sub: "Warranty Week, Oct 2025" },
    { n: "2.2%", l: "warranty claims rate in 2024, up from 1.9%: one-sixth worse in a year", sub: "Warranty Week, Oct 2025" },
    { n: "3 to 4%", l: "of OEM revenue now goes to warranty claims", sub: "WardsAuto, Apr 2026" },
    { n: "27.7M", l: "US vehicles recalled in 2024; electrical systems the top component", sub: "NHTSA 2024 report" },
  ];
  const sw = 2.15, gap = 0.13, y0 = 1.45;
  stats.forEach((st, i) => {
    const x = M + i * (sw + gap);
    card(s, x, y0, sw, 1.75, { fill: i === 1 ? INK : TINT });
    const dark = i === 1;
    s.addText(st.n, { x: x + 0.15, y: y0 + 0.08, w: sw - 0.3, h: 0.6, fontFace: FONT_H, fontSize: 28, bold: true, color: dark ? COPPER : INK, isTextBox: true, margin: 0, valign: "middle", fit: "shrink" });
    s.addText(st.l, { x: x + 0.15, y: y0 + 0.72, w: sw - 0.3, h: 0.7, fontFace: FONT_B, fontSize: 10.5, bold: true, color: dark ? PAPER : INK, isTextBox: true, margin: 0, valign: "top" });
    s.addText(st.sub, { x: x + 0.15, y: y0 + 1.42, w: sw - 0.3, h: 0.28, fontFace: FONT_B, fontSize: 8.5, color: dark ? "9CA3AF" : MUTED, isTextBox: true, margin: 0, valign: "top" });
  });
  // Lower band: the cost pool and the three levers we take cost out on.
  const by = 3.6;
  card(s, M, by, 2.6, 1.45, { fill: INK });
  s.addText("5 to 30%", { x: M + 0.15, y: by + 0.1, w: 2.3, h: 0.55, fontFace: FONT_H, fontSize: 24, bold: true, color: COPPER, isTextBox: true, margin: 0, valign: "middle" });
  s.addText("of revenue is the industry range for the cost of poor quality: scrap, rework, warranty, returns.", {
    x: M + 0.15, y: by + 0.65, w: 2.3, h: 0.75, fontFace: FONT_B, fontSize: 9, color: "D1D5DB", isTextBox: true, margin: 0, valign: "top",
  });
  const levers = [
    { h: "Investigation time", b: "both origins, the prior fix and its verification in one record" },
    { h: "Repeated issue families", b: "the verified fix for the same defect, part family and step is retrieved" },
    { h: "Verified fix reuse", b: "a reused fix is a proposal until this vehicle passes its own check" },
  ];
  const lx = M + 2.75, lw = (9.0 - 2.75 - 0.2) / 3;
  s.addText("Where RecallRadius takes cost out, and what a pilot measures", { x: lx, y: by - 0.3, w: 6.2, h: 0.28, fontFace: FONT_B, fontSize: 10, bold: true, color: INK, isTextBox: true, margin: 0, valign: "middle" });
  levers.forEach((l, i) => {
    const x = lx + i * (lw + 0.1);
    card(s, x, by, lw, 1.45, { fill: TINT });
    numberDot(s, x + 0.12, by + 0.12, i + 1);
    s.addText(l.h, { x: x + 0.52, y: by + 0.1, w: lw - 0.6, h: 0.38, fontFace: FONT_H, fontSize: 11, bold: true, color: INK, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(l.b, { x: x + 0.12, y: by + 0.55, w: lw - 0.24, h: 0.85, fontFace: FONT_B, fontSize: 9, color: "374151", isTextBox: true, margin: 0, valign: "top" });
  });
  footer(s, "Public industry figures, not our measurements; the cost-of-poor-quality range is as cited by industry sources. We claim no savings, customers or market share.");
  s.addNotes("Twenty seconds. Forty global carmakers paid fifty-eight billion in warranty claims in 2024 and the claims rate is rising. Every dollar started as an issue someone found on a line. We work on the step between finding the defect and proving the fix, on three cost lines a pilot can measure. Now switch to the app.");
}

// ---------- Slide 3: why Neo4j, and what is real ----------
{
  const s = pres.addSlide();
  s.background = { color: INK };
  title(s, "Why Neo4j, and what is real today", { color: PAPER });
  const lx = M, ly = 1.45;
  card(s, lx, ly, 4.6, 3.55, { fill: PANEL, line: "2C3440" });
  const node = (label, x, y, fill, w = 1.15) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.4, rectRadius: 0.08, fill: { color: fill }, line: { color: fill } });
    s.addText(label, { x, y, w, h: 0.4, fontFace: FONT_B, fontSize: 9, bold: true, color: PAPER, align: "center", valign: "middle", isTextBox: true, margin: 0 });
  };
  const edge = (x, y, w, h, flipH) => s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color: "9CA3AF", width: 1, endArrowType: "triangle" }, flipH: !!flipH });
  const lbl = (t, x, y, w = 1.2, align = "center") => s.addText(t, { x, y, w, h: 0.2, fontFace: FONT_B, fontSize: 7, color: "9CA3AF", align, isTextBox: true, margin: 0 });
  node("Supplier", lx + 0.2, ly + 0.25, "4B5563");
  node("SupplierLot", lx + 1.7, ly + 0.25, COPPER_DK);
  node("MfgLot", lx + 3.2, ly + 0.25, SAGE);
  edge(lx + 1.35, ly + 0.45, 0.35, 0, false); lbl("SUPPLIED_BY", lx + 1.05, ly + 0.05, 0.95);
  node("Origin", lx + 1.7, ly + 1.15, "374151");
  edge(lx + 2.27, ly + 0.65, 0, 0.5); lbl("FROM_SUPPLIER_LOT", lx + 2.3, ly + 0.72, 1.1);
  edge(lx + 2.85, ly + 1.35, 0.35, 0); lbl("PRODUCED_IN", lx + 2.75, ly + 1.55, 0.7);
  node("Team", lx + 3.2, ly + 1.15, "4B5563");
  edge(lx + 3.77, ly + 0.65, 0, 0.5); lbl("MADE_BY", lx + 3.8, ly + 0.72, 0.6);
  node("Entity (part)", lx + 0.2, ly + 1.15, "374151");
  edge(lx + 1.35, ly + 1.35, 0.35, 0); lbl("HAS_ORIGIN", lx + 1.2, ly + 1.57, 0.65);
  node("Entity (vehicle)", lx + 0.2, ly + 2.05, "374151");
  edge(lx + 0.77, ly + 1.55, 0, 0.5); lbl("INSTALLED_IN", lx + 0.02, ly + 1.7, 0.7, "right");
  node("Issue", lx + 1.7, ly + 2.05, COPPER);
  edge(lx + 1.35, ly + 2.25, 0.35, 0, true); lbl("AFFECTS", lx + 1.25, ly + 2.47, 0.55);
  node("Cause", lx + 3.2, ly + 2.05, "374151");
  edge(lx + 2.85, ly + 2.25, 0.35, 0, true); lbl("ASSESSES", lx + 2.75, ly + 2.47, 0.6);
  node("Fix", lx + 1.7, ly + 2.85, "374151");
  edge(lx + 2.27, ly + 2.45, 0, 0.4, false); lbl("FIXES", lx + 2.33, ly + 2.55, 0.5, "left");
  node("Verification", lx + 3.2, ly + 2.85, SAGE);
  edge(lx + 2.85, ly + 3.05, 0.35, 0, true); lbl("VERIFIES", lx + 2.75, ly + 2.67, 0.6);
  s.addText("Which vehicles hold parts from this lot, which verified fix connects to this defect, who is confirmed causal versus reporting: traversals, not joins.", {
    x: lx + 0.15, y: ly + 3.25, w: 4.3, h: 0.28, fontFace: FONT_B, fontSize: 7.5, italic: true, color: "9CA3AF", isTextBox: true, margin: 0,
  });

  const rx = 5.35, rw = 4.15;
  const proof = [
    { n: "22 / 22", l: "HTTP acceptance steps passed against the live Aura instance; the runner refuses the in-memory double" },
    { n: "23 / 23", l: "after a documented server restart, same issue, identical history" },
    { n: "114", l: "Vitest tests passed, 8 skipped with a stated reason; typecheck and build pass" },
    { n: "N/A", l: "supplier rate shown when no complete inspection cohort exists, never zero" },
  ];
  proof.forEach((p, i) => {
    const y = 1.45 + i * 0.9;
    s.addText(p.n, { x: rx, y, w: 1.35, h: 0.8, fontFace: FONT_H, fontSize: 24, bold: true, color: i === 3 ? COPPER : PAPER, isTextBox: true, margin: 0, valign: "top", fit: "shrink" });
    s.addText(p.l, { x: rx + 1.45, y: y + 0.05, w: rw - 1.45, h: 0.8, fontFace: FONT_B, fontSize: 10, color: "D1D5DB", isTextBox: true, margin: 0, valign: "top" });
  });
  footer(s, "Neo4j Aura, driver 6.2, uniqueness on (ws, id). Evidence: docs/evidence/acceptance-graph-7bd3cbcf-before.json and -after.json, acceptance-graph-final-dc32792.json.", true);
  s.addNotes("After the demo. Left: the real model. A bought part and a made part share one Origin shape, so one query answers both. Right: what we verified today against the live Aura instance, with a restart in between.");
}

// ---------- Slide 4: not built, and the ask ----------
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
  s.addNotes("End here. If asked about AI: it drafts and explains with citations verified against source spans; it never confirms a cause or closes an issue. If asked about Qoder: say what was and was not used.");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("wrote", f));
