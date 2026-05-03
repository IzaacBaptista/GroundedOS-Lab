import type { DocumentModality, NormalizedDocument } from "@groundedos/core";
export interface ChunkDocumentOptions {
    maxChunkChars?: number;
    overlapChars?: number;
}
export type ChunkOffsetBasis = "document" | "section";
export interface RetrievalChunkMetadata {
    documentTitle: string;
    modality: DocumentModality;
    sectionHeading?: string;
    page?: number;
    sourceType: NormalizedDocument["lineage"]["sourceType"];
    originalFilename?: string;
    chunkIndex: number;
    sectionChunkIndex: number;
    offsetBasis: ChunkOffsetBasis;
}
export interface RetrievalChunk {
    id: string;
    documentId: string;
    sectionId: string;
    text: string;
    startOffset: number;
    endOffset: number;
    metadata: RetrievalChunkMetadata;
}
export declare function chunkDocument(document: NormalizedDocument, options?: ChunkDocumentOptions): RetrievalChunk[];
