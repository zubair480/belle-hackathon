"use client";
import { createContext, useContext } from "react";
import type { IssueInput, ReferenceCatalog } from "@/contracts/issues";
import type { RecallClient } from "./api/types";
import type { CatalogLookup } from "./format";

export type WorkspaceView = "vehicles" | "issues" | "resolutions" | "insights";

export type NewIssuePrefill = Partial<IssueInput> & { contextNote?: string };

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
};

export const WorkspaceContext = createContext<WorkspaceApi | null>(null);

export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside RecallWorkspace");
  return ctx;
}
