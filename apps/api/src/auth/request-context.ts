import {
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";

export type RequestHeaders = Record<string, string | string[] | undefined>;

export type RequestContext = {
  tenantId: string;
  operatorId: string;
};

export function requireRequestContext(headers: RequestHeaders): RequestContext {
  const tenantId = readHeader(headers, "x-tenant-id");
  const operatorId = readHeader(headers, "x-operator-id") ?? "sandbox_operator";

  if (!tenantId) {
    throw new UnauthorizedException("Missing x-tenant-id header");
  }

  return {
    tenantId,
    operatorId,
  };
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
