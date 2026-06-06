import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_MAX_AGE_SECONDS = 300;

const channelSecretSchema = z.object({
  channel: z.string().min(1),
  tenantId: z.string().min(1),
  secret: z.string().min(12),
});

const channelAllowlistItemSchema = z.object({
  channel: z.string().min(1),
  tenantId: z.string().min(1),
});

const channelSecretsSchema = z.array(channelSecretSchema);
const channelAllowlistSchema = z.array(channelAllowlistItemSchema);
const boundaryIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/);

type HeaderValue = string | string[] | undefined;

type ReceiptStore = {
  channelWebhookReceipt: {
    create(args: {
      data: {
        channel: string;
        tenantId: string;
        eventId: string;
        bodySha256: string;
        eventTime: Date;
        receivedAt: Date;
      };
    }): Promise<unknown>;
  };
};

type AcceptIncomingWebhookInput = {
  channel: string;
  headers: Record<string, HeaderValue>;
  body: unknown;
  rawBody?: Buffer;
  now?: Date;
  env?: NodeJS.ProcessEnv;
};

export type AcceptedChannelWebhook = {
  status: "accepted";
  channel: string;
  tenantId: string;
  eventId: string;
  receivedAt: string;
  mode: "security_only";
};

export type VerifiedChannelWebhook = Omit<
  AcceptedChannelWebhook,
  "status" | "mode"
> & {
  bodySha256: string;
  eventTime: Date;
};

export type ChannelWebhookReadiness = {
  status: "ok" | "disabled" | "misconfigured";
  enabled: boolean;
  configuredChannels: string[];
  allowlistedChannels?: string[];
  allowlistedPairCount?: number;
  message?: string;
};

@Injectable()
export class ChannelWebhookSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async acceptIncomingWebhook(
    input: AcceptIncomingWebhookInput,
  ): Promise<AcceptedChannelWebhook> {
    const verified = this.verifyIncomingWebhook(input);

    await this.writeReceipt({
      channel: verified.channel,
      tenantId: verified.tenantId,
      eventId: verified.eventId,
      bodySha256: verified.bodySha256,
      eventTime: verified.eventTime,
      receivedAt: new Date(verified.receivedAt),
    });

    return {
      status: "accepted",
      channel: verified.channel,
      tenantId: verified.tenantId,
      eventId: verified.eventId,
      receivedAt: verified.receivedAt,
      mode: "security_only",
    };
  }

  verifyIncomingWebhook(input: AcceptIncomingWebhookInput): VerifiedChannelWebhook {
    const env = input.env ?? process.env;
    if (env.REAL_CHANNEL_WEBHOOKS_ENABLED !== "true") {
      throw new ForbiddenException("Real channel webhook intake is disabled");
    }

    const version = readHeader(input.headers, "x-smartcs-signature-version");
    const channel = assertBoundaryId(input.channel, "channel");
    const tenantId = assertBoundaryId(
      readHeader(input.headers, "x-smartcs-tenant-id"),
      "tenant",
    );
    const eventId = assertBoundaryId(
      readHeader(input.headers, "x-smartcs-event-id"),
      "event",
    );
    const timestamp = readHeader(input.headers, "x-smartcs-timestamp");
    const signature = readHeader(input.headers, "x-smartcs-signature");

    if (version !== "v1" || !timestamp || !signature) {
      throw new UnauthorizedException("Real channel webhook signature is required");
    }

    const now = input.now ?? new Date();
    const eventTime = assertFreshTimestamp(timestamp, now, env);
    const secret = findSecret(env, channel, tenantId);
    const rawBody = rawBodyBuffer(input);
    const bodySha256 = sha256Hex(rawBody);
    const expectedSignature = signWebhook({
      secret,
      version,
      channel,
      tenantId,
      timestamp,
      eventId,
      bodySha256,
    });

    if (!safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException("Real channel webhook signature is invalid");
    }

    assertAllowlisted(env, channel, tenantId);

    return {
      channel,
      tenantId,
      eventId,
      receivedAt: now.toISOString(),
      bodySha256,
      eventTime,
    };
  }

  getReadiness(env: NodeJS.ProcessEnv = process.env): ChannelWebhookReadiness {
    if (env.REAL_CHANNEL_WEBHOOKS_ENABLED !== "true") {
      return {
        status: "disabled",
        enabled: false,
        configuredChannels: [],
        message: "Real channel webhooks are disabled",
      };
    }

    try {
      const secrets = parseSecrets(env);
      if (secrets.length === 0) {
        return {
          status: "misconfigured",
          enabled: true,
          configuredChannels: [],
          allowlistedChannels: [],
          allowlistedPairCount: 0,
          message: "No real channel webhook secrets are configured",
        };
      }

      const allowlist = parseAllowlist(env);
      if (allowlist.length === 0) {
        return {
          status: "misconfigured",
          enabled: true,
          configuredChannels: configuredChannels(secrets),
          allowlistedChannels: [],
          allowlistedPairCount: 0,
          message: "No real channel webhook allowlist is configured",
        };
      }

      const secretsByBoundary = new Set(
        secrets.map((secret) => boundaryKey(secret.channel, secret.tenantId)),
      );
      const hasAllowlistWithoutSecret = allowlist.some(
        (item) => !secretsByBoundary.has(boundaryKey(item.channel, item.tenantId)),
      );
      if (hasAllowlistWithoutSecret) {
        return {
          status: "misconfigured",
          enabled: true,
          configuredChannels: configuredChannels(secrets),
          allowlistedChannels: configuredChannels(allowlist),
          allowlistedPairCount: allowlist.length,
          message: "Real channel webhook allowlist includes unconfigured tenants",
        };
      }

      return {
        status: "ok",
        enabled: true,
        configuredChannels: configuredChannels(secrets),
        allowlistedChannels: configuredChannels(allowlist),
        allowlistedPairCount: allowlist.length,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message === "invalid_allowlist"
          ? "Real channel webhook allowlist is invalid"
          : "Real channel webhook secrets are invalid";
      return {
        status: "misconfigured",
        enabled: true,
        configuredChannels: [],
        allowlistedChannels: [],
        allowlistedPairCount: 0,
        message,
      };
    }
  }

  private async writeReceipt(data: {
    channel: string;
    tenantId: string;
    eventId: string;
    bodySha256: string;
    eventTime: Date;
    receivedAt: Date;
  }) {
    try {
      await (this.prisma as unknown as ReceiptStore).channelWebhookReceipt.create({
        data,
      });
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        throw new ConflictException("Real channel webhook event was already accepted");
      }

      throw error;
    }
  }
}

