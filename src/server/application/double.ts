/**
 * Combined DomainServices double = issue double + trace double. Development/test only; selected
 * by the explicit setting RECALL_SERVICES=double and never a fallback for a failing real service.
 */
import type { DomainServices } from "@/contracts/recall";
import { createIssueDouble, type IssueDoubleOptions } from "./double-issues";
import { createTraceDouble, type TraceDoubleOptions } from "./double-trace";

export type ServiceDoubleOptions = { issues?: IssueDoubleOptions; trace?: TraceDoubleOptions; workspaceId?: string; now?: () => string };

export function createServiceDouble(options: ServiceDoubleOptions = {}): DomainServices {
  const shared = { workspaceId: options.workspaceId, now: options.now };
  const issues = createIssueDouble({ ...shared, ...options.issues });
  const trace = createTraceDouble({ ...shared, ...options.trace });
  return { ...issues, ...trace };
}

export { createIssueDouble, createTraceDouble };
