import assert from "node:assert";
import { describe, it } from "node:test";
import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  requireRequestContext,
  requireTenantParamAccess,
} from "./request-context";

describe("request context", () => {
  it("extracts tenant and operator context from request headers", () => {
    const context = requireRequestContext({
      "X-Tenant-Id": "demo_tenant",
      "x-operator-id": "agent_1",
    });

    assert.deepStrictEqual(context, {
      tenantId: "demo_tenant",
      operatorId: "agent_1",
      role: "admin",
    });
  });

  it("requires tenant context for tenant-scoped APIs", () => {
    assert.throws(
      () => requireRequestContext({}),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("uses a configured operator API key as the tenant context", () => {
    const context = requireRequestContext(
      {
        authorization: "Bearer dev_operator_key",
      },
      {
        OPERATOR_API_KEYS:
          '[{"key":"dev_operator_key","tenantId":"demo_tenant","operatorId":"operator_1","role":"admin"}]',
      },
    );

    assert.deepStrictEqual(context, {
      tenantId: "demo_tenant",
      operatorId: "operator_1",
      role: "admin",
    });
  });

  it("accepts x-api-key when an authorization bearer token is not provided", () => {
    const context = requireRequestContext(
      {
        "x-api-key": "dev_operator_key",
      },
      {
        OPERATOR_API_KEYS:
          '[{"key":"dev_operator_key","tenantId":"demo_tenant","operatorId":"operator_1","role":"viewer"}]',
      },
    );

    assert.deepStrictEqual(context, {
      tenantId: "demo_tenant",
      operatorId: "operator_1",
      role: "viewer",
    });
  });

  it("rejects missing operator API keys when keys are configured", () => {
    assert.throws(
      () =>
        requireRequestContext(
          { "x-tenant-id": "demo_tenant" },
          {
            OPERATOR_API_KEYS:
              '[{"key":"dev_operator_key","tenantId":"demo_tenant","operatorId":"operator_1","role":"admin"}]',
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("blocks spoofed tenant headers that do not match the API key tenant", () => {
    assert.throws(
      () =>
        requireRequestContext(
          {
            authorization: "Bearer dev_operator_key",
            "x-tenant-id": "other_tenant",
          },
          {
            OPERATOR_API_KEYS:
              '[{"key":"dev_operator_key","tenantId":"demo_tenant","operatorId":"operator_1","role":"admin"}]',
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
  });

  it("requires an operator API key in production unless insecure headers are explicitly allowed", () => {
    assert.throws(
      () =>
        requireRequestContext(
          { "x-tenant-id": "demo_tenant" },
          {
            NODE_ENV: "production",
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("allows insecure tenant headers only when explicitly enabled in production", () => {
    const context = requireRequestContext(
      {
        "x-tenant-id": "demo_tenant",
        "x-operator-id": "operator_1",
      },
      {
        NODE_ENV: "production",
        ALLOW_INSECURE_OPERATOR_HEADERS: "true",
      },
    );

    assert.deepStrictEqual(context, {
      tenantId: "demo_tenant",
      operatorId: "operator_1",
      role: "admin",
    });
  });

  it("fails closed when operator API key configuration is malformed", () => {
    assert.throws(
      () =>
        requireRequestContext(
          { "x-tenant-id": "demo_tenant" },
          {
            OPERATOR_API_KEYS: "not-json",
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof InternalServerErrorException);
        assert.strictEqual(error.getStatus(), 500);
        return true;
      },
    );
  });

  it("treats blank array header values as missing tenant context", () => {
    assert.throws(
      () => requireRequestContext({ "x-tenant-id": ["   "] }),
      (error: unknown) => {
        assert.ok(error instanceof UnauthorizedException);
        assert.strictEqual(error.getStatus(), 401);
        return true;
      },
    );
  });

  it("blocks access to a different tenant id", () => {
    assert.throws(
      () =>
        requireTenantParamAccess(
          { tenantId: "tenant_a", operatorId: "operator_1", role: "admin" },
          "tenant_b",
        ),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        return true;
      },
    );
  });
});
