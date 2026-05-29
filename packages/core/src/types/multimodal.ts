import type { DocumentModality } from "./document";

export type ModalityType = DocumentModality | "ocr" | "image_description" | "audio_transcript";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentAsset {
  id: string;
  sourceDocumentId: string;
  modality: ModalityType;
  mimeType: string;
  originalPath?: string;
  extractedPath?: string;
  pageNumber?: number;
  boundingBox?: BoundingBox;
  checksum?: string;
  extractionMethod?: string;
  providerMetadata?: Record<string, unknown>;
  confidence?: number;
  createdAt: string;
}

export interface ImageAsset extends DocumentAsset {
  modality: "image";
}

export interface AudioAsset extends DocumentAsset {
  modality: "audio";
  durationMs?: number;
}

export interface ExtractedImage {
  assetId: string;
  sourceDocumentId: string;
  pageNumber: number;
  mimeType: string;
  originalPath?: string;
  extractedPath: string;
  extractionMethod: "embedded" | "page_render" | "fallback";
  checksum?: string;
  boundingBox?: BoundingBox;
  providerMetadata?: Record<string, unknown>;
  confidence?: number;
  createdAt: string;
}

export interface OCRWord {
  text: string;
  confidence?: number;
  boundingBox?: BoundingBox;
}

export interface OCRLine {
  text: string;
  confidence?: number;
  boundingBox?: BoundingBox;
  words?: OCRWord[];
}

export interface OCRBlock {
  text: string;
  confidence?: number;
  boundingBox?: BoundingBox;
  lines?: OCRLine[];
}

export interface OCRResult {
  assetId: string;
  sourceDocumentId: string;
  text: string;
  confidence?: number;
  language?: string;
  pageNumber?: number;
  readingOrder?: number[];
  blocks?: OCRBlock[];
  provider: string;
  model?: string;
  createdAt: string;
}

export interface ImageDescription {
  assetId: string;
  sourceDocumentId: string;
  shortCaption: string;
  detailedDescription?: string;
  detectedObjects?: string[];
  detectedTextSummary?: string;
  diagramType?: string;
  tableLikeStructure?: boolean;
  semanticTags?: string[];
  confidence?: number;
  provider: string;
  model?: string;
  createdAt: string;
}

export interface TranscriptionSegment {
  segmentId: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number;
  speaker?: string;
  words?: Array<{
    text: string;
    startTimeMs: number;
    endTimeMs: number;
    confidence?: number;
  }>;
}

export interface AudioTranscript {
  assetId: string;
  sourceDocumentId: string;
  fullText: string;
  segments: TranscriptionSegment[];
  language?: string;
  confidence?: number;
  provider: string;
  model?: string;
  durationMs?: number;
  createdAt: string;
}

export interface AssetReference {
  assetId: string;
  sourceDocumentId: string;
  modality: ModalityType;
  pageNumber?: number;
  timestampStartMs?: number;
  timestampEndMs?: number;
  boundingBox?: BoundingBox;
}

export type MultimodalChunkType =
  | "text_chunk"
  | "ocr_chunk"
  | "image_description_chunk"
  | "audio_transcript_chunk"
  | "mixed_context_chunk";

export interface MultimodalChunk {
  chunkId: string;
  documentId: string;
  modality: ModalityType;
  chunkType: MultimodalChunkType;
  content: string;
  assetReferences: AssetReference[];
  pageNumber?: number;
  offsets?: { start: number; end: number };
  boundingBoxes?: BoundingBox[];
  confidence?: number;
  extractionMethod?: string;
  sourceTrace?: Record<string, unknown>;
}

export interface MultimodalSourceDocument {
  id: string;
  modality: DocumentModality;
  assets: DocumentAsset[];
  createdAt: string;
  updatedAt: string;
}

export interface MultimodalNormalizedDocument {
  documentId: string;
  modality: DocumentModality;
  assets: DocumentAsset[];
  ocrResults: OCRResult[];
  imageDescriptions: ImageDescription[];
  audioTranscript?: AudioTranscript;
  chunks: MultimodalChunk[];
}
