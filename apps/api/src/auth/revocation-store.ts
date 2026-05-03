import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

export interface TokenRevocationStore {
  isRevoked(tokenHash: string): Promise<boolean>;
  revoke(tokenHash: string, expiresAtMs: number): Promise<void>;
}

export function createTokenRevocationStore(): TokenRevocationStore {
  const backend = (process.env.AUTH_REVOCATION_BACKEND ?? "memory").trim().toLowerCase();

  if (backend === "redis") {
    return new OptionalRedisTokenRevocationStore();
  }

  return new InMemoryTokenRevocationStore();
}

class InMemoryTokenRevocationStore implements TokenRevocationStore {
  private readonly revokedTokenHashes = new Map<string, number>();

  async isRevoked(tokenHash: string): Promise<boolean> {
    this.pruneExpired();
    const revokedUntil = this.revokedTokenHashes.get(tokenHash);
    return typeof revokedUntil === "number" && revokedUntil > Date.now();
  }

  async revoke(tokenHash: string, expiresAtMs: number): Promise<void> {
    if (expiresAtMs <= Date.now()) {
      return;
    }

    this.revokedTokenHashes.set(tokenHash, expiresAtMs);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [tokenHash, expiresAt] of this.revokedTokenHashes.entries()) {
      if (expiresAt <= now) {
        this.revokedTokenHashes.delete(tokenHash);
      }
    }
  }
}

class OptionalRedisTokenRevocationStore implements TokenRevocationStore {
  private readonly fallback = new InMemoryTokenRevocationStore();
  private client: RedisClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private disabled = false;

  async isRevoked(tokenHash: string): Promise<boolean> {
    const client = await this.getClient();

    if (!client) {
      return this.fallback.isRevoked(tokenHash);
    }

    try {
      const exists = await client.exists(this.keyFor(tokenHash));
      return exists > 0;
    } catch {
      this.disabled = true;
      return this.fallback.isRevoked(tokenHash);
    }
  }

  async revoke(tokenHash: string, expiresAtMs: number): Promise<void> {
    if (expiresAtMs <= Date.now()) {
      return;
    }

    const client = await this.getClient();
    if (!client) {
      await this.fallback.revoke(tokenHash, expiresAtMs);
      return;
    }

    const ttlMs = Math.max(1, expiresAtMs - Date.now());

    try {
      await client.set(this.keyFor(tokenHash), "1", { PX: ttlMs });
    } catch {
      this.disabled = true;
      await this.fallback.revoke(tokenHash, expiresAtMs);
    }
  }

  private keyFor(tokenHash: string): string {
    return `auth:revoked:${tokenHash}`;
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
          connectTimeout: Number(process.env.AUTH_REDIS_CONNECT_TIMEOUT_MS ?? 250),
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
