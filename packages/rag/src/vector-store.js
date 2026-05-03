const ERROR_PREFIX = "[rag/vector-store]";
const DEFAULT_TOP_K = 5;
export class InMemoryVectorStore {
    chunksById = new Map();
    dimensions;
    get size() {
        return this.chunksById.size;
    }
    insert(chunks) {
        if (!Array.isArray(chunks)) {
            throw new Error(`${ERROR_PREFIX} insert expects an array of embedded chunks.`);
        }
        let nextDimensions = this.dimensions;
        for (const chunk of chunks) {
            nextDimensions = this.validateChunk(chunk, nextDimensions);
        }
        this.dimensions = nextDimensions;
        for (const chunk of chunks) {
            this.chunksById.set(chunk.id, chunk);
        }
    }
    search(query) {
        if (!query) {
            throw new Error(`${ERROR_PREFIX} search query is required.`);
        }
        const topK = query.topK ?? DEFAULT_TOP_K;
        validateVector(query.embedding, "query embedding");
        validateTopK(topK);
        if (this.dimensions !== undefined && query.embedding.length !== this.dimensions) {
            throw new Error(`${ERROR_PREFIX} query embedding has ${query.embedding.length} dimensions; expected ${this.dimensions}.`);
        }
        return Array.from(this.chunksById.values())
            .filter((chunk) => matchesFilter(chunk, query.filter))
            .map((chunk) => ({
            chunk,
            score: cosineSimilarity(query.embedding, chunk.embedding),
        }))
            .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }
            return left.chunk.id.localeCompare(right.chunk.id);
        })
            .slice(0, topK);
    }
    clear() {
        this.chunksById.clear();
        this.dimensions = undefined;
    }
    validateChunk(chunk, expectedDimensions) {
        if (!chunk || typeof chunk.id !== "string" || chunk.id.trim().length === 0) {
            throw new Error(`${ERROR_PREFIX} chunk id must not be empty.`);
        }
        validateVector(chunk.embedding, `embedding for chunk "${chunk.id}"`);
        if (chunk.embedding.length !== chunk.embeddingMetadata.dimensions) {
            throw new Error(`${ERROR_PREFIX} chunk "${chunk.id}" embedding has ${chunk.embedding.length} dimensions; expected ${chunk.embeddingMetadata.dimensions}.`);
        }
        if (expectedDimensions === undefined) {
            return chunk.embedding.length;
        }
        if (chunk.embedding.length !== expectedDimensions) {
            throw new Error(`${ERROR_PREFIX} chunk "${chunk.id}" embedding has ${chunk.embedding.length} dimensions; expected ${expectedDimensions}.`);
        }
        return expectedDimensions;
    }
}
function validateVector(vector, label) {
    if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error(`${ERROR_PREFIX} ${label} must be a non-empty vector.`);
    }
    if (vector.some((value) => !Number.isFinite(value))) {
        throw new Error(`${ERROR_PREFIX} ${label} contains a non-finite value.`);
    }
}
function validateTopK(topK) {
    if (!Number.isInteger(topK) || topK <= 0) {
        throw new Error(`${ERROR_PREFIX} topK must be a positive integer.`);
    }
}
function cosineSimilarity(left, right) {
    let dotProduct = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index] ?? 0;
        const rightValue = right[index] ?? 0;
        dotProduct += leftValue * rightValue;
        leftMagnitude += leftValue * leftValue;
        rightMagnitude += rightValue * rightValue;
    }
    if (leftMagnitude === 0 || rightMagnitude === 0) {
        return 0;
    }
    return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
function matchesFilter(chunk, filter) {
    if (!filter) {
        return true;
    }
    const searchable = buildSearchableMetadata(chunk);
    return Object.entries(filter).every(([key, expectedValue]) => {
        return searchable[key] === expectedValue;
    });
}
function buildSearchableMetadata(chunk) {
    return {
        id: chunk.id,
        documentId: chunk.documentId,
        sectionId: chunk.sectionId,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        documentTitle: chunk.metadata.documentTitle,
        modality: chunk.metadata.modality,
        sectionHeading: chunk.metadata.sectionHeading,
        page: chunk.metadata.page,
        sourceType: chunk.metadata.sourceType,
        originalFilename: chunk.metadata.originalFilename,
        chunkIndex: chunk.metadata.chunkIndex,
        sectionChunkIndex: chunk.metadata.sectionChunkIndex,
        offsetBasis: chunk.metadata.offsetBasis,
        embeddingProvider: chunk.embeddingMetadata.provider,
        embeddingDimensions: chunk.embeddingMetadata.dimensions,
    };
}
//# sourceMappingURL=vector-store.js.map