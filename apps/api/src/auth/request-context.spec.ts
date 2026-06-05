import assert from "node:assert";
import { describe, it } from "node:test";
import {
  ForbiddenException,
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
          { tenantId: "tenant_a", operatorId: "operator_1" },
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
