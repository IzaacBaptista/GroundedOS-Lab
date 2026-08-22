import type {
  DocumentModality,
  DocumentRelationship,
  NormalizedDocument,
} from "@groundedos/core";

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

export type ChunkStrategy = "fixed" | "recursive" | "sentence";

export interface ChunkDocumentOptions {
  maxChunkChars?: number;
  overlapChars?: number;
  /**
   * Book cap. 8: `"fixed"` (default) is a raw character window with
   * word-boundary snapping. `"recursive"` prefers paragraph, then sentence
   * boundaries before falling back to a fixed-size cut. `"sentence"` packs
   * whole sentences and never splits one across chunks, even if that means
   * emitting an oversized chunk for a single very long sentence.
   */
  strategy?: ChunkStrategy;
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
  /**
   * Cap. 9 enrichment metadata, carried over from `document.metadata` so it
   * can be used as a pre-retrieval filter (e.g. `permissions`/`tenantId`)
   * rather than passive annotation.
   */
  author?: string;
  timestamp?: string;
  tags?: string[];
  permissions?: string[];
  tenantId?: string;
  relationships?: DocumentRelationship[];
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
      : sliceByStrategy(section.text, resolvedOptions);

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
          author: document.metadata.author as string | undefined,
          timestamp: document.metadata.timestamp as string | undefined,
          tags: document.metadata.tags as string[] | undefined,
          permissions: document.metadata.permissions as string[] | undefined,
          tenantId: document.metadata.tenantId as string | undefined,
          relationships: document.metadata.relationships as
            | DocumentRelationship[]
            | undefined,
        },
      });
    }
  }

  return chunks;
}

export interface HierarchicalChunk extends RetrievalChunk {
  /** Id of the `ParentChunk` (the full section text) this chunk was cut from. */
  parentChunkId: string;
}

export interface ParentChunk {
  id: string;
  documentId: string;
  sectionId: string;
  text: string;
}

export interface ChunkDocumentWithParentsResult {
  chunks: HierarchicalChunk[];
  parents: ParentChunk[];
}

/**
 * Parent-child chunking (book cap. 8): retrieval matches against the small,
 * precise `chunks` (same output as `chunkDocument`), but each carries a
 * `parentChunkId` pointing to the full section text in `parents` — the
 * broader context a caller can inject into the prompt once a child chunk
 * scores well. The section itself is the parent unit, matching the book's
 * Figure 8.2 example ("parent chunk — contexto amplo — ex: seção inteira").
 */
export function chunkDocumentWithParents(
  document: NormalizedDocument,
  options: ChunkDocumentOptions = {}
): ChunkDocumentWithParentsResult {
  const childChunks = chunkDocument(document, options);
  const parents: ParentChunk[] = document.content.sections
    .filter((section) => section.text.trim().length > 0)
    .map((section) => ({
      id: `${document.documentId}:${section.id}:parent`,
      documentId: document.documentId,
      sectionId: section.id,
      text: section.text.trim(),
    }));

  const chunks: HierarchicalChunk[] = childChunks.map((chunk) => ({
    ...chunk,
    parentChunkId: `${document.documentId}:${chunk.sectionId}:parent`,
  }));

  return { chunks, parents };
}

