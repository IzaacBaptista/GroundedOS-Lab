import { randomUUID } from "node:crypto";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

export type AuditEvent = {
  id: string;
  timestamp: string;
  userId?: string;
  username?: string;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
};

export type AuditEventInput = Omit<AuditEvent, "id" | "timestamp">;

export type AuditLogQuery = {
  limit?: number;
  userId?: string;
  action?: string;
};

export interface AuditStore {
  append(event: AuditEventInput): Promise<AuditEvent>;
  list(query?: AuditLogQuery): Promise<AuditEvent[]>;
}

export function createAuditStore(): AuditStore {
  const backend = (process.env.AUDIT_LOG_BACKEND ?? "memory").trim().toLowerCase();

  if (backend === "redis") {
    return new OptionalRedisAuditStore();
  }

  return new InMemoryAuditStore();
}

class InMemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];
  private readonly maxEvents = parsePositiveInteger(process.env.AUDIT_LOG_MAX_IN_MEMORY, 5000);

  async append(event: AuditEventInput): Promise<AuditEvent> {
    const entry: AuditEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.events.unshift(entry);
    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }

    return entry;
  }

  async list(query: AuditLogQuery = {}): Promise<AuditEvent[]> {
    const limit = normalizeLimit(query.limit);
    return this.events
      .filter((event) => matchesQuery(event, query))
      .slice(0, limit);
  }
}

class OptionalRedisAuditStore implements AuditStore {
  private readonly fallback = new InMemoryAuditStore();
  private readonly key = "audit:events";
  private readonly maxEvents = parsePositiveInteger(process.env.AUDIT_LOG_MAX_IN_MEMORY, 5000);
  private client: RedisClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private disabled = false;

  async append(event: AuditEventInput): Promise<AuditEvent> {
    const entry: AuditEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    const client = await this.getClient();
    if (!client) {
      await this.fallback.append(event);
      return entry;
    }

    try {
      await client.lPush(this.key, JSON.stringify(entry));
      await client.lTrim(this.key, 0, this.maxEvents - 1);
      return entry;
    } catch {
      this.disabled = true;
      await this.fallback.append(event);
      return entry;
    }
  }

  async list(query: AuditLogQuery = {}): Promise<AuditEvent[]> {
    const limit = normalizeLimit(query.limit);
    const scanLimit = Math.max(limit * 5, 200);

    const client = await this.getClient();
    if (!client) {
      return this.fallback.list({ ...query, limit });
    }

    try {
      const records = await client.lRange(this.key, 0, scanLimit - 1);
      const parsed = records
        .map((record) => parseAuditEvent(record))
        .filter((event): event is AuditEvent => Boolean(event))
        .filter((event) => matchesQuery(event, query))
        .slice(0, limit);
      return parsed;
    } catch {
      this.disabled = true;
      return this.fallback.list({ ...query, limit });
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
          connectTimeout: parsePositiveInteger(process.env.AUDIT_REDIS_CONNECT_TIMEOUT_MS, 250),
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

function parseAuditEvent(input: string): AuditEvent | null {
  try {
    const parsed = JSON.parse(input) as Partial<AuditEvent>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.timestamp !== "string" ||
      typeof parsed.action !== "string"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      timestamp: parsed.timestamp,
      action: parsed.action,
      userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      username: typeof parsed.username === "string" ? parsed.username : undefined,
      resource: typeof parsed.resource === "string" ? parsed.resource : undefined,
      metadata: isRecord(parsed.metadata) ? parsed.metadata : undefined,
    };
  } catch {
    return null;
  }
}

function matchesQuery(event: AuditEvent, query: AuditLogQuery): boolean {
  if (query.userId && event.userId !== query.userId) {
    return false;
  }

  if (query.action && event.action !== query.action) {
    return false;
  }

  return true;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return 100;
  }

  return Math.max(1, Math.min(500, Math.floor(limit ?? 100)));
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
