import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { GET as getCases } from "./cases/route";
import { GET as getCaseDetails } from "./cases/[id]/route";
import { GET as getReadiness } from "./readiness/route";

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalOperatorApiKey = process.env.OPERATOR_API_KEY;
const originalTenantId = process.env.OPERATOR_TENANT_ID;
const originalOperatorId = process.env.OPERATOR_ID;

describe("operator BFF routes", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("API_URL", originalApiUrl);
    restoreEnv("OPERATOR_API_KEY", originalOperatorApiKey);
    restoreEnv("OPERATOR_TENANT_ID", originalTenantId);
    restoreEnv("OPERATOR_ID", originalOperatorId);
  });

  it("proxies case list with a server-side operator API key", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_API_KEY = "server_only_key";
    process.env.OPERATOR_TENANT_ID = "tenant_from_server";
    process.env.OPERATOR_ID = "operator_from_server";
    process.env.NEXT_PUBLIC_OPERATOR_API_KEY = "public_key_should_not_be_used";

    globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
      });

      return Response.json([{ caseId: "case_1" }]);
    };

    const response = await getCases();

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), [{ caseId: "case_1" }]);
    assert.strictEqual(requests[0]?.url, "http://api.internal:4100/v1/cases");
    assert.strictEqual(
      requests[0]?.headers.get("authorization"),
      "Bearer server_only_key",
    );
    assert.strictEqual(
      requests[0]?.headers.get("x-tenant-id"),
      "tenant_from_server",
    );
    assert.strictEqual(
      requests[0]?.headers.get("x-operator-id"),
      "operator_from_server",
    );
  });

  it("does not call the API when the server-side operator key is missing", async () => {
    let fetchCalled = false;
    process.env.API_URL = "http://api.internal:4100";
    delete process.env.OPERATOR_API_KEY;

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json([]);
    };

    const response = await getCases();

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator API key is not configured",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("proxies case details through the same server-side boundary", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_API_KEY = "server_only_key";
    let proxiedUrl = "";

    globalThis.fetch = async (input) => {
      proxiedUrl = String(input);
      return Response.json({ caseId: "case_123" });
    };

    const response = await getCaseDetails(
      new Request("http://localhost/api/operator/cases/case_123"),
      { params: Promise.resolve({ id: "case_123" }) },
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { caseId: "case_123" });
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v1/cases/case_123",
    );
  });

  it("proxies readiness without requiring an operator API key", async () => {
    process.env.API_URL = "http://api.internal:4100";
    delete process.env.OPERATOR_API_KEY;
    let proxiedUrl = "";

    globalThis.fetch = async (input) => {
      proxiedUrl = String(input);
      return Response.json({ status: "ready" });
    };

    const response = await getReadiness();

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { status: "ready" });
    assert.strictEqual(proxiedUrl, "http://api.internal:4100/health/ready");
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
