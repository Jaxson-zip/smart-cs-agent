import {
  HealthResponseSchema,
  type HealthResponse,
} from "@smart-cs-agent/shared";

export const DEFAULT_API_BASE_URL = "http://localhost:4100";

export type ApiClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function resolveApiBaseUrl(
  value = process.env.NEXT_PUBLIC_API_URL,
): string {
  const baseUrl = value?.trim() || DEFAULT_API_BASE_URL;
  return baseUrl.replace(/\/+$/, "");
}

export async function fetchHealth(
  options: ApiClientOptions = {},
): Promise<HealthResponse> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${baseUrl}/health`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiClientError(
      `Health check failed with status ${response.status}`,
      response.status,
    );
  }

  const payload: unknown = await response.json();
  return HealthResponseSchema.parse(payload);
}
