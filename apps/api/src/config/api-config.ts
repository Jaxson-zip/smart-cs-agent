import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CommerceChannelSchema,
  type CommerceChannel,
  ProviderWriteActionSchema,
  type ProviderWriteAction,
} from "@smart-cs-agent/shared";
import { z } from "zod";

const operatorApiKeyConfigSchema = z.object({
  key: z.string().min(8),
  tenantId: z.string().min(1),
  operatorId: z.string().min(1),
  role: z.enum(["admin", "operator", "viewer"]).default("operator"),
});

const operatorApiKeysEnvSchema = z
  .string()
  .optional()
  .default("[]")
  .superRefine((value, context) => {
    try {
      z.array(operatorApiKeyConfigSchema).parse(JSON.parse(value));
    } catch {
      context.addIssue({
        code: "custom",
        message: "OPERATOR_API_KEYS must be a JSON array of operator key records",
      });
    }
  });

const channelWebhookSecretSchema = z.object({
  channel: z.string().min(1),
  tenantId: z.string().min(1),
  secret: z.string().min(12),
});

const channelWebhookAllowlistItemSchema = z.object({
  channel: z.string().min(1),
  tenantId: z.string().min(1),
});

const providerReadonlyAdapterConfigSchema = z
  .object({
    channel: CommerceChannelSchema,
    tenantId: z.string().min(1),
    credentialRef: z
      .string()
      .regex(
        /^(secret|vault):\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/,
        "credentialRef must be a secret:// or vault:// reference",
      ),
  })
  .strict();

const providerWriteReviewAdapterConfigSchema = z
  .object({
    channel: CommerceChannelSchema,
    tenantId: z.string().min(1),
    allowedActions: z
      .array(ProviderWriteActionSchema)
      .min(1)
      .superRefine((value, context) => {
        if (new Set(value).size !== value.length) {
          context.addIssue({
            code: "custom",
            message: "allowedActions must not contain duplicates",
          });
        }
      }),
  })
  .strict();

const providerCredentialRefSchema = z
  .string()
  .regex(
    /^(secret|vault):\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/,
    "credentialRef must be a secret:// or vault:// reference",
  );

const providerCredentialRecordSchema = z
  .object({
    credentialRef: providerCredentialRefSchema,
  })
  .strict();

const providerReadonlyAdaptersEnvSchema = z
  .string()
  .optional()
  .default("[]")
  .transform((value, context) => {
    try {
      return z
        .array(providerReadonlyAdapterConfigSchema)
        .parse(JSON.parse(value));
    } catch {
      context.addIssue({
        code: "custom",
        message:
          "PROVIDER_READONLY_ADAPTERS must be a JSON array of readonly adapter references without inline secrets",
      });
      return z.NEVER;
    }
  });

const providerWriteReviewAdaptersEnvSchema = z
  .string()
  .optional()
  .default("[]")
  .transform((value, context) => {
    try {
      return z
        .array(providerWriteReviewAdapterConfigSchema)
        .parse(JSON.parse(value));
    } catch {
      context.addIssue({
        code: "custom",
        message:
          "PROVIDER_WRITE_REVIEW_ADAPTERS must be a JSON array of provider write review allowlists without credentials",
      });
      return z.NEVER;
    }
  });

const providerWritePayloadEscrowModeEnvSchema = z
  .enum(["disabled", "sealed_metadata"])
  .optional()
  .default("disabled");

const sha256EvidenceSchema = (fieldName: string) =>
  z
    .string()
    .optional()
    .default("")
    .superRefine((value, context) => {
      if (value === "") return;
      if (!/^[a-f0-9]{64}$/.test(value) || /^0+$/.test(value)) {
        context.addIssue({
          code: "custom",
          message: `${fieldName} must be a non-placeholder lowercase sha256 hash`,
        });
      }
    });

const apiConfigSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WECOM_SANDBOX_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  OPERATOR_API_KEYS: operatorApiKeysEnvSchema,
  ALLOW_INSECURE_OPERATOR_HEADERS: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  REAL_CHANNEL_WEBHOOKS_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  REAL_CHANNEL_WEBHOOK_KILL_SWITCH: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(300)
    .default(300),
  REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(0)
    .default(0),
  PROVIDER_READ_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30000)
    .default(5000),
  PROVIDER_READ_MAX_RETRIES: z.coerce
    .number()
    .int()
    .min(0)
    .max(3)
    .default(0),
  PROVIDER_READONLY_ADAPTERS: providerReadonlyAdaptersEnvSchema,
  PROVIDER_WRITE_REVIEW_ADAPTERS: providerWriteReviewAdaptersEnvSchema,
  PROVIDER_WRITE_EXECUTION_KILL_SWITCH: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((value) => value === "true"),
  PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256: sha256EvidenceSchema(
    "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256",
  ),
  PROVIDER_WRITE_APPROVAL_SHA256: sha256EvidenceSchema(
    "PROVIDER_WRITE_APPROVAL_SHA256",
  ),
  PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: providerWritePayloadEscrowModeEnvSchema,
});

const webOriginSchema = z.string().url().default("http://localhost:3000");

export type ApiConfig = {
  port: number;
  webOrigin: string;
  databaseUrl: string;
  wecomSandboxEnabled: boolean;
  operatorApiKeys: string;
  allowInsecureOperatorHeaders: boolean;
  realChannelWebhooksEnabled: boolean;
  realChannelWebhookKillSwitch: boolean;
  realChannelWebhookMaxAgeSeconds: number;
  realChannelWebhookRateLimitPerMinute: number;
  providerReadonlyAdapters: ProviderReadonlyAdapterConfig[];
  providerWriteReviewAdapters: ProviderWriteReviewAdapterConfig[];
  providerWriteExecutionKillSwitch: boolean;
  providerWriteLiveExecutorEnabled: boolean;
  providerWriteDryRunRehearsalSha256: string;
  providerWriteApprovalSha256: string;
  providerWritePayloadEscrowMode: ProviderWritePayloadEscrowMode;
  providerReadTimeoutMs: number;
  providerReadMaxRetries: number;
};

export type ProviderReadonlyAdapterConfig = {
  channel: CommerceChannel;
  tenantId: string;
  credentialRef: string;
};

export type ProviderWriteReviewAdapterConfig = {
  channel: CommerceChannel;
  tenantId: string;
  allowedActions: ProviderWriteAction[];
};

export type ProviderWritePayloadEscrowMode = "disabled" | "sealed_metadata";

export type ProviderCredentialRefRecord = {
  credentialRef: string;
};

export type ProviderReadonlyHarnessConfig = {
  timeoutMs: number;
  maxRetries: number;
};

export type ProviderCredentialRefLoadResult =
  | { status: "not_configured"; records: [] }
  | { status: "configured"; records: ProviderCredentialRefRecord[] }
  | { status: "invalid"; records: []; message: string };

type LoadConfigOptions = {
  includeDotEnv?: boolean;
};

