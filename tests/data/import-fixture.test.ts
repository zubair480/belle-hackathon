import { describe, expect, it } from "vitest";
import { loadEvFixtureImport, loadLateEvidenceImport } from "@/server/data/fixture";
import { loadNhtsaCache } from "@/server/data/nhtsa";
import { loadAssemblyRegressionImport } from "@/server/data/regression";
import { canonicalJson, parseCsv, sha256 } from "@/server/data/canonical";
import { inspectImport } from "@/server/graph/cody/imports";

describe("controlled EV data fixture", () => {
  it("parses quoted CSV cells and hashes canonical values deterministically", () => {
    const [row] = parseCsv("id,note\nA-1,\"one, two\"\n");
    expect(row).toEqual({ row: 2, values: { id: "A-1", note: "one, two" } });
    expect(sha256(canonicalJson({ b: 2, a: ["x"] }))).toBe(sha256(canonicalJson({ a: ["x"], b: 2 })));
  });

  it("accepts the complete EV fixture and keeps all five controlled files", async () => {
    const input = await loadEvFixtureImport();
    const inspection = inspectImport(input);
    const entities = input.files.find((file) => file.name === "entities.csv")?.text ?? "";
    expect(inspection.canAccept).toBe(true);
    expect(inspection.coverage.missing).toEqual([]);
    expect(inspection.sourceHashes).toHaveLength(5);
    expect(entities).toContain("EVID-HIST-BRKT-FIX-0007");
    expect(entities).toContain("EVID-HIST-CONN-SUP-0009");
    expect(entities).toContain("CONN-0007");
  });

  it("creates a new acceptable revision when late evidence assigns CONN-0099 to the supplier lot", async () => {
    const base = inspectImport(await loadEvFixtureImport());
    const late = inspectImport(await loadLateEvidenceImport("rev-base"));
    expect(late.canAccept).toBe(true);
    expect(late.dataHash).not.toBe(base.dataHash);
  });

  it("treats exact canonical source rows as idempotent", async () => {
    const baseline = inspectImport(await loadEvFixtureImport());
    const input = await loadEvFixtureImport();
    const entities = input.files.find((file) => file.name === "entities.csv");
    if (!entities) throw new Error("fixture lacks entities.csv");
    const [header, firstEntity] = entities.text.trimEnd().split("\n");
    if (!header || !firstEntity) throw new Error("fixture lacks an entity row");
    entities.text += `${firstEntity}\n`;
    const inspection = inspectImport(input);
    expect(inspection.canAccept).toBe(true);
    expect(inspection.dataHash).toBe(baseline.dataHash);
    expect(inspection.issues.some((issue) => issue.code === "AMBIGUOUS_IDENTITY")).toBe(false);
  });

  it("rejects a simultaneous parent conflict", async () => {
    const input = await loadEvFixtureImport();
    const installations = input.files.find((file) => file.name === "installations.csv");
    if (!installations) throw new Error("fixture lacks installations.csv");
    installations.text += "INST-CONFLICT,CONN-0004,CPM-0005,connector,2026-09-03T08:00:00Z,,2026-09-03T08:05:00Z,[]\n";
    const inspection = inspectImport(input);
    expect(inspection.canAccept).toBe(false);
    expect(inspection.issues.some((issue) => issue.code === "CONFLICTING_INSTALLATION")).toBe(true);
  });

  it("rejects missing references and overlapping physical slots", async () => {
    const missingReference = await loadEvFixtureImport();
    const missingInstallations = missingReference.files.find((file) => file.name === "installations.csv");
    if (!missingInstallations) throw new Error("fixture lacks installations.csv");
    missingInstallations.text += "INST-MISSING,UNKNOWN-COMPONENT,CPM-0004,connector,2026-09-03T08:00:00Z,,2026-09-03T08:05:00Z,[]\n";
    expect(inspectImport(missingReference).issues.some((issue) => issue.code === "MISSING_REFERENCE")).toBe(true);

    const slotOverlap = await loadEvFixtureImport();
    const overlapInstallations = slotOverlap.files.find((file) => file.name === "installations.csv");
    if (!overlapInstallations) throw new Error("fixture lacks installations.csv");
    overlapInstallations.text += "INST-SLOT-OVERLAP,CONN-0004,CPM-0004,bracket,2026-09-03T08:00:00Z,,2026-09-03T08:05:00Z,[]\n";
    expect(inspectImport(slotOverlap).issues.some((issue) => issue.code === "SLOT_OVERLAP")).toBe(true);
  });

  it("rejects BOM-style files instead of deriving containment from them", async () => {
    const input = await loadEvFixtureImport();
    input.files.push({ name: "bom.csv" as never, text: "parentId,childId\nCPM-0004,CONN-0004\n" });
    expect(() => inspectImport(input)).toThrow();
  });

  it("retains public NHTSA records as contextual source material", async () => {
    const records = await loadNhtsaCache();
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.sourceUrl.startsWith("https://api.nhtsa.gov/"))).toBe(true);
    expect(records.every((record) => record.rawSourceHash === sha256(record.text))).toBe(true);
    expect(records.every((record) => !record.text.includes("DEMO-EV-005"))).toBe(true);
  });

  it("keeps the robotics fixture in a distinct regression-only v4 adapter", async () => {
    const input = await loadAssemblyRegressionImport();
    const inspection = inspectImport(input);
    expect(inspection.canAccept).toBe(true);
    expect(input.scope.trackedPartNumber).toBe("ENC-42");
    expect(input.files.find((file) => file.name === "entities.csv")?.text).toContain("R001,vehicle");
    expect(input.files.find((file) => file.name === "entities.csv")?.text).not.toContain("DEMO-EV-");
  });
});
