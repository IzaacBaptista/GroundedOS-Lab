import type { DocumentModality, NormalizedDocument } from "@groundedos/core";

const ERROR_PREFIX = "[rag/chunking]";
const DEFAULT_MAX_CHUNK_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 100;
const CODE_FILE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "java",
  "rb",
  "rs",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "kt",
  "swift",
]);

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
  const isCode = isCodeFile(document.lineage.originalFilename);
  let chunkIndex = 0;

  for (const section of document.content.sections) {
    if (section.text.trim().length === 0) {
      continue;
    }

    const offsetBasis: ChunkOffsetBasis =
      typeof section.startOffset === "number" ? "document" : "section";
    const sectionBaseOffset = offsetBasis === "document" ? section.startOffset ?? 0 : 0;
    let sectionChunkIndex = 0;

    const slices = isCode
      ? sliceCodeSectionText(section.text, resolvedOptions)
      : sliceSectionText(section.text, resolvedOptions);

    for (const slice of slices) {
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

function isCodeFile(filename: string | undefined): boolean {
  if (!filename) {
    return false;
  }
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension !== undefined && CODE_FILE_EXTENSIONS.has(extension);
}

/**
 * Splits code into logical units (functions/classes/top-level blocks) and
 * packs them into chunks without cutting a unit in half — book cap. 8
 * ("Chunking para código"): a function split mid-body loses meaning for
 * both search and generation.
 *
 * ponytail: unit boundaries are detected heuristically (blank line followed
 * by a non-indented line), not via a real per-language parser. Works for
 * conventionally-formatted brace and indentation-based code; upgrade to a
 * syntax-aware parser (e.g. tree-sitter) if fidelity on unconventional
 * formatting becomes a real requirement.
 */
function sliceCodeSectionText(
  text: string,
  options: ResolvedChunkOptions
): Array<{ text: string; startOffset: number; endOffset: number }> {
  const units = splitIntoCodeUnits(text);
  const slices: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  let buffer: { text: string; startOffset: number; endOffset: number } | null = null;

  const flush = () => {
    if (buffer) {
      slices.push(buffer);
      buffer = null;
    }
  };

  for (const unit of units) {
    if (unit.text.length > options.maxChunkChars) {
      flush();
      for (const slice of sliceSectionText(unit.text, options)) {
        slices.push({
          text: slice.text,
          startOffset: unit.startOffset + slice.startOffset,
          endOffset: unit.startOffset + slice.endOffset,
        });
      }
      continue;
    }

    if (buffer && buffer.text.length + 2 + unit.text.length > options.maxChunkChars) {
      flush();
    }

    if (!buffer) {
      buffer = { text: unit.text, startOffset: unit.startOffset, endOffset: unit.endOffset };
    } else {
      buffer.text += `\n\n${unit.text}`;
      buffer.endOffset = unit.endOffset;
    }
  }
  flush();

  return slices;
}

function splitIntoCodeUnits(
  text: string
): Array<{ text: string; startOffset: number; endOffset: number }> {
  const lines = text.split("\n");
  const units: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  let unitLines: string[] = [];
  let unitStartOffset = 0;
  let offset = 0;

  const flush = (endOffset: number) => {
    const joined = unitLines.join("\n").trim();
    if (joined.length > 0) {
      units.push({ text: joined, startOffset: unitStartOffset, endOffset });
    }
    unitLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const isBlank = line.trim().length === 0;
    const nextLine = lines[i + 1];
    const nextStartsTopLevel = nextLine !== undefined && /^\S/.test(nextLine);

    if (unitLines.length === 0 && isBlank) {
      offset += line.length + 1;
      unitStartOffset = offset;
      continue;
    }

    unitLines.push(line);

    if (isBlank && nextStartsTopLevel) {
      flush(offset + line.length);
      unitStartOffset = offset + line.length + 1;
    }

    offset += line.length + 1;
  }
  flush(text.length);

  return units;
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
