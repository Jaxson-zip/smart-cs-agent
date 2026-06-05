import { proxyOperatorApi } from "../../operator-proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyOperatorApi(`/v1/cases/${encodeURIComponent(id)}`);
}
