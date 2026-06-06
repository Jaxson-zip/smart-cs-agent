import { proxyOperatorApi } from "../../../operator-proxy";
import { requireChannelEventReviewAccess } from "../../review-permission";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const accessResponse = await requireChannelEventReviewAccess(request);
  if (accessResponse) return accessResponse;

  const { id } = await context.params;
  return proxyOperatorApi(
    request,
    `/v1/channel-events/${encodeURIComponent(id)}/replay`,
    { method: "POST" },
  );
}
