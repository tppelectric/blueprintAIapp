import { proxyGet, proxyPostJson } from "../../../../../lib/api-proxy";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return proxyGet(request, `/api/projects/${(await context.params).projectId}/jobs`);
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const body = await request.json();
  return proxyPostJson(request, `/api/projects/${(await context.params).projectId}/jobs`, body);
}
