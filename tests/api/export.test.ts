import { describe, expect, it } from "vitest";
import { DEMO, EXPORT_COLUMNS, type TraceResult } from "@/contracts/recall";
import { categorize, escapeCell, exportFileName, neutralizeCell, traceToCsv } from "@/server/application/export";

const run: TraceResult = {
  runId: "run-7",
  revisionId: "rev-1",
  rootLotIds: ["T17"],
  createdAt: "2026-09-12T15:00:00Z",
  engineVersion: "test",
  dataHash: "abc",
  scope: DEMO.scope,
  executionStatus: "completed",
  dataCompleteness: "gaps_found",
  known: { onsiteKg: 160, shippedKg: 120, consigneeCount: 3 },
  unresolvedOnly: { onsiteKg: 40, shippedKg: 60 },
  disposedKg: 10,
  rows: [
    {
      lotId: "F-A",
      productLabel: 'finished "Harbor" lot, 60kg',
      brandLabel: null,
      onsiteKg: 20,
      shippedKg: 40,
      shipmentLineIds: ["SL-A"],
      consigneeIds: ["C-NorthMart"],
      knownMaterialPath: true,
      hasUnresolvedEvidence: false,
      evidenceIds: ["E1", "E2"],
      issueIds: [],
    },
    {
      lotId: "F-E",
      productLabel: "=HYPERLINK(\"http://evil\")",
      brandLabel: "+Dune",
      onsiteKg: 40,
      shippedKg: 60,
      shipmentLineIds: ["SL-E"],
      consigneeIds: ["C-DeltaFoods"],
      knownMaterialPath: false,
      hasUnresolvedEvidence: true,
      evidenceIds: [],
      issueIds: ["ISSUE-MISSING-ORIGIN-R-UNK"],
    },
    {
      lotId: "F-D",
      productLabel: "-control lot\nwith newline",
      brandLabel: "@Control",
      onsiteKg: 30,
      shippedKg: 70,
      shipmentLineIds: ["SL-D"],
      consigneeIds: ["C-ControlFoods"],
      knownMaterialPath: false,
      hasUnresolvedEvidence: false,
      evidenceIds: [],
      issueIds: [],
    },
  ],
  issues: [],
  evidence: [],
  paths: [],
  consignees: [],
};

describe("CSV export", () => {
  it("neutralizes spreadsheet formula triggers", () => {
    expect(neutralizeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(neutralizeCell("+1")).toBe("'+1");
    expect(neutralizeCell("-1")).toBe("'-1");
    expect(neutralizeCell("@cmd")).toBe("'@cmd");
    expect(neutralizeCell("\tx")).toBe("'\tx");
    expect(neutralizeCell("plain")).toBe("plain");
  });

  it("quotes every cell and doubles embedded quotes; nulls become empty cells", () => {
    expect(escapeCell('a "b" c')).toBe('"a ""b"" c"');
    expect(escapeCell("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(12.5)).toBe('"12.5"');
    expect(escapeCell(true)).toBe('"true"');
  });

  it("categorizes rows without ever labeling anything safe", () => {
    expect(categorize(run.rows[0]!)).toBe("traced_potential_impact");
    expect(categorize(run.rows[1]!)).toBe("unresolved_scope");
    expect(categorize(run.rows[2]!)).toBe("no_recorded_material_path");
    expect(traceToCsv(run).toLowerCase()).not.toMatch(/\bsafe\b/);
  });

  it("writes the frozen header, one row per lot sorted by lot id, and a summary block", () => {
    const csv = traceToCsv(run);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(EXPORT_COLUMNS.map((c) => `"${c}"`).join(","));
    expect(lines[1]).toContain('"F-A"');
    expect(lines[2]).toContain('"F-D"');
    expect(lines[3]).toContain('"F-E"');
    expect(lines[1]).toContain('"finished ""Harbor"" lot, 60kg"');
    expect(lines[3]).toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(lines[3]).toContain("\"'+Dune\"");
    expect(lines[2]).toContain("\"'@Control\"");
    expect(lines[1]).toContain('"rev-1"');
    expect(lines[1]).toContain(`"${DEMO.scope.inventoryAsOf}"`);
    expect(lines[1]).toContain('"kg"');
    expect(csv).toContain('"summary","unresolvedOnly.onsiteKg","40"');
    expect(csv).toContain('"summary","disposedKg","10"');
    expect(csv).toContain("not a compliance certificate");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("derives a filesystem-safe export name", () => {
    expect(exportFileName({ ...run, runId: "run/../7 x" })).toBe("recallradius-trace-run_.._7_x.csv");
  });
});
