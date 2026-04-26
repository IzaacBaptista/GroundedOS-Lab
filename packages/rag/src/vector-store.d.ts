import type { EmbeddedChunk, EmbeddingVector } from "./embeddings";
export type VectorMetadataFilter = Record<string, string | number | boolean | undefined>;
export interface VectorSearchQuery {
    embedding: EmbeddingVector;
    topK?: number;
    filter?: VectorMetadataFilter;
}
export interface VectorSearchResult {
    chunk: EmbeddedChunk;
    score: number;
}
export interface VectorStore {
    readonly size: number;
    insert(chunks: EmbeddedChunk[]): void;
    search(query: VectorSearchQuery): VectorSearchResult[];
    clear(): void;
}
export declare class InMemoryVectorStore implements VectorStore {
    private readonly chunksById;
    private dimensions?;
    get size(): number;
    insert(chunks: EmbeddedChunk[]): void;
    search(query: VectorSearchQuery): VectorSearchResult[];
    clear(): void;
    private validateChunk;
}
