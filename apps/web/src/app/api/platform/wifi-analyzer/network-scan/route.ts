import { proxyGet, proxyPostJson } from "../../../../../lib/api-proxy";

export async function POST(request: Request) {
  const body = await request.json();
  return proxyPostJson(request, "/api/platform/wifi-analyzer/network-scan", body);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.search || "";
  return proxyGet(request, `/api/platform/wifi-analyzer/network-scan/history${query}`);
}

