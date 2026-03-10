import { proxyGet, proxyPutJson } from "../../../../lib/api-proxy";

export async function GET(request: Request) {
  return proxyGet(request, "/api/company/settings");
}

export async function PUT(request: Request) {
  const body = (await request.json()) as unknown;
  return proxyPutJson(request, "/api/company/settings", body);
}
