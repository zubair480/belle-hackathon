import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

/** Prepared demo action: stages the fixture late batch sheet for review. Not a general file reader. */
export async function POST(req: Request): Promise<Response> {
  return apiHandlers().lateEvidencePreview(req);
}
