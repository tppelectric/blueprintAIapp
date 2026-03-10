import { proxyGet } from "../../../../../lib/api-proxy";

export async function GET(request: Request, context: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await context.params;
  return proxyGet(request, `/api/fixtures/${encodeURIComponent(fixtureId)}`);
}
