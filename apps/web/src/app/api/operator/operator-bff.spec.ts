import assert from "node:assert";
import { scryptSync } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { GET as getCases } from "./cases/route";
import { GET as getCaseDetails } from "./cases/[id]/route";
import { GET as listChannelEvents } from "./channel-events/route";
import { GET as getChannelEventAuditSummary } from "./channel-events/audit-summary/route";
import { GET as getChannelEventMetrics } from "./channel-events/metrics/route";
import { GET as listChannelEventOperations } from "./channel-events/operation-audits/route";
import { POST as ignoreChannelEvent } from "./channel-events/[id]/ignore/route";
import { POST as replayChannelEvent } from "./channel-events/[id]/replay/route";
import { POST as recoverStaleChannelEvents } from "./channel-events/recover-stale/route";
import { POST as loginOperator } from "./login/route";
import { POST as logoutOperator } from "./logout/route";
import { GET as getOperatorMe } from "./me/route";
import { GET as listProviderReadRuns } from "./provider-reads/runs/route";
import { GET as getProviderReadSummary } from "./provider-reads/summary/route";
import {
  GET as listProviderWriteRequests,
  POST as requestProviderWrite,
} from "./provider-writes/requests/route";
import { POST as approveProviderWriteRequest } from "./provider-writes/requests/[id]/approve/route";
import { POST as createProviderWriteExecutionAttempt } from "./provider-writes/requests/[id]/execution-attempts/route";
import { POST as rejectProviderWriteRequest } from "./provider-writes/requests/[id]/reject/route";
import {
  GET as listOperators,
  POST as createOperator,
} from "./operators/route";
import { PATCH as updateOperator } from "./operators/[operatorId]/route";
import { GET as getReadiness } from "./readiness/route";
import {
  clearOperatorAdminStoreForTests,
  setOperatorAdminStoreForTests,
  type OperatorAdminStore,
} from "./operator-admin";
import {
  clearOperatorAccountStoreForTests,
  clearOperatorIdentityProviderForTests,
  setOperatorAccountStoreForTests,
  type OperatorAccountStore,
} from "./operator-session";

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalOperatorApiKey = process.env.OPERATOR_API_KEY;
const originalTenantId = process.env.OPERATOR_TENANT_ID;
const originalOperatorId = process.env.OPERATOR_ID;
const originalSessionSecret = process.env.OPERATOR_SESSION_SECRET;
const originalOperatorIdentityProvider = process.env.OPERATOR_IDENTITY_PROVIDER;
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
    restoreEnv("OPERATOR_IDENTITY_PROVIDER", originalOperatorIdentityProvider);
    restoreEnv("OPERATOR_ACCOUNT_SOURCE", originalOperatorAccountSource);
    restoreEnv("OPERATOR_SESSION_ACCOUNTS", originalSessionAccounts);
    restoreEnv("OPERATOR_SESSION_TTL_SECONDS", originalSessionTtl);
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("NEXT_PUBLIC_API_URL", originalNextPublicApiUrl);
    clearOperatorAdminStoreForTests();
    clearOperatorAccountStoreForTests();
    clearOperatorIdentityProviderForTests();
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
    process.env.OPERATOR_SESSION_SECRET = "short";
    delete process.env.OPERATOR_SESSION_ACCOUNTS;
    const dbBackedAccount = {
      username: "alice",
      passwordHash: testPasswordHash("secret"),
      tenantId: "tenant_1",
      operatorId: "operator_1",
      role: "operator" as const,
      apiKey: "session_api_key",
      disabled: false,
      sessionVersion: 1,
    };
    setOperatorAccountStoreForTests({
      async findByUsername(username) {
        return username === dbBackedAccount.username ? dbBackedAccount : undefined;
      },
      async findSessionAccount() {
        return dbBackedAccount;
      },
    });

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
      error: "Env operator account source is not allowed in production",
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

  it("uses an explicit env identity provider without falling through to the database account source", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_IDENTITY_PROVIDER = "env";
    process.env.OPERATOR_ACCOUNT_SOURCE = "database";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"env_agent","password":"secret","tenantId":"tenant_env","operatorId":"operator_env","role":"operator","apiKey":"env_api_key"}]';

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "env_agent",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), {
      operator: {
        username: "env_agent",
        tenantId: "tenant_env",
        operatorId: "operator_env",
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

  it("fails closed when the env identity provider is selected in production", async () => {
    setEnv("NODE_ENV", "production");
    process.env.OPERATOR_SESSION_SECRET = "a_safe_test_secret_with_more_than_32_chars";
    process.env.OPERATOR_IDENTITY_PROVIDER = "env";
    process.env.OPERATOR_SESSION_ACCOUNTS = JSON.stringify([
      {
        username: "env_agent",
        passwordHash: testPasswordHash("secret"),
        tenantId: "tenant_env",
        operatorId: "operator_env",
        role: "operator",
        apiKey: "env_api_key",
      },
    ]);

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "env_agent",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Env operator identity provider is not allowed in production",
    });
  });

  it("fails closed when the env account source is selected in production", async () => {
    setEnv("NODE_ENV", "production");
    process.env.OPERATOR_SESSION_SECRET = "a_safe_test_secret_with_more_than_32_chars";
    process.env.OPERATOR_ACCOUNT_SOURCE = "env";
    process.env.OPERATOR_SESSION_ACCOUNTS = JSON.stringify([
      {
        username: "env_agent",
        passwordHash: testPasswordHash("secret"),
        tenantId: "tenant_env",
        operatorId: "operator_env",
        role: "operator",
        apiKey: "env_api_key",
      },
    ]);

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "env_agent",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Env operator account source is not allowed in production",
    });
  });

  it("fails closed when production selects database provider with env account source", async () => {
    setEnv("NODE_ENV", "production");
    process.env.OPERATOR_SESSION_SECRET = "a_safe_test_secret_with_more_than_32_chars";
    process.env.OPERATOR_IDENTITY_PROVIDER = "database";
    process.env.OPERATOR_ACCOUNT_SOURCE = "env";

    const response = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "db_agent",
        password: "secret",
      }),
    );

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(await response.json(), {
      error: "Env operator account source is not allowed in production",
    });
  });

  it("fails closed when a reserved oidc identity provider is selected before it is configured", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_IDENTITY_PROVIDER = "oidc";
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
      error: "Operator identity provider is not configured",
    });
  });

  it("fails closed when a reserved sso identity provider is selected before it is configured", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_IDENTITY_PROVIDER = "sso";
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
      error: "Operator identity provider is not configured",
    });
  });

  it("fails closed for unknown identity providers instead of using local fallback", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_IDENTITY_PROVIDER = "local";
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
      error: "Operator identity provider is not configured",
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
      error: "Env operator account source is not allowed in production",
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

  it("proxies pending real-channel event review list through the operator session", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_from_session","operatorId":"operator_from_session","role":"operator","apiKey":"session_api_key"}]';
    let proxiedUrl = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedHeaders = new Headers(init?.headers);
      return Response.json([
        {
          id: "event_1",
          merchantId: "tenant_from_session",
          channel: "taobao",
          externalConversationId: "conv_secret",
          externalMessageId: "msg_secret",
          senderName: "林女士",
          text: "鞋盒压坏了",
          receivedAt: "2026-06-06T06:00:00.000Z",
          createdAt: "2026-06-06T06:01:00.000Z",
          reviewStatus: "pending",
        },
      ]);
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await listChannelEvents(
      new Request("http://localhost/api/operator/channel-events", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), [
      {
        id: "event_1",
        channel: "taobao",
        senderName: "林女士",
        text: "鞋盒压坏了",
        receivedAt: "2026-06-06T06:00:00.000Z",
        createdAt: "2026-06-06T06:01:00.000Z",
        reviewStatus: "pending",
      },
    ]);
    assert.strictEqual(proxiedUrl, "http://api.internal:4100/v1/channel-events");
    assert.strictEqual(
      proxiedHeaders.get("authorization"),
      "Bearer session_api_key",
    );
    assert.strictEqual(
      proxiedHeaders.get("x-tenant-id"),
      "tenant_from_session",
    );
  });

  it("proxies real-channel queue metrics without leaking tenant or source fields", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_from_session","operatorId":"operator_from_session","role":"viewer","apiKey":"viewer_api_key"}]';
    let proxiedUrl = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedHeaders = new Headers(init?.headers);
      return Response.json({
        tenantId: "tenant_from_session",
        source: "real_channel_webhook",
        pendingCount: 3,
        processingCount: 2,
        staleProcessingCount: 1,
        replayedCount: 8,
        ignoredCount: 5,
        oldestPendingReceivedAt: "2026-06-06T07:00:00.000Z",
        oldestPendingAgeSeconds: 1800,
        staleAfterMinutes: 15,
        measuredAt: "2026-06-06T07:30:00.000Z",
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await getChannelEventMetrics(
      new Request("http://localhost/api/operator/channel-events/metrics", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v1/channel-events/metrics",
    );
    assert.strictEqual(proxiedHeaders.get("authorization"), "Bearer viewer_api_key");
    assert.deepStrictEqual(await response.json(), {
      pendingCount: 3,
      processingCount: 2,
      staleProcessingCount: 1,
      replayedCount: 8,
      ignoredCount: 5,
      oldestPendingReceivedAt: "2026-06-06T07:00:00.000Z",
      oldestPendingAgeSeconds: 1800,
      staleAfterMinutes: 15,
      measuredAt: "2026-06-06T07:30:00.000Z",
    });
  });

  it("lets admin sessions list sanitized queue operation records through the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let proxiedUrl = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedHeaders = new Headers(init?.headers);
      return Response.json([
        {
          id: "audit_1",
          type: "stale_processing_recovered",
          operatorId: "admin_1",
          recoveredCount: 2,
          recoveredBefore: "2026-06-06T07:15:00.000Z",
          queueHealthyAfter: true,
          queueAfter: {
            pendingCount: 4,
            staleProcessingCount: 0,
          },
          createdAt: "2026-06-06T07:31:00.000Z",
          tenantId: "must_not_leak",
          eventIds: ["must_not_leak"],
          source: "must_not_leak",
          payload: { secret: true },
        },
      ]);
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await listChannelEventOperations(
      new Request("http://localhost/api/operator/channel-events/operation-audits", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v1/channel-events/operation-audits",
    );
    assert.strictEqual(proxiedHeaders.get("authorization"), "Bearer admin_api_key");
    assert.deepStrictEqual(await response.json(), [
      {
        id: "audit_1",
        type: "stale_processing_recovered",
        operatorId: "admin_1",
        recoveredCount: 2,
        recoveredBefore: "2026-06-06T07:15:00.000Z",
        queueHealthyAfter: true,
        queueAfter: {
          pendingCount: 4,
          staleProcessingCount: 0,
        },
        createdAt: "2026-06-06T07:31:00.000Z",
      },
    ]);
  });

  it("lets admin sessions read a sanitized queue audit summary through the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let proxiedUrl = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedHeaders = new Headers(init?.headers);
      return Response.json({
        measuredAt: "2026-06-06T08:00:00.000Z",
        window: {
          from: "2026-06-06T07:00:00.000Z",
          to: "2026-06-06T08:00:00.000Z",
        },
        totals: {
          replayedCount: 5,
          ignoredCount: 3,
          recoveryRunCount: 2,
          recoveredEventCount: 5,
        },
        byOperator: [
          {
            operatorId: "admin_1",
            replayedCount: 2,
            ignoredCount: 1,
            recoveryRunCount: 1,
            recoveredEventCount: 4,
            lastActivityAt: "2026-06-06T07:45:00.000Z",
          },
        ],
        tenantId: "must_not_leak",
        source: "must_not_leak",
        payload: { secret: true },
        eventIds: ["must_not_leak"],
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await getChannelEventAuditSummary(
      new Request(
        "http://localhost/api/operator/channel-events/audit-summary?from=2026-06-06T07%3A00%3A00.000Z&to=2026-06-06T08%3A00%3A00.000Z",
        {
          headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
        },
      ),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v1/channel-events/audit-summary?from=2026-06-06T07%3A00%3A00.000Z&to=2026-06-06T08%3A00%3A00.000Z",
    );
    assert.strictEqual(proxiedHeaders.get("authorization"), "Bearer admin_api_key");
    assert.deepStrictEqual(await response.json(), {
      measuredAt: "2026-06-06T08:00:00.000Z",
      window: {
        from: "2026-06-06T07:00:00.000Z",
        to: "2026-06-06T08:00:00.000Z",
      },
      totals: {
        replayedCount: 5,
        ignoredCount: 3,
        recoveryRunCount: 2,
        recoveredEventCount: 5,
      },
      byOperator: [
        {
          operatorId: "admin_1",
          replayedCount: 2,
          ignoredCount: 1,
          recoveryRunCount: 1,
          recoveredEventCount: 4,
          lastActivityAt: "2026-06-06T07:45:00.000Z",
        },
      ],
    });
  });

  it("lets admin sessions list sanitized provider read runs through the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let proxiedUrl = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedHeaders = new Headers(init?.headers);
      return Response.json([
        {
          id: "provider_read_run_1",
          caseId: "case_1",
          operatorId: "operator_1",
          channel: "taobao",
          readCapability: "get_order",
          status: "policy_accepted",
          networkExecution: "not_implemented",
          providerDataReturned: false,
          lookupKeys: {
            hasOrderId: true,
            hasLogisticsId: false,
          },
          lookupFingerprint: "abcdef123456",
          requestFingerprint: "123456abcdef",
          policyReason: null,
          createdAt: "2026-06-06T08:00:00.000Z",
          updatedAt: "2026-06-06T08:00:00.000Z",
          lookupHash: "must_not_leak",
          requestHash: "must_not_leak",
          idempotencyKey: "must_not_leak",
          providerPayload: { secret: true },
          providerResponse: { raw: true },
          operatorApiKey: "operator_api_key_must_not_leak",
          orderId: "raw_order_1",
          logisticsId: "raw_logistics_1",
          customerName: "customer_name_must_not_leak",
          customerPhone: "customer_phone_must_not_leak",
          customerAddress: "customer_address_must_not_leak",
          customerMessage: "customer_message_must_not_leak",
          tenantId: "must_not_leak",
        },
      ]);
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await listProviderReadRuns(
      new Request(
        "http://localhost/api/operator/provider-reads/runs?limit=10&status=policy_accepted",
        {
          headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
        },
      ),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v2/provider-reads/runs?limit=10&status=policy_accepted",
    );
    assert.strictEqual(proxiedHeaders.get("authorization"), "Bearer admin_api_key");
    assert.deepStrictEqual(await response.json(), [
      {
        id: "provider_read_run_1",
        caseId: "case_1",
        operatorId: "operator_1",
        channel: "taobao",
        readCapability: "get_order",
        status: "policy_accepted",
        networkExecution: "not_implemented",
        providerDataReturned: false,
        lookupKeys: {
          hasOrderId: true,
          hasLogisticsId: false,
        },
        lookupFingerprint: "abcdef123456",
        requestFingerprint: "123456abcdef",
        policyReason: null,
        createdAt: "2026-06-06T08:00:00.000Z",
        updatedAt: "2026-06-06T08:00:00.000Z",
      },
    ]);
  });

  it("lets admin sessions read sanitized provider read summaries through the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let proxiedUrl = "";

    globalThis.fetch = async (input) => {
      proxiedUrl = String(input);
      return Response.json({
        measuredAt: "2026-06-06T08:00:00.000Z",
        window: {
          from: "2026-06-06T07:00:00.000Z",
          to: "2026-06-06T08:00:00.000Z",
        },
        totals: {
          totalCount: 4,
          policyAcceptedCount: 2,
          blockedCount: 1,
          failedCount: 1,
        },
        byChannel: [{ key: "taobao", count: 4 }],
        byCapability: [{ key: "get_order", count: 3 }],
        latestCreatedAt: "2026-06-06T07:45:00.000Z",
        tenantId: "must_not_leak",
        lookupHash: "must_not_leak",
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await getProviderReadSummary(
      new Request(
        "http://localhost/api/operator/provider-reads/summary?from=2026-06-06T07%3A00%3A00.000Z&to=2026-06-06T08%3A00%3A00.000Z",
        {
          headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
        },
      ),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v2/provider-reads/summary?from=2026-06-06T07%3A00%3A00.000Z&to=2026-06-06T08%3A00%3A00.000Z",
    );
    assert.deepStrictEqual(await response.json(), {
      measuredAt: "2026-06-06T08:00:00.000Z",
      window: {
        from: "2026-06-06T07:00:00.000Z",
        to: "2026-06-06T08:00:00.000Z",
      },
      totals: {
        totalCount: 4,
        policyAcceptedCount: 2,
        blockedCount: 1,
        failedCount: 1,
      },
      byChannel: [{ key: "taobao", count: 4 }],
      byCapability: [{ key: "get_order", count: 3 }],
      latestCreatedAt: "2026-06-06T07:45:00.000Z",
    });
  });

  it("proxies provider write requests through the operator session without leaking keys", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';
    let proxiedUrl = "";
    let proxiedMethod = "";
    let proxiedBody = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedMethod = init?.method ?? "GET";
      proxiedHeaders = new Headers(init?.headers);
      proxiedBody = String(init?.body ?? "");
      return Response.json({
        writeRequestId: "provider_write_request_1",
        status: "approval_required",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult: "queued",
        requiresHuman: true,
        retryable: false,
        providerPayload: { secret: true },
        operatorApiKey: "operator_api_key_must_not_leak",
        tenantId: "must_not_leak",
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await requestProviderWrite(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests",
        loginResponse.headers.get("set-cookie") ?? "",
        {
          caseId: "case_1",
          tenantId: "must_not_cross_bff",
          channel: "taobao",
          action: "issue_coupon",
          payload: { orderId: "order_1", couponAmountCents: 2000 },
          idempotencyKey: "write_1",
          operatorId: "must_not_cross_bff",
        },
      ),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v2/provider-writes/request",
    );
    assert.strictEqual(proxiedMethod, "POST");
    assert.strictEqual(proxiedHeaders.get("authorization"), "Bearer session_api_key");
    assert.strictEqual(proxiedHeaders.get("content-type"), "application/json");
    assert.deepStrictEqual(JSON.parse(proxiedBody), {
      caseId: "case_1",
      channel: "taobao",
      action: "issue_coupon",
      payload: { orderId: "order_1", couponAmountCents: 2000 },
      idempotencyKey: "write_1",
    });
    assert.deepStrictEqual(await response.json(), {
      writeRequestId: "provider_write_request_1",
      status: "approval_required",
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      operatorVisibleResult: "queued",
      requiresHuman: true,
      retryable: false,
    });
  });

  it("rejects provider write responses that imply network execution or bypass review", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';

    globalThis.fetch = async () =>
      Response.json({
        writeRequestId: "provider_write_request_1",
        status: "approval_required",
        networkExecution: "executed",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult: "unsafe",
        requiresHuman: false,
        retryable: false,
      });

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await requestProviderWrite(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests",
        loginResponse.headers.get("set-cookie") ?? "",
        {
          caseId: "case_1",
          channel: "taobao",
          action: "issue_coupon",
          payload: { orderId: "order_1", couponAmountCents: 2000 },
          idempotencyKey: "write_1",
        },
      ),
    );

    assert.strictEqual(response.status, 502);
    assert.deepStrictEqual(await response.json(), {
      error: "Provider write request response is invalid",
    });
  });

  it("rejects provider write request responses that are already approved", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';

    globalThis.fetch = async () =>
      Response.json({
        writeRequestId: "provider_write_request_1",
        status: "approved",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult: "unsafe",
        requiresHuman: true,
        retryable: false,
      });

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await requestProviderWrite(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests",
        loginResponse.headers.get("set-cookie") ?? "",
        {
          caseId: "case_1",
          channel: "taobao",
          action: "issue_coupon",
          payload: { orderId: "order_1", couponAmountCents: 2000 },
          idempotencyKey: "write_1",
        },
      ),
    );

    assert.strictEqual(response.status, 502);
    assert.deepStrictEqual(await response.json(), {
      error: "Provider write request response is invalid",
    });
  });

  it("proxies provider write approvals through an admin session without leaking keys or raw payload", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let proxiedUrl = "";
    let proxiedMethod = "";
    let proxiedBody = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedMethod = init?.method ?? "GET";
      proxiedHeaders = new Headers(init?.headers);
      proxiedBody = String(init?.body ?? "");
      return Response.json({
        writeRequestId: "provider_write_request_1",
        status: "approved",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult: "approved",
        requiresHuman: true,
        retryable: false,
        providerPayload: { secret: true },
        operatorApiKey: "operator_api_key_must_not_leak",
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await approveProviderWriteRequest(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests/write_1/approve",
        loginResponse.headers.get("set-cookie") ?? "",
        {
          reasonCode: "policy_verified",
        },
      ),
      { params: Promise.resolve({ id: "write_1" }) },
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v2/provider-writes/requests/write_1/approve",
    );
    assert.strictEqual(proxiedMethod, "POST");
    assert.strictEqual(proxiedHeaders.get("authorization"), "Bearer admin_api_key");
    assert.strictEqual(proxiedHeaders.get("content-type"), "application/json");
    assert.deepStrictEqual(JSON.parse(proxiedBody), {
      reasonCode: "policy_verified",
    });
    const body = await response.json();
    assert.deepStrictEqual(body, {
      writeRequestId: "provider_write_request_1",
      status: "approved",
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      operatorVisibleResult: "approved",
      requiresHuman: true,
      retryable: false,
    });
    assert.strictEqual(JSON.stringify(body).includes("operator_api_key_must_not_leak"), false);
  });

  it("rejects unsafe provider write approval responses from the API", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';

    globalThis.fetch = async () =>
      Response.json({
        writeRequestId: "provider_write_request_1",
        status: "approved",
        networkExecution: "not_started",
        providerMutationExecuted: true,
        customerVisibleMessageSent: false,
        operatorVisibleResult: "unsafe",
        requiresHuman: true,
        retryable: false,
      });

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await approveProviderWriteRequest(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests/write_1/approve",
        loginResponse.headers.get("set-cookie") ?? "",
        { reasonCode: "policy_verified" },
      ),
      { params: Promise.resolve({ id: "write_1" }) },
    );

    assert.strictEqual(response.status, 502);
    assert.deepStrictEqual(await response.json(), {
      error: "Provider write request response is invalid",
    });
  });

  it("blocks non-admin provider write approvals and proxies rejections for admins", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"agent","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"operator_api_key"},{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let fetchCalled = false;
    let proxiedUrl = "";

    globalThis.fetch = async (input) => {
      fetchCalled = true;
      proxiedUrl = String(input);
      return Response.json({
        writeRequestId: "provider_write_request_1",
        status: "rejected",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        operatorVisibleResult: "rejected",
        requiresHuman: true,
        retryable: false,
      });
    };

    const agentLogin = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "agent",
        password: "secret",
      }),
    );
    const blocked = await approveProviderWriteRequest(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests/write_1/approve",
        agentLogin.headers.get("set-cookie") ?? "",
        { reasonCode: "policy_verified" },
      ),
      { params: Promise.resolve({ id: "write_1" }) },
    );

    assert.strictEqual(blocked.status, 403);
    assert.deepStrictEqual(await blocked.json(), {
      error: "Provider write operations require admin permission",
    });
    assert.strictEqual(fetchCalled, false);

    const adminLogin = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const rejected = await rejectProviderWriteRequest(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests/write_1/reject",
        adminLogin.headers.get("set-cookie") ?? "",
        { reasonCode: "insufficient_context" },
      ),
      { params: Promise.resolve({ id: "write_1" }) },
    );

    assert.strictEqual(rejected.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v2/provider-writes/requests/write_1/reject",
    );
    assert.deepStrictEqual(await rejected.json(), {
      writeRequestId: "provider_write_request_1",
      status: "rejected",
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      operatorVisibleResult: "rejected",
      requiresHuman: true,
      retryable: false,
    });
  });

  it("proxies provider write execution attempts through an admin session without leaking keys or raw payload", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let proxiedUrl = "";
    let proxiedMethod = "";
    let proxiedBody = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedMethod = init?.method ?? "GET";
      proxiedHeaders = new Headers(init?.headers);
      proxiedBody = String(init?.body ?? "");
      return Response.json({
        attemptId: "attempt_1",
        writeRequestId: "provider_write_request_1",
        status: "blocked",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        payloadEscrowOpened: false,
        operatorVisibleResult: "blocked by kill switch",
        requiresHuman: true,
        retryable: true,
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await createProviderWriteExecutionAttempt(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests/write_1/execution-attempts",
        loginResponse.headers.get("set-cookie") ?? "",
        {
          idempotencyKey: "execution_1",
        },
      ),
      { params: Promise.resolve({ id: "write_1" }) },
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v2/provider-writes/requests/write_1/execution-attempts",
    );
    assert.strictEqual(proxiedMethod, "POST");
    assert.strictEqual(proxiedHeaders.get("authorization"), "Bearer admin_api_key");
    assert.strictEqual(proxiedHeaders.get("content-type"), "application/json");
    assert.deepStrictEqual(JSON.parse(proxiedBody), {
      idempotencyKey: "execution_1",
    });
    const body = await response.json();
    assert.deepStrictEqual(body, {
      attemptId: "attempt_1",
      writeRequestId: "provider_write_request_1",
      status: "blocked",
      networkExecution: "not_started",
      providerMutationExecuted: false,
      customerVisibleMessageSent: false,
      payloadEscrowOpened: false,
      operatorVisibleResult: "blocked by kill switch",
      requiresHuman: true,
      retryable: true,
    });
    assert.strictEqual(JSON.stringify(body).includes("operator_api_key_must_not_leak"), false);
  });

  it("rejects unsafe provider write execution attempt responses and blocks non-admin execution attempts", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"agent","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"operator_api_key"},{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let fetchCalled = false;

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json({
        attemptId: "attempt_1",
        writeRequestId: "provider_write_request_1",
        status: "dry_run_recorded",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        payloadEscrowOpened: false,
        operatorVisibleResult: "unsafe",
        requiresHuman: true,
        retryable: false,
        providerPayload: { secret: true },
        operatorApiKey: "operator_api_key_must_not_leak",
      });
    };

    const agentLogin = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "agent",
        password: "secret",
      }),
    );
    const blocked = await createProviderWriteExecutionAttempt(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests/write_1/execution-attempts",
        agentLogin.headers.get("set-cookie") ?? "",
        { idempotencyKey: "execution_1" },
      ),
      { params: Promise.resolve({ id: "write_1" }) },
    );

    assert.strictEqual(blocked.status, 403);
    assert.deepStrictEqual(await blocked.json(), {
      error: "Provider write operations require admin permission",
    });
    assert.strictEqual(fetchCalled, false);

    const adminLogin = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const unsafe = await createProviderWriteExecutionAttempt(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests/write_1/execution-attempts",
        adminLogin.headers.get("set-cookie") ?? "",
        { idempotencyKey: "execution_1" },
      ),
      { params: Promise.resolve({ id: "write_1" }) },
    );

    assert.strictEqual(unsafe.status, 502);
    assert.deepStrictEqual(await unsafe.json(), {
      error: "Provider write execution attempt response is invalid",
    });
  });

  it("lets admin sessions list sanitized provider write requests through the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let proxiedUrl = "";

    globalThis.fetch = async (input) => {
      proxiedUrl = String(input);
      return Response.json([
        {
          id: "provider_write_request_1",
          caseId: "case_1",
          operatorId: "operator_1",
          channel: "taobao",
          action: "issue_coupon",
          status: "approval_required",
          networkExecution: "not_started",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          payloadKeys: {
            hasOrderId: true,
            hasLogisticsId: false,
            hasAddressFingerprint: false,
            hasCouponAmountCents: true,
          },
          payloadFingerprint: "abcdef123456",
          requestFingerprint: "123456abcdef",
          reviewerOperatorId: null,
          reviewedAt: null,
          reviewReasonCode: null,
          reviewFingerprint: "",
          payloadEscrowStatus: "not_stored",
          payloadEscrowFingerprint: "fedcba654321",
          policyReason: null,
          createdAt: "2026-06-06T08:00:00.000Z",
          updatedAt: "2026-06-06T08:00:00.000Z",
          payloadHash: "must_not_leak",
          requestHash: "must_not_leak",
          idempotencyKey: "must_not_leak",
          providerPayload: { secret: true },
          orderId: "raw_order_1",
          tenantId: "must_not_leak",
        },
      ]);
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await listProviderWriteRequests(
      new Request(
        "http://localhost/api/operator/provider-writes/requests?limit=10&status=approval_required",
        {
          headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
        },
      ),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v2/provider-writes/requests?limit=10&status=approval_required",
    );
    assert.deepStrictEqual(await response.json(), [
      {
        id: "provider_write_request_1",
        caseId: "case_1",
        operatorId: "operator_1",
        channel: "taobao",
        action: "issue_coupon",
        status: "approval_required",
        networkExecution: "not_started",
        providerMutationExecuted: false,
        customerVisibleMessageSent: false,
        payloadKeys: {
          hasOrderId: true,
          hasLogisticsId: false,
          hasAddressFingerprint: false,
          hasCouponAmountCents: true,
        },
        payloadFingerprint: "abcdef123456",
        requestFingerprint: "123456abcdef",
        reviewerOperatorId: null,
        reviewedAt: null,
        reviewReasonCode: null,
        reviewFingerprint: "",
        payloadEscrowStatus: "not_stored",
        payloadEscrowFingerprint: "fedcba654321",
        policyReason: null,
        createdAt: "2026-06-06T08:00:00.000Z",
        updatedAt: "2026-06-06T08:00:00.000Z",
      },
    ]);
  });

  it("rejects provider write request lists with unsafe execution state", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';

    globalThis.fetch = async () =>
      Response.json([
        {
          id: "provider_write_request_1",
          caseId: "case_1",
          operatorId: "operator_1",
          channel: "taobao",
          action: "issue_coupon",
          status: "approval_required",
          networkExecution: "executed",
          providerMutationExecuted: false,
          customerVisibleMessageSent: false,
          payloadKeys: {
            hasOrderId: true,
            hasLogisticsId: false,
            hasAddressFingerprint: false,
            hasCouponAmountCents: true,
          },
          payloadFingerprint: "abcdef123456",
          requestFingerprint: "123456abcdef",
          policyReason: null,
          createdAt: "2026-06-06T08:00:00.000Z",
          updatedAt: "2026-06-06T08:00:00.000Z",
        },
      ]);

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await listProviderWriteRequests(
      new Request("http://localhost/api/operator/provider-writes/requests", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 502);
    assert.deepStrictEqual(await response.json(), {
      error: "Provider write operation response is invalid",
    });
  });

  it("blocks viewer sessions from requesting provider writes in the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"viewer","password":"secret","tenantId":"tenant_1","operatorId":"viewer_1","role":"viewer","apiKey":"viewer_api_key"}]';
    let fetchCalled = false;

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json({ ok: true });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "viewer",
        password: "secret",
      }),
    );
    const response = await requestProviderWrite(
      jsonRequestWithCookie(
        "http://localhost/api/operator/provider-writes/requests",
        loginResponse.headers.get("set-cookie") ?? "",
        {
          caseId: "case_1",
          channel: "taobao",
          action: "issue_coupon",
          payload: { orderId: "order_1", couponAmountCents: 2000 },
          idempotencyKey: "write_1",
        },
      ),
    );

    assert.strictEqual(response.status, 403);
    assert.deepStrictEqual(await response.json(), {
      error: "Provider write requests require operator permission",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("rejects malformed queue audit summary fields in the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';

    globalThis.fetch = async () =>
      Response.json({
        measuredAt: "2026-06-06T08:00:00.000Z",
        window: {
          from: "2026-06-06T07:00:00.000Z",
          to: "2026-06-06T08:00:00.000Z",
        },
        totals: {
          replayedCount: "5",
          ignoredCount: 3,
          recoveryRunCount: 2,
          recoveredEventCount: 5,
        },
        byOperator: [],
      });

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await getChannelEventAuditSummary(
      new Request("http://localhost/api/operator/channel-events/audit-summary", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 502);
    assert.deepStrictEqual(await response.json(), {
      error: "Channel event audit summary response is invalid",
    });
  });

  it("blocks non-admin sessions from reading queue audit summaries in the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';
    let fetchCalled = false;

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json({});
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await getChannelEventAuditSummary(
      new Request("http://localhost/api/operator/channel-events/audit-summary", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 403);
    assert.deepStrictEqual(await response.json(), {
      error: "Channel event audit summary requires admin permission",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("blocks non-admin sessions from provider read operation visibility in the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';
    let fetchCalled = false;

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
    const response = await listProviderReadRuns(
      new Request("http://localhost/api/operator/provider-reads/runs", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 403);
    assert.deepStrictEqual(await response.json(), {
      error: "Provider read operations require admin permission",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("blocks non-admin sessions from listing queue operation records in the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';
    let fetchCalled = false;

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
    const response = await listChannelEventOperations(
      new Request("http://localhost/api/operator/channel-events/operation-audits", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 403);
    assert.deepStrictEqual(await response.json(), {
      error: "Channel event operation audits require admin permission",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("proxies real-channel event replay as a POST without exposing operator keys", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';
    let proxiedUrl = "";
    let proxiedMethod = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedMethod = init?.method ?? "GET";
      proxiedHeaders = new Headers(init?.headers);
      return Response.json({
        status: "replayed",
        eventId: "event_1",
        caseId: "case_1",
        automationMode: "human_confirm",
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await replayChannelEvent(
      new Request("http://localhost/api/operator/channel-events/event_1/replay", {
        method: "POST",
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
      { params: Promise.resolve({ id: "event_1" }) },
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v1/channel-events/event_1/replay",
    );
    assert.strictEqual(proxiedMethod, "POST");
    assert.strictEqual(
      proxiedHeaders.get("authorization"),
      "Bearer session_api_key",
    );
    assert.deepStrictEqual(await response.json(), {
      status: "replayed",
      eventId: "event_1",
      caseId: "case_1",
      automationMode: "human_confirm",
    });
  });

  it("proxies real-channel event ignore notes as JSON through the server boundary", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';
    let proxiedUrl = "";
    let proxiedMethod = "";
    let proxiedBody = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedMethod = init?.method ?? "GET";
      proxiedHeaders = new Headers(init?.headers);
      proxiedBody = String(init?.body ?? "");
      return Response.json({
        status: "ignored",
        eventId: "event_1",
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await ignoreChannelEvent(
      jsonRequestWithCookie(
        "http://localhost/api/operator/channel-events/event_1/ignore",
        loginResponse.headers.get("set-cookie") ?? "",
        { note: "重复消息" },
      ),
      { params: Promise.resolve({ id: "event_1" }) },
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v1/channel-events/event_1/ignore",
    );
    assert.strictEqual(proxiedMethod, "POST");
    assert.strictEqual(proxiedHeaders.get("content-type"), "application/json");
    assert.deepStrictEqual(JSON.parse(proxiedBody), { note: "重复消息" });
    assert.deepStrictEqual(await response.json(), {
      status: "ignored",
      eventId: "event_1",
    });
  });

  it("blocks viewer sessions from replaying or ignoring pending channel events in the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"viewer","password":"secret","tenantId":"tenant_1","operatorId":"viewer_1","role":"viewer","apiKey":"shared_api_key"}]';
    let fetchCalled = false;

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json({ ok: true });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "viewer",
        password: "secret",
      }),
    );
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const replayResponse = await replayChannelEvent(
      new Request("http://localhost/api/operator/channel-events/event_1/replay", {
        method: "POST",
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: "event_1" }) },
    );
    const ignoreResponse = await ignoreChannelEvent(
      jsonRequestWithCookie(
        "http://localhost/api/operator/channel-events/event_1/ignore",
        cookie,
        { note: "只读账号不能处理" },
      ),
      { params: Promise.resolve({ id: "event_1" }) },
    );

    assert.strictEqual(replayResponse.status, 403);
    assert.strictEqual(ignoreResponse.status, 403);
    assert.deepStrictEqual(await replayResponse.json(), {
      error: "Channel event review requires operator permission",
    });
    assert.deepStrictEqual(await ignoreResponse.json(), {
      error: "Channel event review requires operator permission",
    });
    assert.strictEqual(fetchCalled, false);
  });

  it("lets admin sessions recover stale channel events through the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let proxiedUrl = "";
    let proxiedMethod = "";
    let proxiedBody = "";
    let proxiedHeaders = new Headers();

    globalThis.fetch = async (input, init) => {
      proxiedUrl = String(input);
      proxiedMethod = init?.method ?? "GET";
      proxiedHeaders = new Headers(init?.headers);
      proxiedBody = String(init?.body ?? "");
      return Response.json({
        status: "recovered",
        recoveredCount: 2,
      });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await recoverStaleChannelEvents(
      jsonRequestWithCookie(
        "http://localhost/api/operator/channel-events/recover-stale",
        loginResponse.headers.get("set-cookie") ?? "",
        { olderThanMinutes: 20, limit: 25 },
      ),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      proxiedUrl,
      "http://api.internal:4100/v1/channel-events/recover-stale",
    );
    assert.strictEqual(proxiedMethod, "POST");
    assert.strictEqual(proxiedHeaders.get("authorization"), "Bearer admin_api_key");
    assert.strictEqual(proxiedHeaders.get("content-type"), "application/json");
    assert.deepStrictEqual(JSON.parse(proxiedBody), {
      olderThanMinutes: 20,
      limit: 25,
    });
    assert.deepStrictEqual(await response.json(), {
      status: "recovered",
      recoveredCount: 2,
    });
  });

  it("blocks non-admin sessions from recovering stale channel events in the BFF", async () => {
    process.env.API_URL = "http://api.internal:4100";
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"alice","password":"secret","tenantId":"tenant_1","operatorId":"operator_1","role":"operator","apiKey":"session_api_key"}]';
    let fetchCalled = false;

    globalThis.fetch = async () => {
      fetchCalled = true;
      return Response.json({ ok: true });
    };

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "alice",
        password: "secret",
      }),
    );
    const response = await recoverStaleChannelEvents(
      jsonRequestWithCookie(
        "http://localhost/api/operator/channel-events/recover-stale",
        loginResponse.headers.get("set-cookie") ?? "",
        { olderThanMinutes: 20 },
      ),
    );

    assert.strictEqual(response.status, 403);
    assert.deepStrictEqual(await response.json(), {
      error: "Channel event recovery requires admin permission",
    });
    assert.strictEqual(fetchCalled, false);
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

  it("requires an admin operator before listing operator accounts", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"agent","password":"secret","tenantId":"tenant_1","operatorId":"agent_1","role":"operator","apiKey":"session_api_key"}]';
    let listCalled = false;
    setOperatorAdminStoreForTests({
      async listByTenant() {
        listCalled = true;
        return [];
      },
      async create() {
        throw new Error("not expected");
      },
      async updateByTenantOperatorId() {
        throw new Error("not expected");
      },
      async audit() {},
    });

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "agent",
        password: "secret",
      }),
    );
    const response = await listOperators(
      new Request("http://localhost/api/operator/operators", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 403);
    assert.deepStrictEqual(await response.json(), {
      error: "Operator account management requires admin permission",
    });
    assert.strictEqual(listCalled, false);
  });

  it("lets admins list sanitized operator accounts for their tenant", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    let requestedTenantId = "";
    setOperatorAdminStoreForTests({
      async listByTenant(tenantId) {
        requestedTenantId = tenantId;
        return [
          {
            id: "db_id",
            username: "agent",
            tenantId,
            operatorId: "agent_1",
            role: "operator",
            passwordHash: testPasswordHash("secret"),
            apiKey: "must_not_leak",
            disabled: false,
            sessionVersion: 2,
            createdAt: new Date("2026-06-06T00:00:00.000Z"),
            updatedAt: new Date("2026-06-06T00:00:00.000Z"),
          },
        ];
      },
      async create() {
        throw new Error("not expected");
      },
      async updateByTenantOperatorId() {
        throw new Error("not expected");
      },
      async audit() {},
    });

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await listOperators(
      new Request("http://localhost/api/operator/operators", {
        headers: { cookie: loginResponse.headers.get("set-cookie") ?? "" },
      }),
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(requestedTenantId, "tenant_1");
    assert.deepStrictEqual(await response.json(), {
      operators: [
        {
          username: "agent",
          tenantId: "tenant_1",
          operatorId: "agent_1",
          role: "operator",
          disabled: false,
          sessionVersion: 2,
        },
      ],
    });
  });

  it("lets admins create sanitized operator accounts without exposing secrets", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    const auditEvents: Array<{ action: string; details: unknown }> = [];
    let createdAccount: Parameters<OperatorAdminStore["create"]>[0] | undefined;
    setOperatorAdminStoreForTests({
      async listByTenant() {
        return [];
      },
      async create(input) {
        createdAccount = input;
        return {
          ...input,
          id: "db_id",
          disabled: false,
          sessionVersion: 1,
          createdAt: new Date("2026-06-06T00:00:00.000Z"),
          updatedAt: new Date("2026-06-06T00:00:00.000Z"),
        };
      },
      async updateByTenantOperatorId() {
        throw new Error("not expected");
      },
      async audit(action, details) {
        auditEvents.push({ action, details });
      },
    });

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await createOperator(
      jsonRequestWithCookie(
        "http://localhost/api/operator/operators",
        loginResponse.headers.get("set-cookie") ?? "",
        {
          username: "new_agent",
          password: "agent12345",
          operatorId: "agent_2",
          role: "operator",
        },
      ),
    );

    assert.strictEqual(response.status, 201);
    assert.deepStrictEqual(await response.json(), {
      operator: {
        username: "new_agent",
        tenantId: "tenant_1",
        operatorId: "agent_2",
        role: "operator",
        disabled: false,
        sessionVersion: 1,
      },
    });
    assert.strictEqual(createdAccount?.tenantId, "tenant_1");
    assert.strictEqual(createdAccount?.apiKey, "admin_api_key");
    assert.match(createdAccount?.passwordHash ?? "", /^scrypt:[^:]+:[A-Za-z0-9_-]+$/);
    assert.notStrictEqual(createdAccount?.passwordHash, "agent12345");
    assert.deepStrictEqual(auditEvents, [
      {
        action: "operator_account.created",
        details: {
          actorOperatorId: "admin_1",
          targetOperatorId: "agent_2",
          tenantId: "tenant_1",
          role: "operator",
        },
      },
    ]);
  });

  it("lets admins update operator status and revoke existing sessions", async () => {
    process.env.OPERATOR_SESSION_SECRET = "test_secret";
    process.env.OPERATOR_SESSION_ACCOUNTS =
      '[{"username":"admin","password":"secret","tenantId":"tenant_1","operatorId":"admin_1","role":"admin","apiKey":"admin_api_key"}]';
    const auditEvents: Array<{ action: string; details: unknown }> = [];
    let updateInput:
      | Parameters<OperatorAdminStore["updateByTenantOperatorId"]>[2]
      | undefined;
    setOperatorAdminStoreForTests({
      async listByTenant() {
        return [];
      },
      async create() {
        throw new Error("not expected");
      },
      async updateByTenantOperatorId(_tenantId, _operatorId, input) {
        updateInput = input;
        return {
          id: "db_id",
          username: "agent",
          tenantId: "tenant_1",
          operatorId: "agent_2",
          role: input.role ?? "operator",
          passwordHash: testPasswordHash("secret"),
          apiKey: "admin_api_key",
          disabled: input.disabled ?? false,
          sessionVersion: 4,
          createdAt: new Date("2026-06-06T00:00:00.000Z"),
          updatedAt: new Date("2026-06-06T00:00:00.000Z"),
        };
      },
      async audit(action, details) {
        auditEvents.push({ action, details });
      },
    });

    const loginResponse = await loginOperator(
      jsonRequest("http://localhost/api/operator/login", {
        username: "admin",
        password: "secret",
      }),
    );
    const response = await updateOperator(
      jsonRequestWithCookie(
        "http://localhost/api/operator/operators/agent_2",
        loginResponse.headers.get("set-cookie") ?? "",
        {
          disabled: true,
          role: "viewer",
          revokeSessions: true,
        },
        "PATCH",
      ),
      { params: Promise.resolve({ operatorId: "agent_2" }) },
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(updateInput, {
      disabled: true,
      role: "viewer",
      incrementSessionVersion: true,
    });
    assert.deepStrictEqual(await response.json(), {
      operator: {
        username: "agent",
        tenantId: "tenant_1",
        operatorId: "agent_2",
        role: "viewer",
        disabled: true,
        sessionVersion: 4,
      },
    });
    assert.deepStrictEqual(auditEvents, [
      {
        action: "operator_account.updated",
        details: {
          actorOperatorId: "admin_1",
          targetOperatorId: "agent_2",
          tenantId: "tenant_1",
          role: "viewer",
          disabled: true,
          revokedSessions: true,
        },
      },
    ]);
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonRequestWithCookie(
  url: string,
  cookie: string,
  body: unknown,
  method = "POST",
) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", cookie },
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
