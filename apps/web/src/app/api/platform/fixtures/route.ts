import { proxyGet } from "../../../../lib/api-proxy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.search ? url.search : "";
  return proxyGet(request, `/api/fixtures${query}`);
}