export function loadApiConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): ApiConfig {
  const includeDotEnv = options.includeDotEnv ?? shouldLoadDotEnv(env);
  const mergedEnv = {
    ...(includeDotEnv ? loadDotEnv() : {}),
    ...env,
  };
  const parsed = apiConfigSchema.safeParse(mergedEnv);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const field = issue.path.join(".") || "environment";
        return `${field}: ${issue.message}`;
      })
      .join("; ");

    throw new Error(`Invalid API configuration: ${details}`);
  }

  const productionGateIssues = [
    ...productionRealChannelIntakeIssues(mergedEnv),
    ...productionProviderWriteLiveExecutorIssues(parsed.data, mergedEnv),
  ];
  if (productionGateIssues.length > 0) {
    throw new Error(
      `Invalid API configuration: ${productionGateIssues.join("; ")}`,
    );
  }

  return {
    port: parsed.data.PORT,
    webOrigin: parsed.data.WEB_ORIGIN,
    databaseUrl: parsed.data.DATABASE_URL,
    wecomSandboxEnabled: parsed.data.WECOM_SANDBOX_ENABLED,
    operatorApiKeys: parsed.data.OPERATOR_API_KEYS,
    allowInsecureOperatorHeaders: parsed.data.ALLOW_INSECURE_OPERATOR_HEADERS,
    realChannelWebhooksEnabled: parsed.data.REAL_CHANNEL_WEBHOOKS_ENABLED,
    realChannelWebhookKillSwitch: parsed.data.REAL_CHANNEL_WEBHOOK_KILL_SWITCH,
    realChannelWebhookMaxAgeSeconds:
      parsed.data.REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS,
    realChannelWebhookRateLimitPerMinute:
      parsed.data.REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE,
    providerReadonlyAdapters: parsed.data.PROVIDER_READONLY_ADAPTERS,
    providerWriteReviewAdapters: parsed.data.PROVIDER_WRITE_REVIEW_ADAPTERS,
    providerWriteExecutionKillSwitch:
      parsed.data.PROVIDER_WRITE_EXECUTION_KILL_SWITCH,
    providerWriteLiveExecutorEnabled:
      parsed.data.PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED,
    providerWriteDryRunRehearsalSha256:
      parsed.data.PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256,
    providerWriteApprovalSha256:
      parsed.data.PROVIDER_WRITE_APPROVAL_SHA256,
    providerWritePayloadEscrowMode:
      parsed.data.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE,
    providerReadTimeoutMs: parsed.data.PROVIDER_READ_TIMEOUT_MS,
    providerReadMaxRetries: parsed.data.PROVIDER_READ_MAX_RETRIES,
  };
}

export function providerWriteExecutionKillSwitchEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const parsed = apiConfigSchema.pick({
    PROVIDER_WRITE_EXECUTION_KILL_SWITCH: true,
  }).safeParse(env);

  if (!parsed.success) return true;
  return parsed.data.PROVIDER_WRITE_EXECUTION_KILL_SWITCH;
}

export function providerWriteLiveExecutorEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const parsed = apiConfigSchema.pick({
    PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED: true,
  }).safeParse(env);

  if (!parsed.success) return false;
  return parsed.data.PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED;
}

export function providerWritePayloadEscrowMode(
  env: NodeJS.ProcessEnv = process.env,
): ProviderWritePayloadEscrowMode {
  const parsed = apiConfigSchema.pick({
    PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: true,
  }).safeParse(env);

  if (!parsed.success) return "disabled";
  return parsed.data.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE;
}

export function loadProviderReadonlyAdapterConfigs(
  env: NodeJS.ProcessEnv = process.env,
): ProviderReadonlyAdapterConfig[] {
  const parsed = providerReadonlyAdaptersEnvSchema.safeParse(
    env.PROVIDER_READONLY_ADAPTERS,
  );

  if (!parsed.success) {
    throw new Error(
      "Invalid API configuration: PROVIDER_READONLY_ADAPTERS must be a JSON array of readonly adapter references without inline secrets",
    );
  }

  return parsed.data;
}

export function loadProviderWriteReviewAdapterConfigs(
  env: NodeJS.ProcessEnv = process.env,
): ProviderWriteReviewAdapterConfig[] {
  const parsed = providerWriteReviewAdaptersEnvSchema.safeParse(
    env.PROVIDER_WRITE_REVIEW_ADAPTERS,
  );

  if (!parsed.success) {
    throw new Error(
      "Invalid API configuration: PROVIDER_WRITE_REVIEW_ADAPTERS must be a JSON array of provider write review allowlists without credentials",
    );
  }

  return parsed.data;
}

