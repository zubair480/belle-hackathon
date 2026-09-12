import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EvidenceSchema, type Evidence, type RequestContext } from "@/contracts/common";
import { canonicalJson, sha256 } from "./canonical";
import { executeWrite } from "../graph/cody/driver";

type CachedRecord = {
  sourceKind: "public_complaint" | "public_recall";
  sourceRecordId: string;
  sourceUrl: string;
  retrievedAt: string;
  rawSourceHash: string;
  text: string;
};

const cachePath = join(process.cwd(), "fixtures", "ev", "nhtsa", "ioniq5-2022-reviewed.json");

export async function loadNhtsaCache(): Promise<CachedRecord[]> {
  const parsed = JSON.parse(await readFile(cachePath, "utf8")) as { records?: unknown };
  if (!Array.isArray(parsed.records)) throw new Error("NHTSA fixture cache must contain records.");
  return parsed.records.map((record) => {
    if (!record || typeof record !== "object") throw new Error("NHTSA fixture cache contains an invalid record.");
    const value = record as Record<string, unknown>;
    if ((value.sourceKind !== "public_complaint" && value.sourceKind !== "public_recall") ||
      typeof value.sourceRecordId !== "string" || typeof value.sourceUrl !== "string" ||
      typeof value.retrievedAt !== "string" || typeof value.rawSourceHash !== "string" || typeof value.text !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.rawSourceHash) || value.rawSourceHash !== sha256(value.text)) {
      throw new Error("NHTSA fixture cache contains an invalid public record.");
    }
    return {
      sourceKind: value.sourceKind,
      sourceRecordId: value.sourceRecordId,
      sourceUrl: value.sourceUrl,
      retrievedAt: value.retrievedAt,
      rawSourceHash: value.rawSourceHash,
      text: value.text,
    };
  });
}

export async function cacheNhtsaRecords(ctx: RequestContext): Promise<Evidence[]> {
  const rows = (await loadNhtsaCache()).map((record) => {
    const candidate = {
      id: `EVID-NHTSA-${record.sourceRecordId}`,
      sourceName: "NHTSA reviewed cache",
      locator: record.sourceRecordId,
      text: record.text,
      sourceKind: record.sourceKind,
      sourceRecordId: record.sourceRecordId,
      sourceUrl: record.sourceUrl,
      retrievedAt: record.retrievedAt,
    };
    return {
      ...record,
      evidence: EvidenceSchema.parse({ ...candidate, sourceHash: sha256(canonicalJson(candidate)) }),
    };
  });

  await executeWrite(async (tx) => {
    await tx.run(`
      UNWIND $rows AS row
      MERGE (external:ExternalRecord {workspaceId: $workspaceId, sourceKind: row.sourceKind, sourceRecordId: row.sourceRecordId})
        ON CREATE SET external.sourceUrl = row.sourceUrl, external.retrievedAt = row.retrievedAt, external.text = row.text,
          external.sourceHash = row.rawSourceHash, external.rawSourceHash = row.rawSourceHash
      MERGE (evidence:Evidence {workspaceId: $workspaceId, evidenceId: row.evidence.id})
        ON CREATE SET evidence += row.evidence
      MERGE (evidence)-[:SUPPORTS]->(external)
    `, { workspaceId: ctx.workspaceId, rows });
  });
  return rows.map((row) => row.evidence);
}
