import "reflect-metadata";
import "./config/register-env";
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

  fastify.addHook("preHandler", async (request, reply) => {
    const authEnforcementEnabled =
      String(process.env.AUTH_ENFORCEMENT ?? "false").toLowerCase() !== "false";

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

    if (!token) {
      reply.status(401).send({
        error: {
          message: "Authentication required.",
        },
      });
      return;
    }

    const user = await authService.verifyAccessToken(token);
    if (!user) {
      reply.status(401).send({
        error: {
          message: "Invalid or expired token.",
        },
      });
      return;
    }

    if (path.startsWith("/admin") && !user.roles.includes("admin")) {
      reply.status(403).send({
        error: {
          message: "Admin role required.",
        },
      });
      return;
    }

    if (path.startsWith("/lab")) {
      const allowedLabRoles = parseAllowedLabRoles(process.env.ALLOWED_LAB_ROLES);
      const hasLabRole = user.roles.some((role) => allowedLabRoles.includes(role));

      if (!hasLabRole) {
        reply.status(403).send({
          error: {
            message: `Lab Mode features require one of: ${allowedLabRoles.join(", ")}.`,
          },
        });
        return;
      }
    }

    (request as unknown as { user?: unknown }).user = user;
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

function parseAllowedLabRoles(value: string | undefined): string[] {
  const parsed = (value ?? "user,admin,power-user")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length > 0 ? parsed : ["admin"];
}

if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const app = await createApiServer();

  await app.listen({ port, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`GroundedOS API listening on http://localhost:${port}`);
}
