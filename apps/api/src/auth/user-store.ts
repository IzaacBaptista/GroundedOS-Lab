import { createHash } from "node:crypto";
import { Pool } from "pg";
import { hashPassword, resolvePasswordHash } from "./password";

export type StoredAuthUser = {
  id: string;
  username: string;
  passwordHash: string;
  roles: string[];
  disabledAt?: string;
  createdAt: string;
  updatedAt: string;
};

export interface AuthUserStore {
  findByUsername(username: string): Promise<StoredAuthUser | null>;
}

export function createAuthUserStore(): AuthUserStore {
  const backend = (process.env.AUTH_USER_BACKEND ?? "memory").trim().toLowerCase();

  if (backend === "postgres") {
    return new OptionalPostgresAuthUserStore();
  }

  return new InMemoryAuthUserStore();
}

class InMemoryAuthUserStore implements AuthUserStore {
  private readonly users = new Map<string, StoredAuthUser>();

  constructor() {
    const admin = createDefaultAdminUser();
    this.users.set(admin.username.toLowerCase(), admin);
  }

  async findByUsername(username: string): Promise<StoredAuthUser | null> {
    const normalized = username.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return this.users.get(normalized) ?? null;
  }
}

class OptionalPostgresAuthUserStore implements AuthUserStore {
  private readonly fallback = new InMemoryAuthUserStore();
  private pool: Pool | null = null;
  private initPromise: Promise<void> | null = null;
  private disabled = false;

  async findByUsername(username: string): Promise<StoredAuthUser | null> {
    const normalized = username.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const pool = await this.getPool();
    if (!pool) {
      return this.fallback.findByUsername(normalized);
    }

    try {
      const result = await pool.query<{
        id: string;
        username: string;
        password_hash: string;
        roles: string[] | null;
        disabled_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `
          SELECT id, username, password_hash, roles, disabled_at, created_at, updated_at
          FROM users
          WHERE LOWER(username) = $1
          LIMIT 1
        `,
        [normalized]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        roles: Array.isArray(row.roles) ? row.roles : ["user"],
        disabledAt: row.disabled_at ? row.disabled_at.toISOString() : undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    } catch {
      this.disabled = true;
      return this.fallback.findByUsername(normalized);
    }
  }

  private async getPool(): Promise<Pool | null> {
    if (this.disabled) {
      return null;
    }

    if (!this.initPromise) {
      this.initPromise = this.initialize().catch(() => {
        this.disabled = true;
      });
    }

    await this.initPromise;
    return this.disabled ? null : this.pool;
  }

  private async initialize(): Promise<void> {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      this.disabled = true;
      return;
    }

    this.pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: Number(process.env.AUTH_DB_CONNECT_TIMEOUT_MS ?? 1000),
    });

    this.pool.on("error", () => {
      this.disabled = true;
    });

    await this.pool.query("SELECT 1");
    await this.ensureSchema();
    await this.ensureAdminUser();
  }

  private async ensureSchema(): Promise<void> {
    const pool = this.pool;
    if (!pool) {
      return;
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        roles TEXT[] NOT NULL DEFAULT ARRAY['user']::TEXT[],
        disabled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async ensureAdminUser(): Promise<void> {
    const pool = this.pool;
    if (!pool) {
      return;
    }

    const admin = createDefaultAdminUser();

    await pool.query(
      `
        INSERT INTO users (id, username, password_hash, roles, created_at, updated_at)
        VALUES ($1, $2, $3, $4::TEXT[], NOW(), NOW())
        ON CONFLICT (username)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          roles = EXCLUDED.roles,
          updated_at = NOW()
      `,
      [admin.id, admin.username, admin.passwordHash, admin.roles]
    );
  }
}

function createDefaultAdminUser(): StoredAuthUser {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim() || "admin";
  const passwordHash = resolvePasswordHash({
    plainText: process.env.ADMIN_PASSWORD,
    hashed: process.env.ADMIN_PASSWORD_HASH,
    fallbackPlainText: "admin-password",
  });
  const now = new Date().toISOString();

  return {
    id: `user-${shortHash(username)}`,
    username,
    passwordHash,
    roles: ["admin", "user"],
    createdAt: now,
    updatedAt: now,
  };
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export { hashPassword };
