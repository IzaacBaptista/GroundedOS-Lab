import { Injectable } from "@nestjs/common";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type AuthUser = {
  userId: string;
  username: string;
  roles: string[];
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
  private readonly revokedTokenHashes = new Map<string, number>();

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

  refreshAccessToken(
    refreshToken: string
  ): { accessToken: string; expiresIn: number; user: AuthUser } | null {
    this.pruneRevokedTokens();

    if (this.isTokenRevoked(refreshToken)) {
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

    const expiresIn = Math.floor(this.tokenExpiryMs / 1000);
    const accessClaims: TokenClaims = {
      sub: claims.sub,
      username: claims.username,
      roles: claims.roles,
      tokenType: "access",
      jti: randomUUID(),
      iat: nowSeconds,
      exp: nowSeconds + expiresIn,
    };

    return {
      accessToken: this.signToken(accessClaims),
      expiresIn,
      user: {
        userId: accessClaims.sub,
        username: accessClaims.username,
        roles: accessClaims.roles,
      },
    };
  }

  verifyAccessToken(token: string): AuthUser | null {
    this.pruneRevokedTokens();

    if (this.isTokenRevoked(token)) {
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

  revokeToken(token: string): boolean {
    const claims = this.parseTokenClaims(token);
    if (!claims || !Number.isFinite(claims.exp)) {
      return false;
    }

    const expiresAtMs = claims.exp * 1000;
    if (expiresAtMs <= Date.now()) {
      return false;
    }

    this.revokedTokenHashes.set(hashToken(token), expiresAtMs);
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

  private isTokenRevoked(token: string): boolean {
    const revokedUntil = this.revokedTokenHashes.get(hashToken(token));
    return typeof revokedUntil === "number" && revokedUntil > Date.now();
  }

  private pruneRevokedTokens(): void {
    const now = Date.now();
    for (const [tokenHash, expiresAt] of this.revokedTokenHashes.entries()) {
      if (expiresAt <= now) {
        this.revokedTokenHashes.delete(tokenHash);
      }
    }
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
