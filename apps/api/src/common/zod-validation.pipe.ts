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

// Re-use the Zod schema type already available through @groundedos/core
// without creating a hard dependency on the zod package in this workspace member.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZodSchema = { safeParse: (input: unknown) => any };

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly contractName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly schema: AnyZodSchema
  ) {}

  transform(value: unknown): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return validateApiInput<T>(this.contractName, this.schema as any, value);
  }
}

export { ZodValidationError };

