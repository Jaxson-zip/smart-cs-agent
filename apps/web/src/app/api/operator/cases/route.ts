import { proxyOperatorApi } from "../operator-proxy";

export async function GET() {
  return proxyOperatorApi("/v1/cases");
}