function resolveOptions(options: ChunkDocumentOptions): ResolvedChunkOptions {
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const strategy = options.strategy ?? "fixed";

  if (!Number.isInteger(maxChunkChars) || maxChunkChars <= 0) {
    throw new Error(`${ERROR_PREFIX} maxChunkChars must be a positive integer.`);
  }

  if (!Number.isInteger(overlapChars) || overlapChars < 0) {
    throw new Error(`${ERROR_PREFIX} overlapChars must be an integer greater than or equal to 0.`);
  }

  if (overlapChars >= maxChunkChars) {
    throw new Error(`${ERROR_PREFIX} overlapChars must be smaller than maxChunkChars.`);
  }

  return { maxChunkChars, overlapChars, strategy };
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

function sliceByStrategy(
  text: string,
  options: ResolvedChunkOptions
): Array<{ text: string; startOffset: number; endOffset: number }> {
  switch (options.strategy) {
    case "recursive":
      return sliceRecursiveSectionText(text, options);
    case "sentence":
      return sliceSentenceSectionText(text, options);
    default:
      return sliceSectionText(text, options);
  }
}

/**
 * Fixed-size sliding window (book cap. 8, "Fixed-size chunking"). The raw
 * character window is snapped back to the nearest whitespace when it would
 * otherwise land mid-word — "a prática recomendada... é sempre ajustar o
 * corte final para o limite estrutural mais próximo" — falling back to a
 * hard cut only when no whitespace exists in the window (e.g. one long
 * unbroken token).
 */
function sliceSectionText(
  text: string,
  options: ResolvedChunkOptions
): Array<{ text: string; startOffset: number; endOffset: number }> {
  const slices: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  let rawStartOffset = 0;

  while (rawStartOffset < text.length) {
    let rawEndOffset = Math.min(rawStartOffset + options.maxChunkChars, text.length);

    if (rawEndOffset < text.length) {
      rawEndOffset = snapToWordBoundary(text, rawStartOffset, rawEndOffset);
    }

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

    rawStartOffset = Math.max(rawEndOffset - options.overlapChars, rawStartOffset + 1);
  }

  return slices;
}

function snapToWordBoundary(text: string, windowStart: number, windowEnd: number): number {
  if (/\s/.test(text[windowEnd] ?? "") || /\s/.test(text[windowEnd - 1] ?? "")) {
    return windowEnd;
  }

  let cursor = windowEnd - 1;
  while (cursor > windowStart && !/\s/.test(text[cursor]!)) {
    cursor -= 1;
  }

  return cursor > windowStart ? cursor : windowEnd;
}

/**
 * Recursive chunking (book cap. 8): prefers paragraph boundaries, then
 * sentence boundaries, falling back to the fixed-size word-snapped window
 * only when a single sentence alone exceeds `maxChunkChars`.
 */
function sliceRecursiveSectionText(
  text: string,
  options: ResolvedChunkOptions
): Array<{ text: string; startOffset: number; endOffset: number }> {
  const paragraphs = splitWithOffsets(text, /\n{2,}/g);
  return packUnits(paragraphs, options, (paragraph) => {
    const sentences = splitIntoSentences(paragraph.text);
    if (sentences.length <= 1) {
      return sliceSectionText(paragraph.text, options).map((slice) => offsetSlice(slice, paragraph.startOffset));
    }
    return packUnits(
      sentences.map((s) => ({ ...s, startOffset: s.startOffset + paragraph.startOffset })),
      options,
      (sentence) =>
        sliceSectionText(sentence.text, options).map((slice) => offsetSlice(slice, sentence.startOffset))
    );
  });
}

/**
 * Sentence-based chunking (book cap. 8): packs whole sentences up to
 * `maxChunkChars`, never splitting one — a single sentence longer than the
 * budget is emitted as its own oversized chunk rather than being cut.
 */
function sliceSentenceSectionText(
  text: string,
  options: ResolvedChunkOptions
): Array<{ text: string; startOffset: number; endOffset: number }> {
  const sentences = splitIntoSentences(text);
  return packUnits(sentences, options, (sentence) => [
    { text: sentence.text, startOffset: sentence.startOffset, endOffset: sentence.endOffset },
  ]);
}

interface TextUnit {
  text: string;
  startOffset: number;
  endOffset: number;
}

/** Splits `text` on `separator`, keeping each piece's offset into `text`. */
function splitWithOffsets(text: string, separator: RegExp): TextUnit[] {
  const units: TextUnit[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(separator);

  while ((match = pattern.exec(text)) !== null) {
    pushUnit(units, text, lastEnd, match.index);
    lastEnd = match.index + match[0].length;
  }
  pushUnit(units, text, lastEnd, text.length);

  return units;
}

function pushUnit(units: TextUnit[], text: string, start: number, end: number): void {
  const raw = text.slice(start, end);
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return;
  }
  const leadingTrim = raw.length - raw.trimStart().length;
  const trailingTrim = raw.length - raw.trimEnd().length;
  units.push({ text: trimmed, startOffset: start + leadingTrim, endOffset: end - trailingTrim });
}

/** Splits on sentence-ending punctuation (`.`/`!`/`?`) followed by whitespace or end of text. */
function splitIntoSentences(text: string): TextUnit[] {
  return splitWithOffsets(text, /(?<=[.!?])\s+/g);
}

function offsetSlice(
  slice: { text: string; startOffset: number; endOffset: number },
  base: number
): { text: string; startOffset: number; endOffset: number } {
  return { text: slice.text, startOffset: slice.startOffset + base, endOffset: slice.endOffset + base };
}

/**
 * Greedily packs `units` (paragraphs or sentences) into chunks up to
 * `maxChunkChars`, joining consecutive units with a blank line. A unit that
 * alone exceeds the budget is expanded via `splitOversizedUnit` instead of
 * being packed.
 */
function packUnits(
  units: TextUnit[],
  options: ResolvedChunkOptions,
  splitOversizedUnit: (unit: TextUnit) => Array<{ text: string; startOffset: number; endOffset: number }>
): Array<{ text: string; startOffset: number; endOffset: number }> {
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
      slices.push(...splitOversizedUnit(unit));
      continue;
    }

    if (buffer && buffer.text.length + 1 + unit.text.length > options.maxChunkChars) {
      flush();
    }

    if (!buffer) {
      buffer = { text: unit.text, startOffset: unit.startOffset, endOffset: unit.endOffset };
    } else {
      buffer.text += ` ${unit.text}`;
      buffer.endOffset = unit.endOffset;
    }
  }
  flush();

  return slices;
}
