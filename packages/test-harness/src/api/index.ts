import { createHmac, createHash } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach } from "vitest";
import { createApiServer } from "../../../../apps/api/src/server";

const activeServers: NestFastifyApplication[] = [];
const activeTempDirs: string[] = [];
let teardownRegistered = false;

export interface CreateTestServerOptions {
  indexDir?: string;
}

export async function createTestServer(
  opts: CreateTestServerOptions = {}
): Promise<NestFastifyApplication> {
  registerTeardown();
  const server = await createApiServer({ indexDir: opts.indexDir });
  activeServers.push(server);
  return server;
}

export async function createTempDir(prefix = "groundedos-test-harness-"): Promise<string> {
  registerTeardown();
  const dir = await mkdtemp(join(tmpdir(), prefix));
  activeTempDirs.push(dir);
  return dir;
}

export interface CreateTestTokenInput {
  sub?: string;
  username?: string;
  roles?: string[];
  tokenType?: "access" | "refresh";
  expiresInSeconds?: number;
  issuedAtSeconds?: number;
}

export function createTestToken(input: CreateTestTokenInput = {}): string {
  const nowSeconds = input.issuedAtSeconds ?? Math.floor(Date.now() / 1000);
  const payload = {
    sub: input.sub ?? "test-user",
    username: input.username ?? "test-user",
    roles: input.roles ?? ["user"],
    tokenType: input.tokenType ?? "access",
    jti: stableJti(input.sub ?? "test-user", input.roles ?? ["user"]),
    iat: nowSeconds,
    exp: nowSeconds + (input.expiresInSeconds ?? 3600),
  };
  const header = { alg: "HS256", typ: "JWT" as const };
  const encodedHeader = toBase64Url(Buffer.from(JSON.stringify(header), "utf8"));
  const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const data = `${encodedHeader}.${encodedPayload}`;
  const secret = process.env.JWT_SECRET ?? "dev-secret-change-in-production-immediately";
  const signature = toBase64Url(createHmac("sha256", secret).update(data).digest());
  return `${data}.${signature}`;
}

export function makeAuthHeader(token: string): { Authorization: string } {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function registerTeardown(): void {
  if (teardownRegistered) {
    return;
  }

  teardownRegistered = true;
  afterEach(async () => {
    await Promise.all(activeServers.splice(0).map((server) => server.close()));
    await Promise.all(
      activeTempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });
}

function toBase64Url(input: Buffer): string {
  const base64 = input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  let end = base64.length;
  while (end > 0 && base64[end - 1] === "=") {
    end -= 1;
  }
  return base64.slice(0, end);
}

function stableJti(sub: string, roles: string[]): string {
  return createHash("sha256")
    .update(`${sub}|${roles.sort().join(",")}`)
    .digest("hex")
    .slice(0, 24);
}
