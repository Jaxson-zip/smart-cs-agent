import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

type RateLimitInput = {
  channel: string;
  tenantId: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
};

type RateLimitBucket = {
  windowStartMs: number;
  count: number;
};

const WINDOW_MS = 60_000;

@Injectable()
export class RealChannelRateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastCleanupWindowStartMs = 0;

  assertAllowed(input: RateLimitInput) {
    const limit = rateLimitPerMinute(input.env ?? process.env);
    if (limit === 0) return;

    const now = input.now ?? new Date();
    const windowStartMs = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS;
    this.cleanupExpiredBuckets(windowStartMs);
    const key = rateLimitKey(input);
    const current = this.buckets.get(key);
    const bucket =
      current?.windowStartMs === windowStartMs
        ? current
        : { windowStartMs, count: 0 };

    if (bucket.count >= limit) {
      throw new HttpException(
        "Real channel webhook rate limit exceeded",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
  }

  private cleanupExpiredBuckets(currentWindowStartMs: number) {
    if (this.lastCleanupWindowStartMs === currentWindowStartMs) return;
    this.lastCleanupWindowStartMs = currentWindowStartMs;

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.windowStartMs < currentWindowStartMs) {
        this.buckets.delete(key);
      }
    }
  }
}

function rateLimitPerMinute(env: NodeJS.ProcessEnv) {
  const raw = Number(env.REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

function rateLimitKey(input: Pick<RateLimitInput, "channel" | "tenantId">) {
  return JSON.stringify([input.channel, input.tenantId]);
}
