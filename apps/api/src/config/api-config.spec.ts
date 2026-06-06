import { describe, it } from "node:test";
import assert from "node:assert";
import { loadApiConfig, loadWebOrigin } from "./api-config";

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
      realChannelWebhookRateLimitPerMinute: 0,
    });
  });

  it("parses explicit port, web origin, and sandbox flag", () => {
    const config = loadApiConfig({
      PORT: "4200",
      WEB_ORIGIN: "https://console.example.com",
      DATABASE_URL: "file:./dev.db",
      WECOM_SANDBOX_ENABLED: "false",
      REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "120",
    });

    assert.strictEqual(config.port, 4200);
    assert.strictEqual(config.webOrigin, "https://console.example.com");
    assert.strictEqual(config.databaseUrl, "file:./dev.db");
    assert.strictEqual(config.wecomSandboxEnabled, false);
    assert.strictEqual(config.realChannelWebhookRateLimitPerMinute, 120);
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
});
