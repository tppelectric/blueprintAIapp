import { proxyDelete } from "../../../../../../lib/api-proxy";

export async function DELETE(request: Request, context: { params: Promise<{ scanId: string }> }) {
  return proxyDelete(request, `/api/platform/wifi-analyzer/network-scan/${(await context.params).scanId}`);
}
