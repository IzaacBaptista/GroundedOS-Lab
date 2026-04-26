import type { DocumentModality, NormalizedDocument } from "@groundedos/core";
import { type ChunkDocumentOptions, type ChunkOffsetBasis } from "./chunking";
import { type EmbeddedChunk, type EmbeddingProvider } from "./embeddings";
import { type VectorMetadataFilter, type VectorSearchResult, type VectorStore } from "./vector-store";
export interface BuildRetrievalIndexOptions {
    chunkOptions?: ChunkDocumentOptions;
    embeddingProvider?: EmbeddingProvider;
    store?: VectorStore;
}
export interface RetrievalIndex {
    embeddingProvider: EmbeddingProvider;
    store: VectorStore;
    embeddedChunks: EmbeddedChunk[];
}
export interface RetrieveFromIndexOptions {
    topK?: number;
    filter?: VectorMetadataFilter;
    mode?: RetrievalMode;
    hybridDenseWeight?: number;
    hybridCandidateTopK?: number;
}
export type RetrievalResult = VectorSearchResult;
export type RetrievalMode = "dense" | "hybrid";
export interface RetrievalDevModeOutput {
    query: string;
    resultCount: number;
    results: RetrievalDevModeResult[];
    hybrid?: {
        mode: "hybrid";
        denseWeight: number;
        sparseWeight: number;
        candidateCount: number;
        candidates: RetrievalHybridCandidate[];
    };
}
export interface RetrievalHybridCandidate {
    chunkId: string;
    sectionId: string;
    denseRank: number;
    hybridRank: number;
    denseScore: number;
    sparseScore: number;
    combinedScore: number;
}
export interface RetrievalDevModeResult {
    rank: number;
    chunkId: string;
    documentId: string;
    sectionId: string;
    score: number;
    text: string;
    source: {
        documentTitle: string;
        modality: DocumentModality;
        sourceType: NormalizedDocument["lineage"]["sourceType"];
        originalFilename?: string;
        sectionHeading?: string;
        page?: number;
    };
    offsets: {
        startOffset: number;
        endOffset: number;
        offsetBasis: ChunkOffsetBasis;
    };
    embedding: {
        provider: string;
        dimensions: number;
        model?: string;
        normalized?: boolean;
    };
}
export declare function buildRetrievalIndex(document: NormalizedDocument, options?: BuildRetrievalIndexOptions): Promise<RetrievalIndex>;
export declare function retrieveFromIndex(index: RetrievalIndex, query: string, options?: RetrieveFromIndexOptions): Promise<RetrievalResult[]>;
export declare function retrieveForDevMode(index: RetrievalIndex, query: string, options?: RetrieveFromIndexOptions): Promise<RetrievalDevModeOutput>;
export declare function createRetrievalDevOutput(query: string, results: RetrievalResult[]): RetrievalDevModeOutput;