export function loadProviderCredentialRefs(
  env: NodeJS.ProcessEnv = process.env,
): ProviderCredentialRefLoadResult {
  const rawProviderCredentials = env.PROVIDER_CREDENTIALS?.trim();
  if (!rawProviderCredentials) {
    return { status: "not_configured", records: [] };
  }

  let providerCredentialRecords: unknown;
  try {
    providerCredentialRecords = JSON.parse(rawProviderCredentials);
  } catch {
    return invalidProviderCredentialRefs();
  }

  const parsed = z
    .array(providerCredentialRecordSchema)
    .safeParse(providerCredentialRecords);

  if (!parsed.success) {
    return invalidProviderCredentialRefs();
  }

  const credentialRefs = parsed.data.map((item) => item.credentialRef);
  if (new Set(credentialRefs).size !== credentialRefs.length) {
    return invalidProviderCredentialRefs();
  }

  return {
    status: "configured",
    records: credentialRefs.map((credentialRef) => ({ credentialRef })),
  };
}

export function loadProviderReadonlyHarnessConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderReadonlyHarnessConfig {
  const parsed = apiConfigSchema.pick({
    PROVIDER_READ_TIMEOUT_MS: true,
    PROVIDER_READ_MAX_RETRIES: true,
  }).safeParse(env);

  if (!parsed.success) {
    throw new Error(
      "Invalid API configuration: PROVIDER_READ_TIMEOUT_MS must be between 100 and 30000 and PROVIDER_READ_MAX_RETRIES must be between 0 and 3",
    );
  }

  return {
    timeoutMs: parsed.data.PROVIDER_READ_TIMEOUT_MS,
    maxRetries: parsed.data.PROVIDER_READ_MAX_RETRIES,
  };
}

export function loadWebOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const parsed = webOriginSchema.safeParse(env.WEB_ORIGIN);

  if (!parsed.success) {
    throw new Error(`Invalid WEB_ORIGIN configuration: ${parsed.error.issues[0]?.message ?? "invalid URL"}`);
  }

  return parsed.data;
}

function shouldLoadDotEnv(env: NodeJS.ProcessEnv): boolean {
  if (env.SMART_CS_LOAD_DOTENV === "true") return true;
  if (env.SMART_CS_LOAD_DOTENV === "false") return false;
  return env.NODE_ENV !== "production" && env.CI !== "true";
}

function loadDotEnv(startDir = process.cwd()): Record<string, string> {
  const envPath = findUp(".env", startDir);
  if (!envPath) return {};

  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
        const rawValue = line.slice(separatorIndex + 1).trim();
        return [key, rawValue.replace(/^["']|["']$/g, "")];
      }),
  );
}

function invalidProviderCredentialRefs(): ProviderCredentialRefLoadResult {
  return {
    status: "invalid",
    records: [],
    message:
      "PROVIDER_CREDENTIALS must be a unique JSON array of credentialRef records without inline secrets",
  };
}

function productionRealChannelIntakeIssues(
  env: Record<string, string | undefined>,
) {
  if (
    env.NODE_ENV !== "production" ||
    env.REAL_CHANNEL_WEBHOOKS_ENABLED !== "true"
  ) {
    return [];
  }

  const issues: string[] = [];

  const webhookSecrets = parseWebhookSecrets(env.REAL_CHANNEL_WEBHOOK_SECRETS);
  if (webhookSecrets.length === 0) {
    issues.push(
      "REAL_CHANNEL_WEBHOOK_SECRETS: production real-channel intake requires at least one configured tenant secret",
    );
  }
  const webhookAllowlist = parseWebhookAllowlist(
    env.REAL_CHANNEL_WEBHOOK_ALLOWLIST,
  );
  if (webhookAllowlist.length === 0) {
    issues.push(
      "REAL_CHANNEL_WEBHOOK_ALLOWLIST: production real-channel intake requires at least one allowlisted tenant/channel pair",
    );
  } else {
    const secretBoundaries = new Set(
      webhookSecrets.map((item) => boundaryKey(item.channel, item.tenantId)),
    );
    if (
      webhookAllowlist.some(
        (item) => !secretBoundaries.has(boundaryKey(item.channel, item.tenantId)),
      )
    ) {
      issues.push(
        "REAL_CHANNEL_WEBHOOK_ALLOWLIST: every allowlisted tenant/channel pair must have a matching webhook secret",
      );
    }
  }
  const rateLimitPerMinute = readRequiredNonNegativeInt(
    env.REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE,
  );
  if (rateLimitPerMinute === undefined || rateLimitPerMinute <= 0) {
    issues.push(
      "REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: production real-channel intake requires a positive per-minute limit",
    );
  }
  if (readRequiredPositiveInt(env.REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS) === undefined) {
    issues.push(
      "REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS: production real-channel intake requires an explicit positive freshness window",
    );
  }
  if (readRequiredNonNegativeInt(env.CHANNEL_QUEUE_PENDING_WARN_THRESHOLD) === undefined) {
    issues.push(
      "CHANNEL_QUEUE_PENDING_WARN_THRESHOLD: production real-channel intake requires a queue backlog threshold",
    );
  }
  if (readRequiredPositiveInt(env.CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS) === undefined) {
    issues.push(
      "CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS: production real-channel intake requires an oldest-pending-age threshold",
    );
  }
  if (readRequiredNonNegativeInt(env.CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD) === undefined) {
    issues.push(
      "CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD: production real-channel intake requires a stale-processing threshold",
    );
  }
  if (readRequiredPositiveInt(env.CHANNEL_QUEUE_STALE_AFTER_MINUTES) === undefined) {
    issues.push(
      "CHANNEL_QUEUE_STALE_AFTER_MINUTES: production real-channel intake requires a stale-processing age window",
    );
  }

  return issues;
}

