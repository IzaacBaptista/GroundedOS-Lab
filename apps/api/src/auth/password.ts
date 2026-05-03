import { createHash, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "sha256:";

export function hashPassword(value: string): string {
  const pepper = process.env.AUTH_PASSWORD_PEPPER ?? "";
  const normalized = `${value}${pepper}`;
  return `${HASH_PREFIX}${createHash("sha256").update(normalized).digest("hex")}`;
}

export function resolvePasswordHash(params: {
  plainText?: string;
  hashed?: string;
  fallbackPlainText: string;
}): string {
  const providedHashed = typeof params.hashed === "string" ? params.hashed.trim() : "";
  if (providedHashed.length > 0) {
    return providedHashed;
  }

  const plainText =
    typeof params.plainText === "string" && params.plainText.length > 0
      ? params.plainText
      : params.fallbackPlainText;
  return hashPassword(plainText);
}

export function verifyPassword(plainText: string, expectedHash: string): boolean {
  const normalizedExpected = expectedHash.trim();
  if (normalizedExpected.length === 0) {
    return false;
  }

  // Backward-compatible fallback for legacy plain-value records in local environments.
  if (!normalizedExpected.startsWith(HASH_PREFIX)) {
    return safeEqual(normalizedExpected, plainText);
  }

  return safeEqual(normalizedExpected, hashPassword(plainText));
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
