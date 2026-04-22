import type { DocumentModality, NormalizedDocument } from "@groundedos/core";

const ERROR_PREFIX = "[rag/chunking]";
const DEFAULT_MAX_CHUNK_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 100;

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

type ResolvedChunkOptions = Required<ChunkDocumentOptions>;

export function chunkDocument(
  document: NormalizedDocument,
  options: ChunkDocumentOptions = {}
): RetrievalChunk[] {
  const resolvedOptions = resolveOptions(options);
  const chunks: RetrievalChunk[] = [];
  let chunkIndex = 0;

  for (const section of document.content.sections) {
    if (section.text.trim().length === 0) {
      continue;
    }

    const offsetBasis: ChunkOffsetBasis =
      typeof section.startOffset === "number" ? "document" : "section";
    const sectionBaseOffset = offsetBasis === "document" ? section.startOffset ?? 0 : 0;
    let sectionChunkIndex = 0;

    for (const slice of sliceSectionText(section.text, resolvedOptions)) {
      sectionChunkIndex += 1;
      chunkIndex += 1;

      chunks.push({
        id: `${document.documentId}:${section.id}:chunk-${sectionChunkIndex}`,
        documentId: document.documentId,
        sectionId: section.id,
        text: slice.text,
        startOffset: sectionBaseOffset + slice.startOffset,
        endOffset: sectionBaseOffset + slice.endOffset,
        metadata: {
          documentTitle: document.title,
          modality: document.modality,
          sectionHeading: section.heading,
          page: section.page,
          sourceType: document.lineage.sourceType,
          originalFilename: document.lineage.originalFilename,
          chunkIndex,
          sectionChunkIndex,
          offsetBasis,
        },
      });
    }
  }

  return chunks;
}

function resolveOptions(options: ChunkDocumentOptions): ResolvedChunkOptions {
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  if (!Number.isInteger(maxChunkChars) || maxChunkChars <= 0) {
    throw new Error(`${ERROR_PREFIX} maxChunkChars must be a positive integer.`);
  }

  if (!Number.isInteger(overlapChars) || overlapChars < 0) {
    throw new Error(`${ERROR_PREFIX} overlapChars must be an integer greater than or equal to 0.`);
  }

  if (overlapChars >= maxChunkChars) {
    throw new Error(`${ERROR_PREFIX} overlapChars must be smaller than maxChunkChars.`);
  }

  return { maxChunkChars, overlapChars };
}

function sliceSectionText(
  text: string,
  options: ResolvedChunkOptions
): Array<{ text: string; startOffset: number; endOffset: number }> {
  const slices: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  const step = options.maxChunkChars - options.overlapChars;
  let rawStartOffset = 0;

  while (rawStartOffset < text.length) {
    const rawEndOffset = Math.min(rawStartOffset + options.maxChunkChars, text.length);
    const rawText = text.slice(rawStartOffset, rawEndOffset);
    const trimmedText = rawText.trim();

    if (trimmedText.length > 0) {
      const leadingTrimChars = rawText.length - rawText.trimStart().length;
      const trailingTrimChars = rawText.length - rawText.trimEnd().length;

      slices.push({
        text: trimmedText,
        startOffset: rawStartOffset + leadingTrimChars,
        endOffset: rawEndOffset - trailingTrimChars,
      });
    }

    if (rawEndOffset === text.length) {
      break;
    }

    rawStartOffset += step;
  }

  return slices;
}
