/**
 * Re-export shim: the UI lane lives in /frontend. This keeps the agreed mount path
 * (`import { RecallWorkspace } from "@/features/recall"`) working for Zubair's route.
 */
export * from "../../../frontend/features/recall";
