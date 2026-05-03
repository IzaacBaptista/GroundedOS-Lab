/**
 * @packageDocumentation
 * rag
 *
 * Retrieval-Augmented Generation primitives for GroundedOS Lab.
 */
export { chunkDocument, } from "./chunking";
export { DeterministicEmbeddingProvider, LocalHashEmbeddingsProvider, OpenAIEmbeddingsProvider, OllamaEmbeddingsProvider, createEmbeddingProviderRegistry, embeddingProviderToSemantic, embedChunks, semanticToEmbeddingProvider, } from "./embeddings";
export { InMemoryVectorStore, } from "./vector-store";
export { buildRetrievalIndex, createRetrievalDevOutput, retrieveForDevMode, retrieveFromIndex, } from "./retrieval";
// Query Understanding (Phase 2 — Concept 1)
export { processQuery, rewriteQuery, expandQuery, detectIntent, } from "./query-understanding";
// Semantic Cache (Phase 2 — Concept 4)
export { SemanticCache, buildCacheKey, hashContextSignature, selectAdaptiveCacheThreshold, } from "./semantic-cache";
//# sourceMappingURL=index.js.map