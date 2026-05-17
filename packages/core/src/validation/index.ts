/**
 * Runtime validation utilities for GroundedOS Lab contract types.
 *
 * Every object that crosses a package boundary must pass through one of these
 * validators before being used. A ContractViolationError is thrown on failure,
 * carrying the contract name, field path, and the actual value received.
 */

import { z, type ZodTypeAny } from "zod";
import {
  EmbeddedChunkSchema,
  NormalizedDocumentSchema,
  ProcessedQuerySchema,
  RagAskResponseSchema,
  RetrievalChunkSchema,
  VectorSearchResultSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// ContractViolationError
// ---------------------------------------------------------------------------

export class ContractViolationError extends Error {
  readonly contract: string;
  readonly field: string;
  readonly received: unknown;

  constructor(contract: string, field: string, received: unknown, message?: string) {
    super(
      message ??
        `Contract violation in "${contract}": field "${field}" failed validation. Received: ${JSON.stringify(received)}`
    );
    this.name = "ContractViolationError";
    this.contract = contract;
    this.field = field;
    this.received = received;
  }
}

// ---------------------------------------------------------------------------
// Generic validator factory
// ---------------------------------------------------------------------------

function makeValidator<T>(contractName: string, schema: ZodTypeAny) {
  return function validate(input: unknown): T {
    const result = schema.safeParse(input);

    if (result.success) {
      return result.data as T;
    }

    // Take the first issue as the primary violation
    const issue = result.error.issues[0];
    const field = issue ? issue.path.join(".") || "(root)" : "(unknown)";
    const received = issue ? (input as Record<string, unknown>)?.[issue.path[0] as string] : input;

    throw new ContractViolationError(contractName, field, received, issue?.message);
  };
}

// ---------------------------------------------------------------------------
// Per-contract validators
// ---------------------------------------------------------------------------

import type {
  NormalizedDocument,
  DocumentSection,
} from "../types/document";

export const validateNormalizedDocument = makeValidator<NormalizedDocument>(
  "NormalizedDocument",
  NormalizedDocumentSchema
);

export const validateDocumentSection = makeValidator<DocumentSection>(
  "DocumentSection",
  NormalizedDocumentSchema.shape.content.shape.sections.element
);

// RAG types — imported as unknown to avoid circular deps across packages.
// The schemas are defined in core so these validators live here.
export const validateRetrievalChunk = makeValidator<unknown>(
  "RetrievalChunk",
  RetrievalChunkSchema
);

export const validateEmbeddedChunk = makeValidator<unknown>(
  "EmbeddedChunk",
  EmbeddedChunkSchema
);

export const validateVectorSearchResult = makeValidator<unknown>(
  "VectorSearchResult",
  VectorSearchResultSchema
);

export const validateRagAskResponse = makeValidator<unknown>(
  "RagAskResponse",
  RagAskResponseSchema
);

export const validateProcessedQuery = makeValidator<unknown>(
  "ProcessedQuery",
  ProcessedQuerySchema
);

// ---------------------------------------------------------------------------
// Batch validators (validate arrays)
// ---------------------------------------------------------------------------

export function validateArray<T>(
  contractName: string,
  schema: ZodTypeAny,
  input: unknown
): T[] {
  if (!Array.isArray(input)) {
    throw new ContractViolationError(
      contractName,
      "(root)",
      input,
      `Contract violation in "${contractName}": expected an array, got ${typeof input}`
    );
  }

  const validator = makeValidator<T>(contractName, schema);

  return input.map((item, index) => {
    try {
      return validator(item);
    } catch (err) {
      if (err instanceof ContractViolationError) {
        throw new ContractViolationError(
          contractName,
          `[${index}].${err.field}`,
          err.received,
          `${err.message} (at index ${index})`
        );
      }

      throw err;
    }
  });
}

export function validateRetrievalChunks(input: unknown): unknown[] {
  return validateArray("RetrievalChunk", RetrievalChunkSchema, input);
}

export function validateEmbeddedChunks(input: unknown): unknown[] {
  return validateArray("EmbeddedChunk", EmbeddedChunkSchema, input);
}

export function validateVectorSearchResults(input: unknown): unknown[] {
  return validateArray("VectorSearchResult", VectorSearchResultSchema, input);
}

// ---------------------------------------------------------------------------
// ZodValidationError — used by the HTTP validation layer
// ---------------------------------------------------------------------------

/**
 * Thrown when an incoming API request payload fails Zod schema validation.
 *
 * Unlike {@link ContractViolationError}, which surfaces a single primary
 * violation, `ZodValidationError` carries the full list of field-level
 * errors so that callers receive actionable feedback for every failing field
 * in one response.
 */
export class ZodValidationError extends Error {
  readonly validationErrors: Array<{ field: string; message: string }>;

  constructor(errors: Array<{ field: string; message: string }>) {
    super("Validation failed.");
    this.name = "ZodValidationError";
    this.validationErrors = errors;
  }
}

/**
 * Validates `input` against `schema` and returns the parsed, type-safe value.
 *
 * Throws a {@link ZodValidationError} with all field-level issues when
 * validation fails.  Pass the `contractName` string to identify the schema
 * in logs and error messages.
 *
 * The `schema` parameter accepts any Zod schema (ZodTypeAny) without
 * requiring the caller to import directly from `zod`.
 */
export function validateApiInput<TSchema extends ZodTypeAny>(
  _contractName: string,
  schema: TSchema,
  input: unknown
): z.infer<TSchema> {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const errors = result.error.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      const parentPath = issue.path.join(".");

      if (issue.keys.length > 0) {
        return issue.keys.map((key) => ({
          field: parentPath ? `${parentPath}.${key}` : key,
          message: issue.message,
        }));
      }
    }

    return [
      {
        field: issue.path.join(".") || "(root)",
        message: issue.message,
      },
    ];
  });

  throw new ZodValidationError(errors);
}
