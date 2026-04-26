/**
 * Runtime validation utilities for GroundedOS Lab contract types.
 *
 * Every object that crosses a package boundary must pass through one of these
 * validators before being used. A ContractViolationError is thrown on failure,
 * carrying the contract name, field path, and the actual value received.
 */
import { EmbeddedChunkSchema, NormalizedDocumentSchema, ProcessedQuerySchema, RagAskResponseSchema, RetrievalChunkSchema, VectorSearchResultSchema, } from "./schemas";
// ---------------------------------------------------------------------------
// ContractViolationError
// ---------------------------------------------------------------------------
export class ContractViolationError extends Error {
    contract;
    field;
    received;
    constructor(contract, field, received, message) {
        super(message ??
            `Contract violation in "${contract}": field "${field}" failed validation. Received: ${JSON.stringify(received)}`);
        this.name = "ContractViolationError";
        this.contract = contract;
        this.field = field;
        this.received = received;
    }
}
// ---------------------------------------------------------------------------
// Generic validator factory
// ---------------------------------------------------------------------------
function makeValidator(contractName, schema) {
    return function validate(input) {
        const result = schema.safeParse(input);
        if (result.success) {
            return result.data;
        }
        // Take the first issue as the primary violation
        const issue = result.error.issues[0];
        const field = issue ? issue.path.join(".") || "(root)" : "(unknown)";
        const received = issue ? input?.[issue.path[0]] : input;
        throw new ContractViolationError(contractName, field, received, issue?.message);
    };
}
export const validateNormalizedDocument = makeValidator("NormalizedDocument", NormalizedDocumentSchema);
export const validateDocumentSection = makeValidator("DocumentSection", NormalizedDocumentSchema.shape.content.shape.sections.element);
// RAG types — imported as unknown to avoid circular deps across packages.
// The schemas are defined in core so these validators live here.
export const validateRetrievalChunk = makeValidator("RetrievalChunk", RetrievalChunkSchema);
export const validateEmbeddedChunk = makeValidator("EmbeddedChunk", EmbeddedChunkSchema);
export const validateVectorSearchResult = makeValidator("VectorSearchResult", VectorSearchResultSchema);
export const validateRagAskResponse = makeValidator("RagAskResponse", RagAskResponseSchema);
export const validateProcessedQuery = makeValidator("ProcessedQuery", ProcessedQuerySchema);
// ---------------------------------------------------------------------------
// Batch validators (validate arrays)
// ---------------------------------------------------------------------------
export function validateArray(contractName, schema, input) {
    if (!Array.isArray(input)) {
        throw new ContractViolationError(contractName, "(root)", input, `Contract violation in "${contractName}": expected an array, got ${typeof input}`);
    }
    const validator = makeValidator(contractName, schema);
    return input.map((item, index) => {
        try {
            return validator(item);
        }
        catch (err) {
            if (err instanceof ContractViolationError) {
                throw new ContractViolationError(contractName, `[${index}].${err.field}`, err.received, `${err.message} (at index ${index})`);
            }
            throw err;
        }
    });
}
export function validateRetrievalChunks(input) {
    return validateArray("RetrievalChunk", RetrievalChunkSchema, input);
}
export function validateEmbeddedChunks(input) {
    return validateArray("EmbeddedChunk", EmbeddedChunkSchema, input);
}
export function validateVectorSearchResults(input) {
    return validateArray("VectorSearchResult", VectorSearchResultSchema, input);
}
//# sourceMappingURL=index.js.map