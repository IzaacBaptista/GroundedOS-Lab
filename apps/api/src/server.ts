import "reflect-metadata";
import "./config/register-env";
import { configureOtel } from "./otel";
configureOtel();
import multipart from "@fastify/multipart";
import { validateRagAskResponse } from "@groundedos/core";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { MULTIPART_LIMITS } from "./common/multipart";
import type { ApiConfig } from "./config/api-config";
import { AuthService } from "./auth/auth.service";
import { createUserRateLimiter } from "./auth/rate-limit-store";
import { AuditService } from "./audit/audit.service";
import {
  ensureApiKeyScopes,
  resolveRequiredApiKeyScopes,
} from "./common/access-control";
import type { AuthenticatedRequestUser } from "./common/auth-context";

const DEFAULT_PORT = 3001;

export type ApiServerOptions = ApiConfig;

/**
 * Creates and fully initialises a NestJS + Fastify application.
 *
 * The returned instance exposes the standard {@link NestFastifyApplication}
 * surface used by the bootstrap entry point (`listen`, `close`, ...) and the
 * Fastify `inject` helper (via `app.getHttpAdapter().getInstance().inject`)
 * used by the integration tests to drive requests without opening a socket.
 */
export async function createApiServer(
  options: ApiServerOptions = {}
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(options),
    adapter,
    {
      logger: false,
      bufferLogs: true,
    }
  );

  // NestJS' platform-fastify pins a nested Fastify version whose types
  // diverge slightly from the top-level fastify. The multipart plugin itself
  // works at runtime against both; cast to keep strict typechecking green.
  await app.register(multipart as unknown as Parameters<typeof app.register>[0], {
    limits: MULTIPART_LIMITS,
  });

  const fastify = app.getHttpAdapter().getInstance();
  const authService = app.get(AuthService);
  const auditService = app.get(AuditService);
  const userRateLimiter = createUserRateLimiter();
  const requestsPerHour = parsePositiveInteger(
    process.env.RATE_LIMIT_REQUESTS_PER_HOUR,
    1000
  );
  const rateLimitWindowMs = 60 * 60 * 1000;

  fastify.addHook("preHandler", async (request, reply) => {
    const authEnforcementEnabled = resolveAuthEnforcementEnabled();

    if (!authEnforcementEnabled) {
      return;
    }

    const path = request.url.split("?")[0] ?? "/";
    const isPublicEndpoint =
      path === "/health" ||
      path === "/status" ||
      path === "/auth/login" ||
      path === "/auth/refresh";

    if (isPublicEndpoint || request.method === "OPTIONS") {
      return;
    }

    const bearerToken = extractBearerToken(request.headers.authorization);
    const cookieToken = extractCookieValue(request.headers.cookie, "groundedos-session");
    const token = bearerToken ?? cookieToken;
    const apiKey = extractApiKey(request.headers["x-api-key"]);
    const requestId = String(request.id);
    const operationPath = request.url.split("?")[0] ?? "/";

    let user = null;

    if (token) {
      user = await authService.verifyAccessToken(token);
      if (!user) {
        await auditService.record({
          action: "access.denied.invalid_token",
          resource: path,
          metadata: {
            method: request.method,
            requestId,
          },
        });
        reply.status(401).send({
          error: {
            message: "Invalid or expired token.",
            errorCode: "UNAUTHORIZED",
            requestId,
          },
        });
        return;
      }
    } else if (apiKey) {
      user = await authService.verifyApiKey(apiKey);
      if (!user) {
        await auditService.record({
          action: "access.denied.invalid_api_key",
          resource: path,
          metadata: {
            method: request.method,
            requestId,
          },
        });
        reply.status(401).send({
          error: {
            message: "Invalid API key.",
            errorCode: "UNAUTHORIZED",
            requestId,
          },
        });
        return;
      }
    } else {
      await auditService.record({
        action: "access.denied.unauthenticated",
        resource: path,
        metadata: {
          method: request.method,
          requestId,
        },
      });
      reply.status(401).send({
        error: {
          message: "Authentication required.",
          errorCode: "UNAUTHORIZED",
          requestId,
        },
      });
      return;
    }

    const requestUser: AuthenticatedRequestUser = {
      ...user,
      requestId,
    };

    if (requestUser.authType === "api_key") {
      const requiredScopes = resolveRequiredApiKeyScopes(request.method, operationPath);
      try {
        ensureApiKeyScopes(requestUser, requiredScopes, `${request.method} ${operationPath}`);
      } catch {
        await auditService.record({
          userId: requestUser.userId,
          username: requestUser.username,
          action: "access.denied.api_key_scope",
          resource: path,
          metadata: {
            tenantId: requestUser.tenantId,
            apiKeyId: requestUser.apiKeyId,
            requiredScopes,
            grantedScopes: requestUser.apiKeyScopes ?? [],
            requestId,
          },
        });
        reply.status(403).send({
          error: {
            message: "API key does not have permission for this operation.",
            errorCode: "FORBIDDEN",
            requestId,
          },
        });
        return;
      }

      await auditService.record({
        userId: requestUser.userId,
        username: requestUser.username,
        action: "auth.api_key.used",
        resource: path,
        metadata: {
          tenantId: requestUser.tenantId,
          apiKeyId: requestUser.apiKeyId,
          scopes: requestUser.apiKeyScopes ?? [],
          method: request.method,
          requestId,
        },
      });
    }

    if (requestsPerHour > 0) {
      const rateLimitResult = await userRateLimiter.consume(
        user.userId,
        requestsPerHour,
        rateLimitWindowMs
      );

      if (!rateLimitResult.allowed) {
        await auditService.record({
          userId: user.userId,
          username: user.username,
          action: "security.rate_limit.exceeded",
          resource: path,
          metadata: {
            method: request.method,
            limit: requestsPerHour,
            retryAfterSeconds: rateLimitResult.retryAfterSeconds,
          },
        });

        reply
          .header("Retry-After", String(rateLimitResult.retryAfterSeconds))
          .header("X-RateLimit-Limit", String(requestsPerHour))
          .header("X-RateLimit-Remaining", String(rateLimitResult.remaining))
          .status(429)
          .send({
            error: {
              message: "Rate limit exceeded.",
              errorCode: "RATE_LIMITED",
              requestId: String(request.id),
            },
          });
        return;
      }

      reply
        .header("X-RateLimit-Limit", String(requestsPerHour))
        .header("X-RateLimit-Remaining", String(rateLimitResult.remaining));
    }

    if (path.startsWith("/admin") && !user.roles.includes("admin")) {
      await auditService.record({
        userId: requestUser.userId,
        username: requestUser.username,
        action: "access.denied.admin_role_required",
        resource: path,
        metadata: {
          tenantId: requestUser.tenantId,
          apiKeyId: requestUser.apiKeyId,
          requestId,
        },
      });
      reply.status(403).send({
        error: {
          message: "Admin role required.",
          errorCode: "FORBIDDEN",
          requestId,
        },
      });
      return;
    }

    if (path.startsWith("/lab")) {
      const allowedLabRoles = parseAllowedLabRoles(process.env.ALLOWED_LAB_ROLES);
      const hasLabRole = user.roles.some((role) => allowedLabRoles.includes(role));

      if (!hasLabRole) {
        await auditService.record({
          userId: requestUser.userId,
          username: requestUser.username,
          action: "access.denied.lab_role_required",
          resource: path,
          metadata: {
            tenantId: requestUser.tenantId,
            apiKeyId: requestUser.apiKeyId,
            requestId,
          },
        });
        reply.status(403).send({
          error: {
            message: `Lab Mode features require one of: ${allowedLabRoles.join(", ")}.`,
            errorCode: "FORBIDDEN",
            requestId,
          },
        });
        return;
      }
    }

    (request as unknown as { user?: unknown }).user = requestUser;
  });

  fastify.addHook("onSend", (request, reply, payload, done) => {
    const shouldValidate =
      request.url.startsWith("/rag/ask") && reply.statusCode >= 200 && reply.statusCode < 300;

    if (!shouldValidate) {
      done(null, payload);
      return;
    }

    try {
      const body =
        typeof payload === "string" ? (JSON.parse(payload) as unknown) : (payload as unknown);
      validateRagAskResponse(body);
      done(null, payload);
    } catch (error) {
      done(error as Error);
    }
  });

  app.useGlobalFilters(new ApiExceptionFilter());

  await app.init();

  return app;
}

function resolveAuthEnforcementEnabled(): boolean {
  const explicit = process.env.AUTH_ENFORCEMENT;
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit.trim().toLowerCase() !== "false";
  }

  // Default to production (fail-closed) when NODE_ENV is not explicitly set so
  // that environments without a NODE_ENV variable don't accidentally run with
  // auth disabled.
  const nodeEnv = (process.env.NODE_ENV ?? "production").trim().toLowerCase();
  return nodeEnv !== "development" && nodeEnv !== "test";
}

function extractBearerToken(header?: string | string[]): string | null {
  if (!header) {
    return null;
  }

  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

function extractCookieValue(cookieHeader: string | string[] | undefined, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const raw = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  const cookies = raw.split(";").map((item) => item.trim());
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    if (name === key) {
      return rest.join("=") || null;
    }
  }

  return null;
}

function extractApiKey(header: string | string[] | undefined): string | null {
  if (!header) {
    return null;
  }

  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseAllowedLabRoles(value: string | undefined): string[] {
  const parsed = (value ?? "user,admin,power-user")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length > 0 ? parsed : ["admin"];
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const app = await createApiServer();

  await app.listen({ port, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`GroundedOS API listening on http://localhost:${port}`);
}
