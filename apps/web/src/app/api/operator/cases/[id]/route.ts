import { proxyOperatorApi } from "../../operator-proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyOperatorApi(request, `/v1/cases/${encodeURIComponent(id)}`);
}
