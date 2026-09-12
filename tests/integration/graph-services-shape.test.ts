/**
 * Verifies the shape of Codey's export as soon as src/server/graph exists on the checkout:
 * `graphServices` (or default) must expose all DomainServices methods as functions. Skipped with
 * an explicit reason until the module is present. This is a static shape check, not a database test.
 */
import { describe, expect, it } from "vitest";
import type { DomainServices } from "@/contracts/recall";

const METHODS: Array<keyof DomainServices> = [
  "getCatalog", "upsertCatalogItem", "getEntityContext", "createIssue", "listIssues", "getIssue", "updateIssue", "addIssueComment",
  "recordCauseAssessment", "createFixRevision", "recordVerification", "transitionIssue", "findSimilarResolutions", "getInsights",
  "previewImport", "previewLateEvidence", "acceptImport", "runTrace", "getTrace", "compareTraces",
];

async function loadGraph(): Promise<Partial<DomainServices> | null> {
  const modulePath = "@/server/graph"; // FINAL INTEGRATION: replace with a static import
  try {
    const mod = (await import(/* @vite-ignore */ modulePath)) as { graphServices?: DomainServices; default?: DomainServices };
    return mod.graphServices ?? mod.default ?? null;
  } catch {
    return null;
  }
}

describe("graphServices export shape", () => {
  it("exposes every DomainServices method", async (ctx) => {
    const services = await loadGraph();
    if (!services) return ctx.skip("src/server/graph is not on this checkout; export shape UNVERIFIED");
    const missing = METHODS.filter((m) => typeof services[m] !== "function");
    expect(missing, `missing methods: ${missing.join(", ")}`).toEqual([]);
  });
});