type ParsedApiConfigEnv = z.infer<typeof apiConfigSchema>;

function productionProviderWriteLiveExecutorIssues(
  config: ParsedApiConfigEnv,
  env: Record<string, string | undefined>,
) {
  if (
    env.NODE_ENV !== "production" ||
    !config.PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED
  ) {
    return [];
  }

  const issues: string[] = [];

  if (!config.PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256) {
    issues.push(
      "PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256: production live provider write executor requires sanitized dry-run rehearsal evidence hash",
    );
  }
  if (!config.PROVIDER_WRITE_APPROVAL_SHA256) {
    issues.push(
      "PROVIDER_WRITE_APPROVAL_SHA256: production live provider write executor requires sanitized provider write approval evidence hash",
    );
  }
  if (!config.PROVIDER_WRITE_EXECUTION_KILL_SWITCH) {
    issues.push(
      "PROVIDER_WRITE_EXECUTION_KILL_SWITCH: production live provider write executor must start with the kill switch enabled",
    );
  }
  if (config.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE !== "sealed_metadata") {
    issues.push(
      "PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: production live provider write executor requires sealed_metadata escrow readiness",
    );
  }
  if (config.PROVIDER_WRITE_REVIEW_ADAPTERS.length === 0) {
    issues.push(
      "PROVIDER_WRITE_REVIEW_ADAPTERS: production live provider write executor requires at least one review allowlist",
    );
  }

  const providerCredentials = loadProviderCredentialRefs(env);
  if (
    providerCredentials.status !== "configured" ||
    providerCredentials.records.length === 0
  ) {
    issues.push(
      "PROVIDER_CREDENTIALS: production live provider write executor requires at least one credential ref record without inline secret material",
    );
  }

  return issues;
}

function parseWebhookSecrets(value: string | undefined) {
  if (!value) return [];

  try {
    return z.array(channelWebhookSecretSchema).parse(JSON.parse(value));
  } catch {
    return [];
  }
}

function parseWebhookAllowlist(value: string | undefined) {
  if (!value) return [];

  try {
    return z.array(channelWebhookAllowlistItemSchema).parse(JSON.parse(value));
  } catch {
    return [];
  }
}

function boundaryKey(channel: string, tenantId: string) {
  return JSON.stringify([channel, tenantId]);
}

function readRequiredPositiveInt(value: string | undefined) {
  const parsed = readRequiredNonNegativeInt(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function readRequiredNonNegativeInt(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function findUp(fileName: string, startDir: string): string | undefined {
  let current = startDir;

  while (true) {
    const candidate = join(current, fileName);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
