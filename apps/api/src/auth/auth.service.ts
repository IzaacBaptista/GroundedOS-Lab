import { Injectable } from "@nestjs/common";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createApiKeyStore,
  hashApiKey,
  type StoredApiKey,
  type ApiKeyStore,
} from "./api-key-store";
import {
  createTokenRevocationStore,
  type TokenRevocationStore,
} from "./revocation-store";

export type AuthUser = {
  userId: string;
  username: string;
  roles: string[];
};

export type ApiKeySummary = {
  id: string;
  keyPrefix: string;
  label?: string;
  userId: string;
  username: string;
  roles: string[];
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
};

export type CreatedApiKey = {
  key: string;
  summary: ApiKeySummary;
};

type TokenClaims = {
  sub: string;
  username: string;
  roles: string[];
  tokenType: "access" | "refresh";
  jti: string;
  iat: number;
  exp: number;
};

@Injectable()
export class AuthService {
  private readonly jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-in-production-immediately";
  private readonly tokenExpiryMs = parseDurationToMs(process.env.JWT_EXPIRY ?? "24h", 24 * 60 * 60 * 1000);
  private readonly refreshTokenExpiryMs = parseDurationToMs(
    process.env.JWT_REFRESH_EXPIRY ?? "30d",
    30 * 24 * 60 * 60 * 1000
  );
  private readonly adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  private readonly adminPassword = process.env.ADMIN_PASSWORD ?? "admin-password";
  private readonly revocationStore: TokenRevocationStore = createTokenRevocationStore();
  private readonly apiKeyStore: ApiKeyStore = createApiKeyStore();
  private readonly apiKeyPrefix = (process.env.API_KEY_PREFIX ?? "gdos").trim() || "gdos";
  private readonly apiKeyTtlMs = parseDurationToMs(process.env.API_KEY_TTL ?? "90d", 90 * 24 * 60 * 60 * 1000);

  login(
    username: string,
    password: string
  ): { accessToken: string; refreshToken: string; expiresIn: number; user: AuthUser } | null {
    if (username !== this.adminUsername || password !== this.adminPassword) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresIn = Math.floor(this.tokenExpiryMs / 1000);
    const accessClaims: TokenClaims = {
      sub: "user-admin",
      username,
      roles: ["admin", "user"],
      tokenType: "access",
      jti: randomUUID(),
      iat: nowSeconds,
      exp: nowSeconds + expiresIn,
    };
    const refreshClaims: TokenClaims = {
      ...accessClaims,
      tokenType: "refresh",
      jti: randomUUID(),
      exp: nowSeconds + Math.floor(this.refreshTokenExpiryMs / 1000),
    };

    return {
      accessToken: this.signToken(accessClaims),
      refreshToken: this.signToken(refreshClaims),
      expiresIn,
      user: {
        userId: accessClaims.sub,
        username: accessClaims.username,
        roles: accessClaims.roles,
      },
    };
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user: AuthUser } | null> {
    if (await this.isTokenRevoked(refreshToken)) {
      return null;
    }

    const claims = this.parseTokenClaims(refreshToken);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!claims || claims.tokenType !== "refresh") {
      return null;
    }

