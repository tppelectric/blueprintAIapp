import { proxyPostJson } from "../../../../../../lib/api-proxy";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const body = await request.json().catch(() => ({}));
  return proxyPostJson(request, `/api/projects/${(await context.params).projectId}/exports/csv`, body);
}
