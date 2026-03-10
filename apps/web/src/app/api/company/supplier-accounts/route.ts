import { proxyGet, proxyPostJson } from "../../../../lib/api-proxy";

export async function GET(request: Request) {
  return proxyGet(request, "/api/company/supplier-accounts");
}

export async function POST(request: Request) {
  const body = (await request.json()) as unknown;
  return proxyPostJson(request, "/api/company/supplier-accounts", body);
}
