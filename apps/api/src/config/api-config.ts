import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

const apiConfigSchema = z.object({
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
  REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(0)
    .default(0),
});

const webOriginSchema = z.string().url().default("http://localhost:3000");

export type ApiConfig = {
  port: number;
  webOrigin: string;
  databaseUrl: string;
  wecomSandboxEnabled: boolean;
  operatorApiKeys: string;
  allowInsecureOperatorHeaders: boolean;
  realChannelWebhookRateLimitPerMinute: number;
};

type LoadConfigOptions = {
  includeDotEnv?: boolean;
};

export function loadApiConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): ApiConfig {
  const includeDotEnv = options.includeDotEnv ?? shouldLoadDotEnv(env);
  const parsed = apiConfigSchema.safeParse({
    ...(includeDotEnv ? loadDotEnv() : {}),
    ...env,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const field = issue.path.join(".") || "environment";
        return `${field}: ${issue.message}`;
      })
      .join("; ");

    throw new Error(`Invalid API configuration: ${details}`);
  }

  return {
    port: parsed.data.PORT,
    webOrigin: parsed.data.WEB_ORIGIN,
    databaseUrl: parsed.data.DATABASE_URL,
    wecomSandboxEnabled: parsed.data.WECOM_SANDBOX_ENABLED,
    operatorApiKeys: parsed.data.OPERATOR_API_KEYS,
    allowInsecureOperatorHeaders: parsed.data.ALLOW_INSECURE_OPERATOR_HEADERS,
    realChannelWebhookRateLimitPerMinute:
      parsed.data.REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE,
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
