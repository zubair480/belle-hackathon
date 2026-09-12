import { apiHandlers } from "@/server/application";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return apiHandlers().catalog();
}
