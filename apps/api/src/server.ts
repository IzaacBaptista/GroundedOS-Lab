import "reflect-metadata";
import multipart from "@fastify/multipart";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { MULTIPART_LIMITS } from "./common/multipart";
import type { ApiConfig } from "./config/api-config";

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

  app.useGlobalFilters(new ApiExceptionFilter());

  await app.init();

  return app;
}

if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const app = await createApiServer();

  await app.listen({ port, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`GroundedOS API listening on http://localhost:${port}`);
}
