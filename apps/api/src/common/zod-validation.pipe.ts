/**
 * Factory for creating NestJS pipes backed by Zod schemas.
 *
 * Usage:
 * ```ts
 * @Post('execute')
 * async execute(
 *   @Body(new ZodValidationPipe('AgentExecuteRequest', AgentExecuteRequestSchema)) body: AgentExecuteRequest
 * ) { ... }
 * ```
 *
 * When validation fails the pipe throws a {@link ZodValidationError}, which the
 * global {@link ApiExceptionFilter} maps to an HTTP 400 response with structured
 * field-level errors.
 */

import { Injectable, PipeTransform } from "@nestjs/common";
import { ZodValidationError, validateApiInput } from "@groundedos/core";
import type { ZodTypeAny } from "zod";

@Injectable()
export class ZodValidationPipe<TSchema extends ZodTypeAny>
  implements PipeTransform<unknown, unknown>
{
  constructor(
    private readonly contractName: string,
    private readonly schema: TSchema
  ) {}

  transform(value: unknown): unknown {
    return validateApiInput(this.contractName, this.schema, value);
  }
}

export { ZodValidationError };

