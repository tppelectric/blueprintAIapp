import { proxyPostJson } from "../../../../../lib/api-proxy";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const body = await request.json();
  const { projectId } = await context.params;
  return proxyPostJson(request, `/api/projects/${projectId}/scan-jobs`, body);
}

