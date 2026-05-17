import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiRequestError } from "../errors";
import { ZodValidationError } from "./zod-validation.pipe";

/**
 * Maps thrown exceptions — including the legacy {@link ApiRequestError} used
 * throughout the RAG service logic — to the JSON error envelope that the
 * existing API contract exposes.
 *
 * **Error envelope format:**
 * ```json
 * {
 *   "error": {
 *     "message":          "Human-readable description.",
 *     "errorCode":        "VALIDATION_ERROR",
 *     "requestId":        "req-<fastify-id>",
 *     "details":          "(optional extra context)",
 *     "validationErrors": [
 *       { "field": "query", "message": "Required" }
 *     ]
 *   }
 * }
 * ```
 *
 * `errorCode` and `requestId` are always present; `validationErrors` only
 * appears for 400-level Zod errors; `details` is omitted when absent.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const { statusCode, message, errorCode, validationErrors } = resolveError(exception);

    const body: {
      error: {
        message: string;
        errorCode: string;
        requestId: string;
        validationErrors?: Array<{ field: string; message: string }>;
      };
    } = {
      error: {
        message,
        errorCode,
        requestId: String(request.id),
      },
    };

    if (validationErrors && validationErrors.length > 0) {
      body.error.validationErrors = validationErrors;
    }

    void reply.status(statusCode).send(body);
  }
}

// ---------------------------------------------------------------------------
// Error code mapping
// ---------------------------------------------------------------------------

const HTTP_STATUS_ERROR_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_ENTITY",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
};

function errorCodeForStatus(statusCode: number): string {
  return HTTP_STATUS_ERROR_CODES[statusCode] ?? `HTTP_${statusCode}`;
}

// ---------------------------------------------------------------------------
// Exception → { statusCode, message, errorCode, validationErrors }
// ---------------------------------------------------------------------------

function resolveError(exception: unknown): {
  statusCode: number;
  message: string;
  errorCode: string;
  validationErrors?: Array<{ field: string; message: string }>;
} {
  // Zod-validated input errors — always 400 with full field-level detail
  if (exception instanceof ZodValidationError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message,
      errorCode: "VALIDATION_ERROR",
      validationErrors: exception.validationErrors,
    };
  }

  if (exception instanceof ApiRequestError) {
    return {
      statusCode: exception.statusCode,
      message: exception.message,
      errorCode: errorCodeForStatus(exception.statusCode),
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

    const statusCode = exception.getStatus();

    return {
      statusCode,
      message,
      errorCode: errorCodeForStatus(statusCode),
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
    errorCode: errorCodeForStatus(statusCode),
  };
}
