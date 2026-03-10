import { proxyGet } from "../../../../../../../lib/api-proxy";

export async function GET(request: Request, context: { params: Promise<{ projectId: string; jobId: string }> }) {
  return proxyGet(request, `/api/projects/${(await context.params).projectId}/jobs/${(await context.params).jobId}/workspace`);
}
