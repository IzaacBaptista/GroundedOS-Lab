import { validateEmbeddedChunks, validateNormalizedDocument, validateRetrievalChunks, validateVectorSearchResults, } from "@groundedos/core";
import { chunkDocument, } from "./chunking";
import { DeterministicEmbeddingProvider, embedChunks, } from "./embeddings";
import { InMemoryVectorStore, } from "./vector-store";
const ERROR_PREFIX = "[rag/retrieval]";
export async function buildRetrievalIndex(document, options = {}) {
    if (!document) {
        throw new Error(`${ERROR_PREFIX} document is required.`);
    }
    validateNormalizedDocument(document);
    const embeddingProvider = options.embeddingProvider ?? new DeterministicEmbeddingProvider();
    const store = options.store ?? new InMemoryVectorStore();
    const chunks = chunkDocument(document, options.chunkOptions);
    validateRetrievalChunks(chunks);
    const embeddedChunks = await embedChunks(chunks, embeddingProvider);
    validateEmbeddedChunks(embeddedChunks);
    store.insert(embeddedChunks);
    return {
        embeddingProvider,
        store,
        embeddedChunks,
    };
}
export async function retrieveFromIndex(index, query, options = {}) {
    const internal = await retrieveInternal(index, query, options);
    return internal.results;
}
export async function retrieveForDevMode(index, query, options = {}) {
    const internal = await retrieveInternal(index, query, options);
    const output = createRetrievalDevOutput(query, internal.results);
    if (internal.hybridMeta) {
        output.hybrid = {
            mode: "hybrid",
            denseWeight: internal.hybridMeta.denseWeight,
            sparseWeight: internal.hybridMeta.sparseWeight,
            candidateCount: internal.hybridMeta.candidateCount,
            candidates: internal.hybridMeta.candidates,
        };
    }
    return output;
}
async function retrieveInternal(index, query, options = {}) {
    validateRetrievalIndex(index);
    if (typeof query !== "string" || query.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} query must not be empty.`);
    }
    const queryEmbedding = await embedQuery(query, index.embeddingProvider);
    const mode = options.mode ?? "dense";
    if (mode !== "dense" && mode !== "hybrid") {
        throw new Error(`${ERROR_PREFIX} mode must be "dense" or "hybrid".`);
    }
    if (mode === "dense") {
        const results = index.store.search({
            embedding: queryEmbedding,
            topK: options.topK,
            filter: options.filter,
        });
        return {
            results: validateVectorSearchResults(results),
        };
    }
    const topK = options.topK ?? 3;
    const denseWeight = resolveDenseWeight(options.hybridDenseWeight);
    const sparseWeight = 1 - denseWeight;
    const candidateTopK = resolveCandidateTopK(options.hybridCandidateTopK, topK);
    const denseCandidates = index.store.search({
        embedding: queryEmbedding,
        topK: candidateTopK,
        filter: options.filter,
    });
    const validatedDenseCandidates = validateVectorSearchResults(denseCandidates);
    if (validatedDenseCandidates.length === 0) {
        return {
            results: [],
            hybridMeta: {
                denseWeight,
                sparseWeight,
                candidateCount: 0,
                candidates: [],
            },
        };
    }
    const scoredCandidates = validatedDenseCandidates.map((candidate, index) => {
        const denseScore = normalizeDenseScore(candidate.score);
        const sparseScore = sparseNgramCosine(query, candidate.chunk.text);
        const combined = denseWeight * denseScore + sparseWeight * sparseScore;
        return {
            ...candidate,
            denseRank: index + 1,
            denseScore: Number(denseScore.toFixed(12)),
            sparseScore: Number(sparseScore.toFixed(12)),
            score: Number(combined.toFixed(12)),
        };
    });
    const sortedCandidates = scoredCandidates
        .sort((left, right) => {
        if (right.score === left.score) {
            return right.chunk.text.length - left.chunk.text.length;
        }
        return right.score - left.score;
    });
    const reranked = sortedCandidates.slice(0, topK);
    return {
        results: reranked,
        hybridMeta: {
            denseWeight,
            sparseWeight,
            candidateCount: validatedDenseCandidates.length,
            candidates: sortedCandidates.map((candidate, index) => ({
                chunkId: candidate.chunk.id,
                sectionId: candidate.chunk.sectionId,
                denseRank: candidate.denseRank,
                hybridRank: index + 1,
                denseScore: candidate.denseScore,
                sparseScore: candidate.sparseScore,
                combinedScore: candidate.score,
            })),
        },
    };
}
export function createRetrievalDevOutput(query, results) {
    if (typeof query !== "string" || query.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} query must not be empty.`);
    }
    if (!Array.isArray(results)) {
        throw new Error(`${ERROR_PREFIX} retrieval results must be an array.`);
    }
    validateVectorSearchResults(results);
    return {
        query: query.trim(),
        resultCount: results.length,
        results: results.map((result, index) => ({
            rank: index + 1,
            chunkId: result.chunk.id,
            documentId: result.chunk.documentId,
            sectionId: result.chunk.sectionId,
            score: result.score,
            text: result.chunk.text,
            source: {
                documentTitle: result.chunk.metadata.documentTitle,
                modality: result.chunk.metadata.modality,
                sourceType: result.chunk.metadata.sourceType,
                originalFilename: result.chunk.metadata.originalFilename,
                sectionHeading: result.chunk.metadata.sectionHeading,
                page: result.chunk.metadata.page,
            },
            offsets: {
                startOffset: result.chunk.startOffset,
                endOffset: result.chunk.endOffset,
                offsetBasis: result.chunk.metadata.offsetBasis,
            },
            embedding: {
                provider: result.chunk.embeddingMetadata.provider,
                dimensions: result.chunk.embeddingMetadata.dimensions,
                model: result.chunk.embeddingMetadata.model,
                normalized: result.chunk.embeddingMetadata.normalized,
            },
        })),
    };
}
function validateRetrievalIndex(index) {
    if (!index) {
        throw new Error(`${ERROR_PREFIX} retrieval index is required.`);
    }
    if (!index.embeddingProvider || typeof index.embeddingProvider.embedTexts !== "function") {
        throw new Error(`${ERROR_PREFIX} retrieval index must include an embedding provider.`);
    }
    if (!index.store || typeof index.store.search !== "function") {
        throw new Error(`${ERROR_PREFIX} retrieval index must include a searchable store.`);
    }
}
async function embedQuery(query, provider) {
    const embeddings = await provider.embedTexts([query]);
    if (!Array.isArray(embeddings) || embeddings.length !== 1) {
        throw new Error(`${ERROR_PREFIX} provider must return exactly one query embedding.`);
    }
    const [embedding] = embeddings;
    if (!Array.isArray(embedding) || embedding.length !== provider.dimensions) {
        throw new Error(`${ERROR_PREFIX} query embedding must have ${provider.dimensions} dimensions.`);
    }
    if (embedding.some((value) => !Number.isFinite(value))) {
        throw new Error(`${ERROR_PREFIX} query embedding contains a non-finite value.`);
    }
    return embedding;
}
function resolveDenseWeight(value) {
    if (value === undefined) {
        return 0.65;
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${ERROR_PREFIX} hybridDenseWeight must be a number between 0 and 1.`);
    }
    return value;
}
function resolveCandidateTopK(value, topK) {
    if (value === undefined) {
        return Math.max(topK * 4, 10);
    }
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${ERROR_PREFIX} hybridCandidateTopK must be a positive integer.`);
    }
    return Math.max(value, topK);
}
function normalizeDenseScore(score) {
    if (!Number.isFinite(score)) {
        return 0;
    }
    if (score >= 0 && score <= 1) {
        return score;
    }
    return Math.max(0, Math.min(1, (score + 1) / 2));
}
function tokenize(text) {
    return text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}
function sparseNgramCosine(query, chunkText) {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) {
        return 0;
    }
    const queryNgrams = buildCharacterNgrams(queryTerms.join(" "));
    const chunkNgrams = buildCharacterNgrams(tokenize(chunkText).join(" "));
    if (queryNgrams.size === 0 || chunkNgrams.size === 0) {
        return 0;
    }
    let overlap = 0;
    for (const ngram of queryNgrams) {
        if (chunkNgrams.has(ngram)) {
            overlap += 1;
        }
    }
    if (overlap === 0) {
        return 0;
    }
    return overlap / Math.sqrt(queryNgrams.size * chunkNgrams.size);
}
function buildCharacterNgrams(text, n = 3) {
    const normalized = text.replace(/\s+/g, "").trim();
    if (normalized.length === 0) {
        return new Set();
    }
    if (normalized.length <= n) {
        return new Set([normalized]);
    }
    const ngrams = new Set();
    for (let index = 0; index <= normalized.length - n; index += 1) {
        ngrams.add(normalized.slice(index, index + n));
    }
    return ngrams;
}
//# sourceMappingURL=retrieval.js.map