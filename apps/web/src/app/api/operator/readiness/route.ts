import { proxyOperatorApi } from "../operator-proxy";

export async function GET(request: Request) {
  return proxyOperatorApi(request, "/health/ready", { requireSession: false });
}
