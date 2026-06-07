import { describe, it } from "node:test";
import assert from "node:assert";
import {
  loadApiConfig,
  loadProviderCredentialRefs,
  providerWriteExecutionKillSwitchEnabled,
  providerWritePayloadEscrowMode,
  loadProviderWriteReviewAdapterConfigs,
  loadWebOrigin,
} from "./api-config";

describe("loadApiConfig", () => {
  it("loads validated API configuration with safe defaults", () => {
    const config = loadApiConfig({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
    });

    assert.deepStrictEqual(config, {
      port: 4100,
      webOrigin: "http://localhost:3000",
      databaseUrl: "postgresql://user:pass@localhost:5432/smart_cs_agent",
      wecomSandboxEnabled: true,
      operatorApiKeys: "[]",
      allowInsecureOperatorHeaders: false,
      realChannelWebhooksEnabled: false,
      realChannelWebhookKillSwitch: false,
      realChannelWebhookMaxAgeSeconds: 300,
      realChannelWebhookRateLimitPerMinute: 0,
      providerReadonlyAdapters: [],
      providerWriteReviewAdapters: [],
      providerWriteExecutionKillSwitch: true,
      providerWritePayloadEscrowMode: "disabled",
      providerReadTimeoutMs: 5000,
      providerReadMaxRetries: 0,
    });
  });

  it("parses explicit port, web origin, and sandbox flag", () => {
    const config = loadApiConfig({
      PORT: "4200",
      WEB_ORIGIN: "https://console.example.com",
      DATABASE_URL: "file:./dev.db",
      WECOM_SANDBOX_ENABLED: "false",
      REAL_CHANNEL_WEBHOOK_KILL_SWITCH: "true",
      REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "120",
      PROVIDER_WRITE_EXECUTION_KILL_SWITCH: "false",
      PROVIDER_READ_TIMEOUT_MS: "2500",
      PROVIDER_READ_MAX_RETRIES: "2",
    });

    assert.strictEqual(config.port, 4200);
    assert.strictEqual(config.webOrigin, "https://console.example.com");
    assert.strictEqual(config.databaseUrl, "file:./dev.db");
    assert.strictEqual(config.wecomSandboxEnabled, false);
    assert.strictEqual(config.realChannelWebhookKillSwitch, true);
    assert.strictEqual(config.realChannelWebhookRateLimitPerMinute, 120);
    assert.strictEqual(config.providerWriteExecutionKillSwitch, false);
    assert.strictEqual(config.providerReadTimeoutMs, 2500);
    assert.strictEqual(config.providerReadMaxRetries, 2);
  });

  it("keeps provider write payload escrow disabled unless explicitly configured", () => {
    assert.strictEqual(providerWritePayloadEscrowMode({}), "disabled");
    assert.strictEqual(
      providerWritePayloadEscrowMode({
        PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: "disabled",
      }),
      "disabled",
    );

    const config = loadApiConfig(
      {
        DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
        PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: "sealed_metadata",
      },
      { includeDotEnv: false },
    );

    assert.strictEqual(config.providerWritePayloadEscrowMode, "sealed_metadata");
    assert.strictEqual(
      providerWritePayloadEscrowMode({
        PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: "sealed_metadata",
      }),
      "sealed_metadata",
    );
  });

  it("rejects invalid provider write payload escrow configuration", () => {
    for (const value of [
      "true",
      "sealed_metadata:secret://provider-token",
      "sealed_metadata:vault://provider-token",
      "sealed_metadata:{\"ciphertext\":\"abc\"}",
    ]) {
      assert.throws(
        () =>
          loadApiConfig(
            {
              DATABASE_URL:
                "postgresql://user:pass@localhost:5432/smart_cs_agent",
              PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: value,
            },
            { includeDotEnv: false },
          ),
        /PROVIDER_WRITE_PAYLOAD_ESCROW_MODE/,
      );
    }
  });

  it("keeps provider write execution kill switch enabled unless explicitly disabled", () => {
    assert.strictEqual(providerWriteExecutionKillSwitchEnabled({}), true);
    assert.strictEqual(
      providerWriteExecutionKillSwitchEnabled({
        PROVIDER_WRITE_EXECUTION_KILL_SWITCH: "true",
      }),
      true,
    );
    assert.strictEqual(
      providerWriteExecutionKillSwitchEnabled({
        PROVIDER_WRITE_EXECUTION_KILL_SWITCH: "false",
      }),
      false,
    );
    assert.strictEqual(
      providerWriteExecutionKillSwitchEnabled({
        PROVIDER_WRITE_EXECUTION_KILL_SWITCH: "not-a-boolean",
      }),
      true,
    );
  });

  it("lets explicit environment values override local .env defaults", () => {
    const config = loadApiConfig({
      PORT: "4300",
      WEB_ORIGIN: "https://ops.example.com",
      DATABASE_URL: "postgresql://override:override@localhost:5432/override",
      WECOM_SANDBOX_ENABLED: "true",
    });

    assert.strictEqual(config.port, 4300);
    assert.strictEqual(config.webOrigin, "https://ops.example.com");
    assert.strictEqual(
      config.databaseUrl,
      "postgresql://override:override@localhost:5432/override",
    );
  });

  it("does not load local .env values in CI unless explicitly enabled", () => {
    assert.throws(
      () =>
        loadApiConfig({
          CI: "true",
        }),
      /DATABASE_URL/,
    );
  });

  it("can load WEB_ORIGIN without requiring database configuration", () => {
    assert.strictEqual(loadWebOrigin({}), "http://localhost:3000");
    assert.strictEqual(
      loadWebOrigin({ WEB_ORIGIN: "https://console.example.com" }),
      "https://console.example.com",
    );
    assert.throws(
      () => loadWebOrigin({ WEB_ORIGIN: "console.example.com" }),
      /Invalid WEB_ORIGIN configuration/,
    );
  });

  it("rejects invalid deploy configuration", () => {
    assert.throws(
      () =>
        loadApiConfig({
          PORT: "not-a-port",
          WEB_ORIGIN: "console.example.com",
          WECOM_SANDBOX_ENABLED: "yes",
        }),
      /Invalid API configuration/,
    );
  });

  it("rejects malformed operator API key configuration", () => {
    assert.throws(
      () =>
        loadApiConfig({
          DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
          OPERATOR_API_KEYS: "not-json",
        }),
      /OPERATOR_API_KEYS/,
    );
  });

  it("rejects invalid real-channel webhook rate limit configuration", () => {
    assert.throws(
      () =>
        loadApiConfig({
          DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
          REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "-1",
        }),
      /REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE/,
    );
  });

  it("rejects invalid provider read harness configuration", () => {
    const cases = [
      { PROVIDER_READ_TIMEOUT_MS: "99" },
      { PROVIDER_READ_TIMEOUT_MS: "30001" },
      { PROVIDER_READ_MAX_RETRIES: "-1" },
      { PROVIDER_READ_MAX_RETRIES: "4" },
    ];

    for (const item of cases) {
      assert.throws(
        () =>
          loadApiConfig({
            DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
            ...item,
          }),
        /PROVIDER_READ/,
      );
    }
  });

  it("parses provider readonly adapter references without secrets", () => {
    const config = loadApiConfig({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
      PROVIDER_READONLY_ADAPTERS: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_1",
          credentialRef: "secret://smartcs/taobao/tenant_1",
        },
      ]),
    });

    assert.deepStrictEqual(config.providerReadonlyAdapters, [
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
    ]);
  });

  it("parses provider write review adapter allowlists without credentials", () => {
    const config = loadApiConfig({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
      PROVIDER_WRITE_REVIEW_ADAPTERS: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_1",
          allowedActions: ["modify_address", "issue_coupon"],
        },
      ]),
    });

    assert.deepStrictEqual(config.providerWriteReviewAdapters, [
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["modify_address", "issue_coupon"],
      },
    ]);
    assert.deepStrictEqual(
      loadProviderWriteReviewAdapterConfigs({
        PROVIDER_WRITE_REVIEW_ADAPTERS: JSON.stringify([
          {
            channel: "douyin",
            tenantId: "tenant_2",
            allowedActions: ["urge_logistics"],
          },
        ]),
      }),
      [
        {
          channel: "douyin",
          tenantId: "tenant_2",
          allowedActions: ["urge_logistics"],
        },
      ],
    );
  });

  it("rejects provider write review configs with secrets or unsupported actions", () => {
    const cases = [
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["modify_address"],
        credentialRef: "secret://smartcs/taobao/tenant_1",
      },
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["refund"],
      },
      {
        channel: "taobao",
        tenantId: "tenant_1",
        allowedActions: ["issue_coupon", "issue_coupon"],
      },
    ];

    for (const item of cases) {
      assert.throws(
        () =>
          loadApiConfig({
            DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
            PROVIDER_WRITE_REVIEW_ADAPTERS: JSON.stringify([item]),
          }),
        /PROVIDER_WRITE_REVIEW_ADAPTERS/,
      );
    }
  });

  it("rejects provider readonly adapter configs that inline secret material", () => {
    const cases = [
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "secret://smartcs/taobao/tenant_1",
        accessToken: "must_not_inline",
      },
      {
        channel: "taobao",
        tenantId: "tenant_1",
        credentialRef: "actual_token_value",
      },
    ];

    for (const item of cases) {
      assert.throws(
        () =>
          loadApiConfig({
            DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
            PROVIDER_READONLY_ADAPTERS: JSON.stringify([item]),
          }),
        /PROVIDER_READONLY_ADAPTERS/,
      );
    }
  });

  it("parses provider credential presence records without returning secret material", () => {
    const result = loadProviderCredentialRefs({
      PROVIDER_CREDENTIALS: JSON.stringify([
        {
          credentialRef: "secret://smartcs/taobao/tenant_1",
        },
      ]),
    });

    assert.strictEqual(result.status, "configured");
    assert.deepStrictEqual(result.records, [
      { credentialRef: "secret://smartcs/taobao/tenant_1" },
    ]);
    assert.strictEqual(
      JSON.stringify(result).includes("actual_provider_token_must_not_leak"),
      false,
    );
  });

  it("rejects provider credential records that inline secret material", () => {
    const cases = [
      { material: "actual_provider_token_must_not_leak" },
      { accessToken: "actual_provider_token_must_not_leak" },
      { token: "actual_provider_token_must_not_leak" },
      { apiKey: "actual_provider_token_must_not_leak" },
      { clientSecret: "actual_provider_token_must_not_leak" },
    ];

    for (const item of cases) {
      const result = loadProviderCredentialRefs({
        PROVIDER_CREDENTIALS: JSON.stringify([
          {
            credentialRef: "secret://smartcs/taobao/tenant_1",
            ...item,
          },
        ]),
      });

      assert.strictEqual(result.status, "invalid");
      assert.deepStrictEqual(result.records, []);
      assert.strictEqual(
        JSON.stringify(result).includes("actual_provider_token_must_not_leak"),
        false,
      );
      assert.strictEqual(JSON.stringify(result).includes("secret://"), false);
    }
  });

  it("rejects duplicate provider credential refs without leaking material", () => {
    const result = loadProviderCredentialRefs({
      PROVIDER_CREDENTIALS: JSON.stringify([
        {
          credentialRef: "secret://smartcs/taobao/tenant_1",
        },
        {
          credentialRef: "secret://smartcs/taobao/tenant_1",
        },
      ]),
    });

    assert.strictEqual(result.status, "invalid");
    assert.deepStrictEqual(result.records, []);
    assert.strictEqual(
      JSON.stringify(result).includes("actual_provider_token_must_not_leak"),
      false,
    );
    assert.strictEqual(JSON.stringify(result).includes("secret://"), false);
  });

  it("does not propagate provider credential material through loadApiConfig", () => {
    const config = loadApiConfig(
      {
        DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
        PROVIDER_CREDENTIALS: "not-json",
      },
      { includeDotEnv: false },
    );

    assert.strictEqual("providerCredentials" in config, false);
    assert.strictEqual(JSON.stringify(config).includes("not-json"), false);
  });

  it("does not parse real-channel secrets when the production intake is disabled", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
      REAL_CHANNEL_WEBHOOKS_ENABLED: "false",
      REAL_CHANNEL_WEBHOOK_SECRETS: "{not-json",
    });

    assert.strictEqual(config.realChannelWebhooksEnabled, false);
  });

  it("requires every production intake gate when real-channel webhooks are enabled", () => {
    const validProductionRealChannelEnv = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
      REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
      REAL_CHANNEL_WEBHOOK_SECRETS: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_1",
          secret: "real_channel_secret_123",
        },
      ]),
      REAL_CHANNEL_WEBHOOK_ALLOWLIST: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_1",
        },
      ]),
      REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "60",
      REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS: "300",
      CHANNEL_QUEUE_PENDING_WARN_THRESHOLD: "100",
      CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS: "900",
      CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD: "0",
      CHANNEL_QUEUE_STALE_AFTER_MINUTES: "15",
    };

    const cases: Array<{
      field: keyof typeof validProductionRealChannelEnv;
      value?: string;
      expected: RegExp;
    }> = [
      {
        field: "REAL_CHANNEL_WEBHOOK_SECRETS",
        value: "[]",
        expected: /REAL_CHANNEL_WEBHOOK_SECRETS/,
      },
      {
        field: "REAL_CHANNEL_WEBHOOK_ALLOWLIST",
        value: "[]",
        expected: /REAL_CHANNEL_WEBHOOK_ALLOWLIST/,
      },
      {
        field: "REAL_CHANNEL_WEBHOOK_ALLOWLIST",
        value: "{not-json",
        expected: /REAL_CHANNEL_WEBHOOK_ALLOWLIST/,
      },
      {
        field: "REAL_CHANNEL_WEBHOOK_ALLOWLIST",
        value: JSON.stringify([{ channel: "douyin", tenantId: "tenant_1" }]),
        expected: /REAL_CHANNEL_WEBHOOK_ALLOWLIST/,
      },
      {
        field: "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE",
        value: "0",
        expected: /REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE/,
      },
      {
        field: "REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS",
        value: undefined,
        expected: /REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS/,
      },
      {
        field: "CHANNEL_QUEUE_PENDING_WARN_THRESHOLD",
        value: undefined,
        expected: /CHANNEL_QUEUE_PENDING_WARN_THRESHOLD/,
      },
      {
        field: "CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS",
        value: undefined,
        expected: /CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS/,
      },
      {
        field: "CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD",
        value: undefined,
        expected: /CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD/,
      },
      {
        field: "CHANNEL_QUEUE_STALE_AFTER_MINUTES",
        value: undefined,
        expected: /CHANNEL_QUEUE_STALE_AFTER_MINUTES/,
      },
    ];

    for (const testCase of cases) {
      const env = { ...validProductionRealChannelEnv };
      if (testCase.value === undefined) {
        delete env[testCase.field];
      } else {
        env[testCase.field] = testCase.value;
      }

      assert.throws(
        () => loadApiConfig(env),
        testCase.expected,
        `Expected ${testCase.field} to be required`,
      );
    }
  });

  it("accepts production real-channel webhooks when all intake gates are configured", () => {
    const config = loadApiConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/smart_cs_agent",
      REAL_CHANNEL_WEBHOOKS_ENABLED: "true",
      REAL_CHANNEL_WEBHOOK_SECRETS: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_1",
          secret: "real_channel_secret_123",
        },
      ]),
      REAL_CHANNEL_WEBHOOK_ALLOWLIST: JSON.stringify([
        {
          channel: "taobao",
          tenantId: "tenant_1",
        },
      ]),
      REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "60",
      REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS: "300",
      CHANNEL_QUEUE_PENDING_WARN_THRESHOLD: "100",
      CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS: "900",
      CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD: "0",
      CHANNEL_QUEUE_STALE_AFTER_MINUTES: "15",
    });

    assert.strictEqual(config.realChannelWebhooksEnabled, true);
    assert.strictEqual(config.realChannelWebhookMaxAgeSeconds, 300);
    assert.strictEqual(config.realChannelWebhookRateLimitPerMinute, 60);
  });
});