export function realChannelSignaturePayload({
  version,
  channel,
  tenantId,
  timestamp,
  eventId,
  bodySha256,
}: {
  version: "v1";
  channel: string;
  tenantId: string;
  timestamp: string;
  eventId: string;
  bodySha256: string;
}) {
  return [version, channel, tenantId, timestamp, eventId, bodySha256].join("\n");
}

export function signWebhook({
  secret,
  version,
  channel,
  tenantId,
  timestamp,
  eventId,
  bodySha256,
}: {
  secret: string;
  version: "v1";
  channel: string;
  tenantId: string;
  timestamp: string;
  eventId: string;
  bodySha256: string;
}) {
  const signature = createHmac("sha256", secret)
    .update(
      realChannelSignaturePayload({
        version,
        channel,
        tenantId,
        timestamp,
        eventId,
        bodySha256,
      }),
    )
    .digest("hex");

  return `v1=${signature}`;
}

export function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function assertFreshTimestamp(
  timestamp: string,
  now: Date,
  env: NodeJS.ProcessEnv,
) {
  const receivedAt = Number(timestamp) * 1000;
  if (!Number.isFinite(receivedAt)) {
    throw new UnauthorizedException("Real channel webhook timestamp is invalid");
  }

  const maxAgeMs = maxAgeSeconds(env) * 1000;
  const ageMs = Math.abs(now.getTime() - receivedAt);
  if (ageMs > maxAgeMs) {
    throw new UnauthorizedException("Real channel webhook timestamp is expired");
  }

  return new Date(receivedAt);
}

function maxAgeSeconds(env: NodeJS.ProcessEnv) {
  const raw = Number(env.REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS);
  return Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : DEFAULT_MAX_AGE_SECONDS;
}

function findSecret(
  env: NodeJS.ProcessEnv,
  channel: string,
  tenantId: string,
) {
  let secrets: z.infer<typeof channelSecretsSchema>;
  try {
    secrets = parseSecrets(env);
  } catch {
    throw new UnauthorizedException("Real channel webhook secrets are misconfigured");
  }

  const secret = secrets.find((item) => item.channel === channel && item.tenantId === tenantId);
  if (!secret) {
    throw new UnauthorizedException("Real channel webhook tenant is not configured");
  }

  return secret.secret;
}

function assertAllowlisted(
  env: NodeJS.ProcessEnv,
  channel: string,
  tenantId: string,
) {
  let allowlist: z.infer<typeof channelAllowlistSchema>;
  try {
    allowlist = parseAllowlist(env);
  } catch {
    throw new ForbiddenException("Real channel webhook allowlist is misconfigured");
  }

  if (allowlist.length === 0) {
    throw new ForbiddenException("Real channel webhook allowlist is not configured");
  }

  const allowed = allowlist.some(
    (item) => item.channel === channel && item.tenantId === tenantId,
  );
  if (!allowed) {
    throw new ForbiddenException("Real channel webhook tenant is not allowlisted");
  }
}

function assertBoundaryId(value: string | undefined, label: string) {
  const parsed = boundaryIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new UnauthorizedException(`Real channel webhook ${label} is invalid`);
  }

  return parsed.data;
}

function parseSecrets(env: NodeJS.ProcessEnv) {
  const raw = env.REAL_CHANNEL_WEBHOOK_SECRETS;
  if (!raw) return [];

  return channelSecretsSchema.parse(JSON.parse(raw));
}

function parseAllowlist(env: NodeJS.ProcessEnv) {
  const raw = env.REAL_CHANNEL_WEBHOOK_ALLOWLIST;
  if (!raw) return [];

  try {
    return channelAllowlistSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("invalid_allowlist");
  }
}

function configuredChannels(
  values: Array<{ channel: string; tenantId: string }>,
) {
  return [...new Set(values.map((value) => value.channel).sort())];
}

function boundaryKey(channel: string, tenantId: string) {
  return JSON.stringify([channel, tenantId]);
}

function readHeader(
  headers: Record<string, HeaderValue>,
  name: string,
): string | undefined {
  const value =
    headers[name] ??
    headers[name.toLowerCase()] ??
    headers[name.toUpperCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function rawBodyBuffer(input: AcceptIncomingWebhookInput) {
  if (input.rawBody) return input.rawBody;
  throw new UnauthorizedException("Real channel webhook raw body is required");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isPrismaUniqueConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
