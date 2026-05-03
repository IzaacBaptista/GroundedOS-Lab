import { Pool } from "pg";

export type RefreshSessionRecord = {
  refreshJti: string;
  userId: string;
  username: string;
  roles: string[];
  expiresAt: string;
};

export interface AuthSessionStore {
  createRefreshSession(input: RefreshSessionRecord): Promise<void>;
  consumeRefreshSession(refreshJti: string, userId: string): Promise<boolean>;
  revokeRefreshSession(refreshJti: string): Promise<boolean>;
}

export function createAuthSessionStore(): AuthSessionStore {
  const backend = (process.env.AUTH_SESSION_BACKEND ?? "memory").trim().toLowerCase();

  if (backend === "postgres") {
    return new OptionalPostgresAuthSessionStore();
  }

  return new InMemoryAuthSessionStore();
}

class InMemoryAuthSessionStore implements AuthSessionStore {
  private readonly sessions = new Map<string, RefreshSessionRecord>();
  private readonly pruneTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Prune expired sessions every 5 minutes so the map does not grow
    // unbounded in long-running processes.
    this.pruneTimer = setInterval(() => this.pruneExpired(), 5 * 60 * 1000);
    // Allow the process to exit even if this timer is still pending.
    this.pruneTimer.unref?.();
  }

  async createRefreshSession(input: RefreshSessionRecord): Promise<void> {
    this.sessions.set(input.refreshJti, { ...input });
  }

  async consumeRefreshSession(refreshJti: string, userId: string): Promise<boolean> {
    const current = this.sessions.get(refreshJti);
    if (!current) {
      return false;
    }

    if (current.userId !== userId) {
      return false;
    }

    const expiresAt = Date.parse(current.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      this.sessions.delete(refreshJti);
      return false;
    }

    // Delete on consume — single-use tokens should not remain in the map.
    this.sessions.delete(refreshJti);
    return true;
  }

  async revokeRefreshSession(refreshJti: string): Promise<boolean> {
    if (!this.sessions.has(refreshJti)) {
      return false;
    }

    this.sessions.delete(refreshJti);
    return true;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [jti, session] of this.sessions) {
      const expiresAt = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        this.sessions.delete(jti);
      }
    }
  }
}

class OptionalPostgresAuthSessionStore implements AuthSessionStore {
  private readonly fallback = new InMemoryAuthSessionStore();
  private pool: Pool | null = null;
  private initPromise: Promise<void> | null = null;
  private disabled = false;

  async createRefreshSession(input: RefreshSessionRecord): Promise<void> {
    const pool = await this.getPool();
    if (!pool) {
      await this.fallback.createRefreshSession(input);
      return;
    }

    try {
      await pool.query(
        `
          INSERT INTO user_sessions (
            refresh_jti,
            user_id,
            username,
            roles,
            expires_at,
            revoked_at,
            created_at
          )
          VALUES ($1, $2, $3, $4::TEXT[], $5::timestamptz, NULL, NOW())
          ON CONFLICT (refresh_jti)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            username = EXCLUDED.username,
            roles = EXCLUDED.roles,
            expires_at = EXCLUDED.expires_at,
            revoked_at = NULL,
            created_at = NOW()
        `,
        [input.refreshJti, input.userId, input.username, input.roles, input.expiresAt]
      );
    } catch {
      this.disabled = true;
      await this.fallback.createRefreshSession(input);
    }
  }

  async consumeRefreshSession(refreshJti: string, userId: string): Promise<boolean> {
    const pool = await this.getPool();
    if (!pool) {
      return this.fallback.consumeRefreshSession(refreshJti, userId);
    }

    try {
      const result = await pool.query(
        `
          UPDATE user_sessions
          SET revoked_at = NOW()
          WHERE refresh_jti = $1
            AND user_id = $2
            AND revoked_at IS NULL
            AND expires_at > NOW()
          RETURNING refresh_jti
        `,
        [refreshJti, userId]
      );

      return (result.rowCount ?? 0) > 0;
    } catch {
      this.disabled = true;
      return this.fallback.consumeRefreshSession(refreshJti, userId);
    }
  }

  async revokeRefreshSession(refreshJti: string): Promise<boolean> {
    const pool = await this.getPool();
    if (!pool) {
      return this.fallback.revokeRefreshSession(refreshJti);
    }

    try {
      const result = await pool.query(
        `
          UPDATE user_sessions
          SET revoked_at = NOW()
          WHERE refresh_jti = $1
            AND revoked_at IS NULL
          RETURNING refresh_jti
        `,
        [refreshJti]
      );

      return (result.rowCount ?? 0) > 0;
    } catch {
      this.disabled = true;
      return this.fallback.revokeRefreshSession(refreshJti);
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
  }

  private async ensureSchema(): Promise<void> {
    const pool = this.pool;
    if (!pool) {
      return;
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        refresh_jti TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        roles TEXT[] NOT NULL DEFAULT ARRAY['user']::TEXT[],
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id)`
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at)`
    );

    // Remove sessions expired more than 7 days ago to prevent unbounded table growth.
    await pool.query(`
      DELETE FROM user_sessions
      WHERE expires_at < NOW() - INTERVAL '7 days'
    `);
  }
}
