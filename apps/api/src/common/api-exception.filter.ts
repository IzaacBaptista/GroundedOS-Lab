import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ApiRequestError } from "../errors";

/**
 * Maps thrown exceptions — including the legacy {@link ApiRequestError} used
 * throughout the RAG service logic — to the JSON error envelope that the
 * existing API contract exposes: `{ error: { message } }`.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const { statusCode, message } = resolveError(exception);

    void reply.status(statusCode).send({
      error: { message },
    });
  }
}

function resolveError(exception: unknown): { statusCode: number; message: string } {
  if (exception instanceof ApiRequestError) {
    return {
      statusCode: exception.statusCode,
      message: exception.message,
    };
  }

  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const message =
      typeof response === "string"
        ? response
        : typeof (response as { message?: unknown }).message === "string"
          ? (response as { message: string }).message
          : exception.message;

    return {
      statusCode: exception.getStatus(),
      message,
    };
  }

  const fastifyError = exception as { statusCode?: number; message?: string };
  const statusCode =
    typeof fastifyError.statusCode === "number" && fastifyError.statusCode >= 400
      ? fastifyError.statusCode
      : HttpStatus.INTERNAL_SERVER_ERROR;

  return {
    statusCode,
    message: fastifyError.message ?? "Unknown API error.",
  };
}