    if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) {
      return null;
    }

    // Rotate refresh token: the incoming one is single-use.
    await this.revokeToken(refreshToken);

    const expiresIn = Math.floor(this.tokenExpiryMs / 1000);
    const refreshExpiresIn = Math.floor(this.refreshTokenExpiryMs / 1000);
    const accessClaims: TokenClaims = {
      sub: claims.sub,
      username: claims.username,
      roles: claims.roles,
      tokenType: "access",
      jti: randomUUID(),
      iat: nowSeconds,
      exp: nowSeconds + expiresIn,
    };
    const nextRefreshClaims: TokenClaims = {
      sub: claims.sub,
      username: claims.username,
      roles: claims.roles,
      tokenType: "refresh",
      jti: randomUUID(),
      iat: nowSeconds,
      exp: nowSeconds + refreshExpiresIn,
    };

    return {
      accessToken: this.signToken(accessClaims),
      refreshToken: this.signToken(nextRefreshClaims),
      expiresIn,
      user: {
        userId: accessClaims.sub,
        username: accessClaims.username,
        roles: accessClaims.roles,
      },
    };
  }

  async verifyAccessToken(token: string): Promise<AuthUser | null> {
    if (await this.isTokenRevoked(token)) {
      return null;
    }

    const claims = this.parseTokenClaims(token);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!claims || claims.tokenType !== "access") {
      return null;
    }

    if (!claims.sub || !claims.username || !Array.isArray(claims.roles)) {
      return null;
    }

    if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) {
      return null;
    }

    return {
      userId: claims.sub,
      username: claims.username,
      roles: claims.roles,
    };
  }

  async verifyApiKey(apiKey: string): Promise<AuthUser | null> {
    const value = apiKey.trim();
    if (!value) {
      return null;
    }

    const current = await this.apiKeyStore.getByHash(hashApiKey(value));
    if (!current || current.revokedAt) {
      return null;
    }

    if (isExpired(current.expiresAt)) {
      return null;
    }

    return {
      userId: current.userId,
      username: current.username,
      roles: current.roles,
    };
  }

  async createApiKey(input: {
    label?: string;
    user: AuthUser;
  }): Promise<CreatedApiKey> {
    const id = randomUUID();
    const secret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const key = `${this.apiKeyPrefix}_${id.slice(0, 8)}.${secret}`;
    const keyPrefix = key.slice(0, Math.min(18, key.length));
    const createdAt = new Date().toISOString();
    const expiresAt = this.apiKeyTtlMs > 0 ? new Date(Date.now() + this.apiKeyTtlMs).toISOString() : undefined;
    const record: StoredApiKey = {
      id,
      keyHash: hashApiKey(key),
      keyPrefix,
      label: normalizeOptionalLabel(input.label),
      userId: input.user.userId,
      username: input.user.username,
      roles: input.user.roles,
      createdAt,
      expiresAt,
    };

    await this.apiKeyStore.create(record);

    return {
      key,
      summary: toApiKeySummary(record),
    };
  }

  async listApiKeys(): Promise<ApiKeySummary[]> {
    const records = await this.apiKeyStore.list();
    return records.map((record) => toApiKeySummary(record));
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const normalized = id.trim();
    if (!normalized) {
      return false;
    }

    return this.apiKeyStore.revokeById(normalized);
  }

  async rotateApiKey(id: string): Promise<CreatedApiKey | null> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      return null;
    }

    const keys = await this.apiKeyStore.list();
    const current = keys.find((key) => key.id === normalizedId && !key.revokedAt);

    if (!current || isExpired(current.expiresAt)) {
      return null;
    }

    const revoked = await this.apiKeyStore.revokeById(normalizedId);
    if (!revoked) {
      return null;
    }

    return this.createApiKey({
      label: current.label,
      user: {
        userId: current.userId,
        username: current.username,
        roles: current.roles,
      },
    });
  }

  async revokeToken(token: string): Promise<boolean> {
    const claims = this.parseTokenClaims(token);
    if (!claims || !Number.isFinite(claims.exp)) {
      return false;
    }

    const expiresAtMs = claims.exp * 1000;
    if (expiresAtMs <= Date.now()) {
      return false;
    }

    await this.revocationStore.revoke(hashToken(token), expiresAtMs);
    return true;
  }

  private signToken(claims: TokenClaims): string {
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = toBase64Url(Buffer.from(JSON.stringify(header), "utf8"));
    const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(claims), "utf8"));
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = toBase64Url(createHmac("sha256", this.jwtSecret).update(data).digest());
    return `${data}.${signature}`;
  }

  private parseTokenClaims(token: string): TokenClaims | null {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = toBase64Url(
      createHmac("sha256", this.jwtSecret).update(data).digest()
    );

    if (!safeEqual(encodedSignature, expectedSignature)) {
      return null;
    }

    try {
      const payloadJson = fromBase64Url(encodedPayload).toString("utf8");
      return JSON.parse(payloadJson) as TokenClaims;
    } catch {
      return null;
    }
  }

  private async isTokenRevoked(token: string): Promise<boolean> {
    return this.revocationStore.isRevoked(hashToken(token));
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseDurationToMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/i.exec(value.trim());
  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();

  const multiplierByUnit: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (multiplierByUnit[unit] ?? 1);
}

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function toApiKeySummary(record: StoredApiKey): ApiKeySummary {
  return {
    id: record.id,
    keyPrefix: record.keyPrefix,
    label: record.label,
    userId: record.userId,
    username: record.username,
    roles: record.roles,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
  };
}

function normalizeOptionalLabel(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) {
    return false;
  }

  const epoch = Date.parse(expiresAt);
  return Number.isFinite(epoch) && epoch <= Date.now();
}
