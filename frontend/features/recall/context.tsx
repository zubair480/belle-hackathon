"use client";
import { createContext, useContext } from "react";
import type { IssueInput, ReferenceCatalog } from "@/contracts/issues";
import type { AgentContext, UiAction } from "../../agent/types";
import type { RecallClient } from "./api/types";
import type { CatalogLookup } from "./format";
import type { CAMERA_PRESETS, ViewLayer } from "./sketches/car3d";

export type WorkspaceView = "vehicles" | "issues" | "resolutions" | "insights";

export type NewIssuePrefill = Partial<IssueInput> & { contextNote?: string };

export type CameraPreset = keyof typeof CAMERA_PRESETS;

/** A user- or agent-placed marker on the sketch: a part, or a wire of the platform wiring design. */
export type SketchMarker = { id: string; entityId: string | null; slot: string | null; wireId: string | null; note: string; source: "user" | "agent" };

/** Explorer state lives in the workspace so chat tools and screens share one source of truth. */
export type ExplorerState = {
  vehicleBuildId: string;
  selectedEntityId: string | null;
  markers: SketchMarker[];
  circuitId: string | null;
  wiring: boolean;
  markMode: boolean;
  /** "outside": body shell and exterior parts; "inside": cabin, electrical and powertrain with a ghosted body. */
  layer: ViewLayer;
  cameraRequest: { preset: CameraPreset; seq: number } | null;
};

export type WorkspaceApi = {
  client: RecallClient;
  catalog: ReferenceCatalog | null;
  lookup: CatalogLookup;
  view: WorkspaceView;
  navigate: (view: WorkspaceView) => void;
  openIssue: (issueId: string, tab?: string) => void;
  openNewIssue: (prefill?: NewIssuePrefill) => void;
  /** Open the vehicle explorer focused on an entity (part or vehicle). */
  openEntity: (entityId: string) => void;
  explorer: ExplorerState;
  setExplorer: (patch: Partial<ExplorerState> | ((s: ExplorerState) => Partial<ExplorerState>)) => void;
  /** Execute agent-proposed UI actions (select vehicle, focus, mark, open issue ...). */
  applyUiActions: (actions: UiAction[]) => void;
  agentContext: () => AgentContext;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
};

export const WorkspaceContext = createContext<WorkspaceApi | null>(null);

export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside RecallWorkspace");
  return ctx;
}
