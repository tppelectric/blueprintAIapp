import { proxyGet } from "../../../../../lib/api-proxy";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const query = new URL(request.url).searchParams.toString();
  const suffix = query ? `?${query}` : "";
  return proxyGet(request, `/api/projects/${(await context.params).projectId}/blueprint-processing-runs${suffix}`);
}
