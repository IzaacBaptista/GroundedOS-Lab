import { createHash } from "node:crypto";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

export type StoredApiKey = {
  id: string;
  keyHash: string;
  keyPrefix: string;
  label?: string;
  userId: string;
  username: string;
  roles: string[];
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
};

export interface ApiKeyStore {
  create(record: StoredApiKey): Promise<void>;
  getByHash(keyHash: string): Promise<StoredApiKey | null>;
  list(): Promise<StoredApiKey[]>;
  revokeById(id: string): Promise<boolean>;
}

export function createApiKeyStore(): ApiKeyStore {
  const backend = (process.env.API_KEY_BACKEND ?? "memory").trim().toLowerCase();

  if (backend === "redis") {
    return new OptionalRedisApiKeyStore();
  }

  return new InMemoryApiKeyStore();
}

export function hashApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly byId = new Map<string, StoredApiKey>();
  private readonly byHash = new Map<string, string>();

  async create(record: StoredApiKey): Promise<void> {
    this.byId.set(record.id, record);
    this.byHash.set(record.keyHash, record.id);
  }

  async getByHash(keyHash: string): Promise<StoredApiKey | null> {
    const id = this.byHash.get(keyHash);
    if (!id) {
      return null;
    }

    return this.byId.get(id) ?? null;
  }

  async list(): Promise<StoredApiKey[]> {
    return Array.from(this.byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeById(id: string): Promise<boolean> {
    const current = this.byId.get(id);
    if (!current || current.revokedAt) {
      return false;
    }

    const revoked = {
      ...current,
      revokedAt: new Date().toISOString(),
    };
    this.byId.set(id, revoked);
    this.byHash.delete(current.keyHash);
    return true;
  }
}

class OptionalRedisApiKeyStore implements ApiKeyStore {
  private readonly fallback = new InMemoryApiKeyStore();
  private readonly byIdKey = "auth:api_keys:by_id";
  private readonly byHashKey = "auth:api_keys:by_hash";
  private client: RedisClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private disabled = false;

  async create(record: StoredApiKey): Promise<void> {
    const client = await this.getClient();
    if (!client) {
      await this.fallback.create(record);
      return;
    }

    try {
      await client.hSet(this.byIdKey, record.id, JSON.stringify(record));
      await client.hSet(this.byHashKey, record.keyHash, record.id);
    } catch {
      this.disabled = true;
      await this.fallback.create(record);
    }
  }

  async getByHash(keyHash: string): Promise<StoredApiKey | null> {
    const client = await this.getClient();
    if (!client) {
      return this.fallback.getByHash(keyHash);
    }

    try {
      const id = await client.hGet(this.byHashKey, keyHash);
      if (!id) {
        return null;
      }

      const payload = await client.hGet(this.byIdKey, id);
      return parseStoredApiKey(payload ?? null);
    } catch {
      this.disabled = true;
      return this.fallback.getByHash(keyHash);
    }
  }

  async list(): Promise<StoredApiKey[]> {
    const client = await this.getClient();
    if (!client) {
      return this.fallback.list();
    }

    try {
      const values = await client.hVals(this.byIdKey);
      return values
        .map((value) => parseStoredApiKey(value))
        .filter((record): record is StoredApiKey => Boolean(record))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      this.disabled = true;
      return this.fallback.list();
    }
  }

  async revokeById(id: string): Promise<boolean> {
    const client = await this.getClient();
    if (!client) {
      return this.fallback.revokeById(id);
    }

    try {
      const payload = await client.hGet(this.byIdKey, id);
      const current = parseStoredApiKey(payload ?? null);

      if (!current || current.revokedAt) {
        return false;
      }

      const revoked = {
        ...current,
        revokedAt: new Date().toISOString(),
      };

      await client.hSet(this.byIdKey, id, JSON.stringify(revoked));
      await client.hDel(this.byHashKey, current.keyHash);
      return true;
    } catch {
      this.disabled = true;
      return this.fallback.revokeById(id);
    }
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
          connectTimeout: parsePositiveInteger(process.env.API_KEY_REDIS_CONNECT_TIMEOUT_MS, 250),
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

function parseStoredApiKey(value: string | null): StoredApiKey | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredApiKey>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.keyHash !== "string" ||
      typeof parsed.keyPrefix !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      !Array.isArray(parsed.roles) ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      keyHash: parsed.keyHash,
      keyPrefix: parsed.keyPrefix,
      label: typeof parsed.label === "string" ? parsed.label : undefined,
      userId: parsed.userId,
      username: parsed.username,
      roles: parsed.roles.filter((role): role is string => typeof role === "string"),
      createdAt: parsed.createdAt,
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : undefined,
      revokedAt: typeof parsed.revokedAt === "string" ? parsed.revokedAt : undefined,
    };
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}
