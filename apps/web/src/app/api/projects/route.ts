import { proxyGet, proxyPostJson } from "../../../lib/api-proxy";

export async function GET(request: Request) {
  return proxyGet(request, "/api/projects");
}

export async function POST(request: Request) {
  const body = await request.json();
  return proxyPostJson(request, "/api/projects", body);
}
