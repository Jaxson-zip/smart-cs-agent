import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type RequestHeaders = Record<string, string | string[] | undefined>;
export type RequestAuthMethod = "operator_api_key" | "insecure_headers";

const operatorApiKeySchema = z.object({
  key: z.string().min(8),
  tenantId: z.string().min(1),
  operatorId: z.string().min(1),
  role: z.enum(["admin", "operator", "viewer"]).default("operator"),
});

export type RequestContext = {
  tenantId: string;
  operatorId: string;
  role: "admin" | "operator" | "viewer";
  authMethod?: RequestAuthMethod;
};

export function requireRequestContext(
  headers: RequestHeaders,
  env: NodeJS.ProcessEnv = process.env,
): RequestContext {
  const apiKeys = parseOperatorApiKeys(env.OPERATOR_API_KEYS);
  if (apiKeys.length > 0) {
    const presentedKey = readBearerToken(headers) ?? readHeader(headers, "x-api-key");
    if (!presentedKey) {
      throw new UnauthorizedException("Missing operator API key");
    }

    const matchedKey = apiKeys.find((apiKey) =>
      secureCompare(apiKey.key, presentedKey),
    );
    if (!matchedKey) {
      throw new UnauthorizedException("Invalid operator API key");
    }

    const requestedTenantId = readHeader(headers, "x-tenant-id");
    if (requestedTenantId && requestedTenantId !== matchedKey.tenantId) {
      throw new ForbiddenException("Operator API key does not allow requested tenant");
    }

    return withAuthMethod(
      {
        tenantId: matchedKey.tenantId,
        operatorId: matchedKey.operatorId,
        role: matchedKey.role,
      },
      "operator_api_key",
    );
  }

  if (env.NODE_ENV === "production" && env.ALLOW_INSECURE_OPERATOR_HEADERS !== "true") {
    throw new UnauthorizedException("Operator API key is required");
  }

  const tenantId = readHeader(headers, "x-tenant-id");
  const operatorId = readHeader(headers, "x-operator-id") ?? "sandbox_operator";

  if (!tenantId) {
    throw new UnauthorizedException("Missing x-tenant-id header");
  }

  return withAuthMethod(
    {
      tenantId,
      operatorId,
      role: "admin",
    },
    "insecure_headers",
  );
}

export function requireTenantParamAccess(
  context: RequestContext,
  tenantId: string,
) {
  if (context.tenantId !== tenantId) {
    throw new ForbiddenException("Tenant context does not match requested tenant");
  }
}

function readHeader(headers: RequestHeaders, key: string): string | undefined {
  const matchedKey = Object.keys(headers).find(
    (headerKey) => headerKey.toLowerCase() === key.toLowerCase(),
  );
  const value = matchedKey ? headers[matchedKey] : undefined;
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) return undefined;

  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBearerToken(headers: RequestHeaders): string | undefined {
  const authorization = readHeader(headers, "authorization");
  if (!authorization) return undefined;

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer") return undefined;

  return token?.trim() || undefined;
}

function parseOperatorApiKeys(value?: string) {
  if (!value?.trim()) return [];

  try {
    const parsedJson: unknown = JSON.parse(value);
    return z.array(operatorApiKeySchema).parse(parsedJson);
  } catch {
    throw new InternalServerErrorException(
      "Invalid OPERATOR_API_KEYS configuration",
    );
  }
}

function secureCompare(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function withAuthMethod(
  context: Omit<RequestContext, "authMethod">,
  authMethod: RequestAuthMethod,
): RequestContext {
  return Object.defineProperty(context, "authMethod", {
    value: authMethod,
    enumerable: false,
  });
}
