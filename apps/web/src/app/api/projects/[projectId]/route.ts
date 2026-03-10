import { proxyDelete, proxyGet, proxyPutJson } from "../../../../lib/api-proxy";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const suffix = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
  return proxyGet(request, `/api/projects/${(await context.params).projectId}/dashboard${suffix}`);
}

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const body = await request.json();
  return proxyPutJson(request, `/api/projects/${(await context.params).projectId}`, body);
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return proxyDelete(request, `/api/projects/${(await context.params).projectId}`);
}

