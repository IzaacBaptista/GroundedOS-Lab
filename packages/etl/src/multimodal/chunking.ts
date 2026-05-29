import type {
  AudioTranscript,
  ImageDescription,
  ModalityType,
  MultimodalChunk,
  OCRResult,
} from "@groundedos/core";

export function buildMultimodalChunks(params: {
  documentId: string;
  ocrResults?: OCRResult[];
  imageDescriptions?: ImageDescription[];
  audioTranscript?: AudioTranscript;
}): MultimodalChunk[] {
  const chunks: MultimodalChunk[] = [];

  for (const result of params.ocrResults ?? []) {
    chunks.push(makeChunk({
      chunkId: `${params.documentId}:ocr:${result.assetId}`,
      documentId: params.documentId,
      modality: "ocr",
      chunkType: "ocr_chunk",
      content: result.text,
      pageNumber: result.pageNumber,
      confidence: result.confidence,
      extractionMethod: result.provider,
      assetId: result.assetId,
    }));
  }

  for (const description of params.imageDescriptions ?? []) {
    const content = [description.shortCaption, description.detailedDescription]
      .filter(Boolean)
      .join("\n");
    chunks.push(makeChunk({
      chunkId: `${params.documentId}:image:${description.assetId}`,
      documentId: params.documentId,
      modality: "image_description",
      chunkType: "image_description_chunk",
      content,
      confidence: description.confidence,
      extractionMethod: description.provider,
      assetId: description.assetId,
    }));
  }

  if (params.audioTranscript) {
    for (const segment of params.audioTranscript.segments) {
      chunks.push(makeChunk({
        chunkId: `${params.documentId}:audio:${segment.segmentId}`,
        documentId: params.documentId,
        modality: "audio_transcript",
        chunkType: "audio_transcript_chunk",
        content: segment.text,
        confidence: segment.confidence,
        extractionMethod: params.audioTranscript.provider,
        assetId: params.audioTranscript.assetId,
        timestampStartMs: segment.startTimeMs,
        timestampEndMs: segment.endTimeMs,
      }));
    }
  }

  return chunks;
}

function makeChunk(params: {
  chunkId: string;
  documentId: string;
  modality: ModalityType;
  chunkType: MultimodalChunk["chunkType"];
  content: string;
  pageNumber?: number;
  confidence?: number;
  extractionMethod?: string;
  assetId: string;
  timestampStartMs?: number;
  timestampEndMs?: number;
}): MultimodalChunk {
  return {
    chunkId: params.chunkId,
    documentId: params.documentId,
    modality: params.modality,
    chunkType: params.chunkType,
    content: params.content,
    assetReferences: [
      {
        assetId: params.assetId,
        sourceDocumentId: params.documentId,
        modality: params.modality,
        pageNumber: params.pageNumber,
        timestampStartMs: params.timestampStartMs,
        timestampEndMs: params.timestampEndMs,
      },
    ],
    pageNumber: params.pageNumber,
    confidence: params.confidence,
    extractionMethod: params.extractionMethod,
    sourceTrace: {
      extractionMethod: params.extractionMethod,
    },
  };
}
