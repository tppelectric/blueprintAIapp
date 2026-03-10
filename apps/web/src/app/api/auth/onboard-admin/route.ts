import { proxyPostJson } from "../../../../lib/api-proxy";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return proxyPostJson(request, "/api/auth/onboard-admin", body);
}
