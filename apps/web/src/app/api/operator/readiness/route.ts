import { proxyOperatorApi } from "../operator-proxy";

export async function GET() {
  return proxyOperatorApi("/health/ready", { requireOperatorKey: false });
}
