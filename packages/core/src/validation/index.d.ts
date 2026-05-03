/**
 * Runtime validation utilities for GroundedOS Lab contract types.
 *
 * Every object that crosses a package boundary must pass through one of these
 * validators before being used. A ContractViolationError is thrown on failure,
 * carrying the contract name, field path, and the actual value received.
 */
import { type ZodTypeAny } from "zod";
export declare class ContractViolationError extends Error {
    readonly contract: string;
    readonly field: string;
    readonly received: unknown;
    constructor(contract: string, field: string, received: unknown, message?: string);
}
import type { NormalizedDocument, DocumentSection } from "../types/document";
export declare const validateNormalizedDocument: (input: unknown) => NormalizedDocument;
export declare const validateDocumentSection: (input: unknown) => DocumentSection;
export declare const validateRetrievalChunk: (input: unknown) => unknown;
export declare const validateEmbeddedChunk: (input: unknown) => unknown;
export declare const validateVectorSearchResult: (input: unknown) => unknown;
export declare const validateRagAskResponse: (input: unknown) => unknown;
export declare const validateProcessedQuery: (input: unknown) => unknown;
export declare function validateArray<T>(contractName: string, schema: ZodTypeAny, input: unknown): T[];
export declare function validateRetrievalChunks(input: unknown): unknown[];
export declare function validateEmbeddedChunks(input: unknown): unknown[];
export declare function validateVectorSearchResults(input: unknown): unknown[];
