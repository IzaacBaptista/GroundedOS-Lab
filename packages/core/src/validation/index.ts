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
