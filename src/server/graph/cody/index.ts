import {
  acceptImport,
  previewImport,
  previewLateEvidence,
} from "./imports";
import {
  compareTraces,
  getTrace,
  runTrace,
} from "./traces";
import type { TraceServices } from "@/contracts/recall";

export { applySchema } from "./schema";
export { cacheNhtsaRecords, loadNhtsaCache } from "../../data/nhtsa";
export { closeNeo4jDriver, verifyNeo4jConnectivity } from "./driver";

export const traceServices = {
  previewImport,
  previewLateEvidence,
  acceptImport,
  runTrace,
  getTrace,
  compareTraces,
} satisfies TraceServices;
