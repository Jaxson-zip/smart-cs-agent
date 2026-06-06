import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiError, fetchOperatorAccounts } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("operator account API client", () => {
  it("rejects malformed account list responses instead of treating them as empty", async () => {
    mockJsonResponse({ status: 200, body: {} });

    await assert.rejects(
      fetchOperatorAccounts(),
      (error) => error instanceof ApiError && error.status === 502,
    );
  });

  it("keeps only sanitized account fields from list responses", async () => {
    mockJsonResponse({
      status: 200,
      body: {
        operators: [
          {
            username: "demo",
            tenantId: "demo_tenant",
            operatorId: "op_demo",
            role: "admin",
            disabled: false,
            sessionVersion: 2,
            apiKey: "server-secret",
            passwordHash: "hash-secret",
          },
        ],
      },
    });

    const accounts = await fetchOperatorAccounts();

    assert.deepEqual(accounts, [
      {
        username: "demo",
        tenantId: "demo_tenant",
        operatorId: "op_demo",
        role: "admin",
        disabled: false,
        sessionVersion: 2,
      },
    ]);
  });
});

function mockJsonResponse({
  status,
  body,
}: {
  status: number;
  body: unknown;
}) {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}
