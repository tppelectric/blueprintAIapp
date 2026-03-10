import { proxyGet } from "../../../../../../lib/api-proxy";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; scanJobId: string }> }
) {
  const { projectId, scanJobId } = await context.params;
  return proxyGet(request, `/api/projects/${projectId}/scan-jobs/${scanJobId}`);
}

