import assert from "node:assert";
import { scryptSync } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { GET as getCases } from "./cases/route";
import { GET as getCaseDetails } from "./cases/[id]/route";
import { POST as loginOperator } from "./login/route";
import { POST as logoutOperator } from "./logout/route";
import { GET as getOperatorMe } from "./me/route";
import { GET as getReadiness } from "./readiness/route";
import {
  clearOperatorAccountStoreForTests,
  setOperatorAccountStoreForTests,
  type OperatorAccountStore,
} from "./operator-session";

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalOperatorApiKey = process.env.OPERATOR_API_KEY;
const originalTenantId = process.env.OPERATOR_TENANT_ID;
const originalOperatorId = process.env.OPERATOR_ID;
const originalSessionSecret = process.env.OPERATOR_SESSION_SECRET;
const originalOperatorAccountSource = process.env.OPERATOR_ACCOUNT_SOURCE;
const originalSessionAccounts = process.env.OPERATOR_SESSION_ACCOUNTS;
const originalSessionTtl = process.env.OPERATOR_SESSION_TTL_SECONDS;
const originalNodeEnv = process.env.NODE_ENV;
const originalNextPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;

describe("operator BFF routes", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("API_URL", originalApiUrl);
    restoreEnv("OPERATOR_API_KEY", originalOperatorApiKey);
    restoreEnv("OPERATOR_TENANT_ID", originalTenantId);
    restoreEnv("OPERATOR_ID", originalOperatorId);
    restoreEnv("OPERATOR_SESSION_SECRET", originalSessionSecret);
    restoreEnv("OPERATOR_ACCOUNT_SOURCE", originalOperatorAccountSource);
    restoreEnv("OPERATOR_SESSION_ACCOUNTS", originalSessionAccounts);
    restoreEnv("OPERATOR_SESSION_TTL_SECONDS", originalSessionTtl);
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("NEXT_PUBLIC_API_URL", originalNextPublicApiUrl);
    clearOperatorAccountStoreForTests();
    delete process.env.NEXT_PUBLIC_OPERATOR_API_KEY;
  });

  it("requires an operator session before proxying case list", async () => {
    let fetchCalled = false;
    process.env.API_URL = "http://api.internal:4100";

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json([]);
    };

    const response = await getCases(new Request("http://localhost/api/operator/cases"));

    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session is required",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("proxies case list with a server-side operator session", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_from_session","operatorId":"operator_from_session","role":"admin","apiKey":"session_api_key"}]';
    process.env.NEXT_PUBLIC_OPERATOR_API_KEY = "public_key_should_not_be_used";

    globalThis.fetch = async (input, init) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
      });

      return Response.json([{ caseId: "case_1" }]);
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie");
    assert.ok(cookie?.includes("smart_cs_operator_session="));
    assert.ok(cookie?.includes("HttpOnly"));
    assert.match(cookie ?? "", /SameSite=Lax/i);
    assert.ok(cookie?.includes("Path=/"));
    assert.deepStrictEqual(await loginResponse.json(), {
      operator: {
        username: "alice",
        tenantId: "tenant_from_session",
        operatorId: "operator_from_session",
        role: "admin",
        permissions: {
          viewCases: true,
          confirmReplies: true,
          takeoverCases: true,
          manageRules: true,
          manageOperators: true,
        },
      },
    });

    const response = await getCases(
      new Request("http://localhost/api/operator/cases", {
        headers: { cookie: cookie ?? "" },
      }),
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), [{ caseId: "case_1" }]);
    assert.strictEqual(requests[0]?.url, "http://api.internal:4100/v1/cases");
    assert.strictEqual(
      requests[0]?.headers.get("authorization"),
      "Bearer session_api_key",
    );
    assert.strictEqual(
      requests[0]?.headers.get("x-tenant-id"),
      "tenant_from_session",
    );
    assert.strictEqual(
      requests[0]?.headers.get("x-operator-id"),
      "operator_from_session",
    );
  });

  it("rejects invalid operator credentials", async () => {
    let fetchCalled = false;
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json([]);
    };

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "wrong",
      }),
    );

    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), {
      error: "Invalid username or password",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("rejects malformed login payloads without throwing a 500", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';

    const response = await loginOperator(jsonRequest("http://localhost/api/operator/login", null));

    assert.strictEqual(response.status, 400);
    assert.deepStrictEqual(await response.json(), {
      error: "Username and password are required",
    });
  });

  it("rejects production login when the session secret is not production safe", async () => {
    setEnv("NODE_ENV", "production");
    process.env.OPERATOR_ACCOUNT_SOURCE = "env";
    process.env.OPERATOR_SESSION_SECRET = "short";
    process.env.OPERATOR_SESSION_ACCOUNTS = JSON.stringify([
      {
        username: "alice",
        passwordHash: testPasswordHash("secret"),
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
        apiKey: "session_api_key",
      },
    ]);

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session secret is not configured",
    });
  });

  it("rejects the default demo account in production", async () => {
    setEnv("NODE_ENV", "production");
    process.env.OPERATOR_ACCOUNT_SOURCE = "env";
    process.env.OPERATOR_SESSION_SECRET = "a_safe_test_secret_with_more_than_32_chars";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"demo","password":"demo123456","tenantId":"demo_tenant","operatorId":"sandbox_operator","role":"admin","apiKey":"session_api_key"}]';

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "demo",
        password: "demo123456",
      }),
    );

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session accounts are not configured",
    });
  });

  it("clears the operator session cookie on logout", async () => {
    const response = await logoutOperator();
    const cookie = response.headers.get("set-cookie");

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { ok: true });
    assert.ok(cookie?.includes("smart_cs_operator_session="));
    assert.ok(cookie?.includes("Max-Age=0"));
    assert.ok(cookie?.includes("HttpOnly"));
  });

  it("returns the current operator session without exposing secrets", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"viewer","password":"secret","tenantId":"tenant_1","operatorId":"viewer_1","role":"viewer","apiKey":"viewer_api_key"}]';

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "viewer",
        password: "secret",
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const response = await getOperatorMe(
      new Request("http://localhost/api/operator/me", {
        headers: { cookie },
      }),
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), {
      operator: {
        username: "viewer",
        tenantId: "tenant_1",
        operatorId: "viewer_1",
        role: "viewer",
        permissions: {
          viewCases: true,
          confirmReplies: false,
          takeoverCases: false,
          manageRules: false,
          manageOperators: false,
        },
      },
    });
  });

  it("returns operator role permissions for standard service agents", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"agent","password":"secret","tenantId":"tenant_1","operatorId":"agent_1","role":"operator","apiKey":"agent_api_key"}]';

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "agent",
        password: "secret",
      }),
    );

    assert.strictEqual(loginResponse.status, 200);
    assert.deepStrictEqual(await loginResponse.json(), {
      operator: {
        username: "agent",
        tenantId: "tenant_1",
        operatorId: "agent_1",
        role: "operator",
        permissions: {
          viewCases: true,
          confirmReplies: true,
          takeoverCases: true,
          manageRules: false,
          manageOperators: false,
        },
      },
    });
  });

  it("allows login with a hashed operator password", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS = JSON.stringify([
      {
        username: "hashed",
        passwordHash: testPasswordHash("secret"),
        tenantId: "tenant_1",
        operatorId: "hashed_1",
        role: "operator",
        apiKey: "hashed_api_key",
      },
    ]);

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "hashed",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), {
      operator: {
        username: "hashed",
        tenantId: "tenant_1",
        operatorId: "hashed_1",
        role: "operator",
        permissions: {
          viewCases: true,
          confirmReplies: true,
          takeoverCases: true,
          manageRules: false,
          manageOperators: false,
        },
      },
    });
  });

  it("authenticates operators from the account store when env accounts are absent", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    delete process.env.OPERATOR_SESSION_ACCOUNTS;
    const dbBackedAccount = {
      username: "db_agent",
      passwordHash: testPasswordHash("secret"),
      tenantId: "tenant_from_db",
      operatorId: "operator_from_db",
      role: "operator" as const,
      apiKey: "db_api_key",
      disabled: false,
      sessionVersion: 3,
    };
    const accountStore: OperatorAccountStore = {
      async findByUsername(username) {
        return username === dbBackedAccount.username ? dbBackedAccount : undefined;
      },
      async findSessionAccount(payload) {
        return payload.username === dbBackedAccount.username &&
          payload.tenantId === dbBackedAccount.tenantId &&
          payload.operatorId === dbBackedAccount.operatorId &&
          payload.role === dbBackedAccount.role
          ? dbBackedAccount
          : undefined;
      },
    };
    setOperatorAccountStoreForTests(accountStore);

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "db_agent",
        password: "secret",
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    assert.strictEqual(loginResponse.status, 200);
    assert.deepStrictEqual(await loginResponse.json(), {
      operator: {
        username: "db_agent",
        tenantId: "tenant_from_db",
        operatorId: "operator_from_db",
        role: "operator",
        permissions: {
          viewCases: true,
          confirmReplies: true,
          takeoverCases: true,
          manageRules: false,
          manageOperators: false,
        },
      },
    });

    const meResponse = await getOperatorMe(
      new Request("http://localhost/api/operator/me", {
        headers: { cookie },
      }),
    );

    assert.strictEqual(meResponse.status, 200);
    assert.deepStrictEqual(await meResponse.json(), {
      operator: {
        username: "db_agent",
        tenantId: "tenant_from_db",
        operatorId: "operator_from_db",
        role: "operator",
        permissions: {
          viewCases: true,
          confirmReplies: true,
          takeoverCases: true,
          manageRules: false,
          manageOperators: false,
        },
      },
    });
  });

  it("rejects malformed operator password hashes", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"hashed","passwordHash":"scrypt:salt:hash:extra","tenantId":"tenant_1","operatorId":"hashed_1","role":"operator","apiKey":"hashed_api_key"}]';

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "hashed",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session accounts are not configured",
    });
  });

  it("rejects plaintext operator passwords in production", async () => {
    setEnv("NODE_ENV", "production");
    process.env.OPERATOR_ACCOUNT_SOURCE = "env";
    process.env.OPERATOR_SESSION_SECRET = "a_safe_test_secret_with_more_than_32_chars";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session accounts are not configured",
    });
  });

  it("rejects disabled operator accounts", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"disabled","password":"secret","disabled":true,"tenantId":"tenant_1","operatorId":"disabled_1","role":"operator","apiKey":"session_api_key"}]';

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "disabled",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), {
      error: "Invalid username or password",
    });
  });

  it("invalidates an existing operator session when the account is disabled", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"agent","password":"secret","tenantId":"tenant_1","operatorId":"agent_1","role":"operator","apiKey":"session_api_key"}]';

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "agent",
        password: "secret",
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"agent","password":"secret","disabled":true,"tenantId":"tenant_1","operatorId":"agent_1","role":"operator","apiKey":"session_api_key"}]';

    const response = await getOperatorMe(
      new Request("http://localhost/api/operator/me", {
        headers: { cookie },
      }),
    );

    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session is invalid",
    });
  });

  it("invalidates an existing operator session when the session version changes", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"agent","password":"secret","sessionVersion":1,"tenantId":"tenant_1","operatorId":"agent_1","role":"operator","apiKey":"session_api_key"}]';

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "agent",
        password: "secret",
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"agent","password":"secret","sessionVersion":2,"tenantId":"tenant_1","operatorId":"agent_1","role":"operator","apiKey":"session_api_key"}]';

    const response = await getOperatorMe(
      new Request("http://localhost/api/operator/me", {
        headers: { cookie },
      }),
    );

    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session is invalid",
    });
  });

  it("requires an operator session before returning the current operator", async () => {
    const response = await getOperatorMe(
      new Request("http://localhost/api/operator/me"),
    );

    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session is required",
    });
  });

  it("proxies case details through the same server-side boundary", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_from_session","operatorId":"operator_from_session","role":"operator","apiKey":"session_api_key"}]';
    let proxiedUrl = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedHeaders = new Headers(init?.headers);
      return Response.json({ caseId: "case_123" });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const response = await getCaseDetails(
      new Request("http://localhost/api/operator/cases/case_123", {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: "case_123" }) },
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { caseId: "case_123" });
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v1/cases/case_123",
    );
    assert.strictEqual(
      proxiedHeaders.get("authorization"),
      "Bearer session_api_key",
    );
  });

  it("rejects a tampered operator session cookie", async () => {
    let fetchCalled = false;
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json([]);
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const cookie = (loginResponse.headers.get("set-cookie") ?? "").replace(
      "smart_cs_operator_session=",
      "smart_cs_operator_session=tampered",
    );

    const response = await getCases(
      new Request("http://localhost/api/operator/cases", {
        headers: { cookie },
      }),
    );

    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator session is invalid",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("proxies readiness without requiring an operator API key", async () => {
    process.env.API_URL = "http://api.internal:4100";
    delete process.env.OPERATOR_API_KEY;
    let proxiedUrl = "";

    globalThis.fetch = async (input) => {
      proxiedUrl = String(input);
      return Response.json({ status: "ready" });
    };

    const response = await getReadiness(
      new Request("http://localhost/api/operator/readiness"),
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { status: "ready" });
    assert.strictEqual(proxiedUrl, "http://api.internal:4100/health/ready");
  });

  it("fails closed in production when the internal API URL is missing", async () => {
    setEnv("NODE_ENV", "production");
    delete process.env.API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://public.example.invalid";
    let fetchCalled = false;

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json({ status: "ready" });
    };

    const response = await getReadiness(
      new Request("http://localhost/api/operator/readiness"),
    );

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator API is unavailable",
    });
    assert.strictEqual(fetchCalled, false);
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function setEnv(key: string, value: string) {
  process.env[key] = value;
}

function testPasswordHash(password: string) {
  const salt = "test_salt";
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}
