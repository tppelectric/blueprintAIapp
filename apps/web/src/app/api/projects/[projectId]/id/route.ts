import { proxyPutJson } from "../../../../../lib/api-proxy";

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const body = await request.json();
  return proxyPutJson(request, `/api/projects/${(await context.params).projectId}/id`, body);
}

