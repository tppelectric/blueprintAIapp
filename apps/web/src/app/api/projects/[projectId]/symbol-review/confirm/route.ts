import { proxyPostJson } from "../../../../../../lib/api-proxy";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const body = await request.json();
  return proxyPostJson(request, `/api/projects/${(await context.params).projectId}/symbol-review/confirm`, body);
}
