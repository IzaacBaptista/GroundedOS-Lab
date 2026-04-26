import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

export type UserRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export interface UserRateLimiter {
  consume(userId: string, limit: number, windowMs: number): Promise<UserRateLimitResult>;
}

export function createUserRateLimiter(): UserRateLimiter {
  const backend = (process.env.RATE_LIMIT_BACKEND ?? "memory").trim().toLowerCase();

  if (backend === "redis") {
    return new OptionalRedisUserRateLimiter();
  }

  return new InMemoryUserRateLimiter();
}

class InMemoryUserRateLimiter implements UserRateLimiter {
  private readonly windows = new Map<string, { count: number; expiresAtMs: number }>();

  async consume(userId: string, limit: number, windowMs: number): Promise<UserRateLimitResult> {
    const now = Date.now();
    const key = this.keyFor(userId);
    const current = this.windows.get(key);

    if (!current || current.expiresAtMs <= now) {
      const expiresAtMs = now + windowMs;
      this.windows.set(key, { count: 1, expiresAtMs });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    const nextCount = current.count + 1;
    current.count = nextCount;

    const remainingMs = Math.max(0, current.expiresAtMs - now);
    return {
      allowed: nextCount <= limit,
      remaining: Math.max(0, limit - nextCount),
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  private keyFor(userId: string): string {
    return `rate:${userId}`;
  }
}

class OptionalRedisUserRateLimiter implements UserRateLimiter {
  private readonly fallback = new InMemoryUserRateLimiter();
  private client: RedisClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private disabled = false;

  async consume(userId: string, limit: number, windowMs: number): Promise<UserRateLimitResult> {
    const client = await this.getClient();
    if (!client) {
      return this.fallback.consume(userId, limit, windowMs);
    }

    const key = this.keyFor(userId);

    try {
      const nextCount = await client.incr(key);
      if (nextCount === 1) {
        await client.pExpire(key, windowMs);
      }

      const ttlMs = await client.pTTL(key);
      const retryAfterSeconds = Math.max(1, Math.ceil(Math.max(0, ttlMs) / 1000));

      return {
        allowed: nextCount <= limit,
        remaining: Math.max(0, limit - nextCount),
        retryAfterSeconds,
      };
    } catch {
      this.disabled = true;
      return this.fallback.consume(userId, limit, windowMs);
    }
  }

  private keyFor(userId: string): string {
    return `rate:${userId}`;
  }

  private async getClient(): Promise<RedisClient | null> {
    if (this.disabled) {
      return null;
    }

    if (this.client?.isOpen) {
      return this.client;
    }

    if (!this.connectPromise) {
      const client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: Number(process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS ?? 250),
        },
      });

      client.on("error", () => {
        this.disabled = true;
      });

      this.client = client;
      this.connectPromise = client
        .connect()
        .then(() => undefined)
        .catch(() => {
          this.disabled = true;
        });
    }

    await this.connectPromise;
    this.connectPromise = null;

    if (!this.client?.isOpen || this.disabled) {
      return null;
    }

    return this.client;
  }
}