import { proxyPostJson } from "../../../../../lib/api-proxy";

export async function POST(request: Request) {
  const body = await request.json();
  return proxyPostJson(request, "/api/platform/load-calculator/assign", body);
}

