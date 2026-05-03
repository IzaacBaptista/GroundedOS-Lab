import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SHA256_PREFIX = "sha256:";
const SCRYPT_PREFIX = "scrypt:";

// Scrypt cost parameters. N must be a power of 2; 2^14 provides ~100 ms on
// typical hardware and is a widely-recommended baseline for interactive logins.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export function hashPassword(value: string): string {
  const pepper = process.env.AUTH_PASSWORD_PEPPER ?? "";
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(`${value}${pepper}`, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `${SCRYPT_PREFIX}${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${hash.toString("hex")}`;
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

  // Backward-compatible: legacy plain-value records (no prefix).
  if (!normalizedExpected.startsWith(SHA256_PREFIX) && !normalizedExpected.startsWith(SCRYPT_PREFIX)) {
    return safeStringEqual(normalizedExpected, plainText);
  }

  // Backward-compatible: legacy SHA-256 hashes.
  if (normalizedExpected.startsWith(SHA256_PREFIX)) {
    const pepper = process.env.AUTH_PASSWORD_PEPPER ?? "";
    const legacy = `${SHA256_PREFIX}${createHash("sha256").update(`${plainText}${pepper}`).digest("hex")}`;
    return safeStringEqual(normalizedExpected, legacy);
  }

  // Current: scrypt.
  return verifyScrypt(plainText, normalizedExpected.slice(SCRYPT_PREFIX.length));
}

function verifyScrypt(plainText: string, body: string): boolean {
  const parts = body.split(":");
  if (parts.length !== 5) {
    return false;
  }

  const [nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N <= 0 || r <= 0 || p <= 0) {
    return false;
  }

  const pepper = process.env.AUTH_PASSWORD_PEPPER ?? "";
  try {
    const derived = scryptSync(`${plainText}${pepper}`, saltHex, SCRYPT_KEYLEN, { N, r, p });
    const expected = Buffer.from(hashHex, "hex");
    if (derived.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function safeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
