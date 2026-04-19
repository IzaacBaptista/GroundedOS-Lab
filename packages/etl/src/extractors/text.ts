/**
 * TextExtractor
 *
 * Handles the `"text"` modality. Accepts either an inline string via
 * `input.content` or a local file path via `input.filePath`, reads the
 * plain-text content, and produces a `NormalizedDocument` whose sections are
 * derived by splitting on blank lines (double-newline paragraphs).
 */

import { readFile } from "fs/promises";
import { basename } from "path";
import { randomUUID } from "crypto";
import type {
  DocumentModality,
  DocumentSection,
  Extractor,
  IngestionInput,
  NormalizedDocument,
} from "@groundedos/core";

const EXTRACTOR_NAME = "text-extractor";
const EXTRACTOR_VERSION = "0.1.0";

export class TextExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["text"];

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    if (input.type !== "text") {
      throw new Error(
        `[${EXTRACTOR_NAME}] Unsupported modality "${input.type}". TextExtractor only handles "text".`
      );
    }
    const fullText = await this._readContent(input);
    const sections = this._splitSections(fullText);
    const title = this._resolveTitle(input);
    const now = new Date().toISOString();

    return {
      documentId: this._resolveDocumentId(input),
      title,
      modality: "text",
      language: (input.metadata?.language as string | undefined),
      content: {
        fullText,
        sections,
      },
      lineage: {
        sourceType: input.url ? "url" : input.filePath ? "upload" : "manual",
        originalFilename: input.filePath ? basename(input.filePath) : undefined,
        mimeType: "text/plain",
        extractedAt: now,
        extractor: EXTRACTOR_NAME,
        extractorVersion: EXTRACTOR_VERSION,
      },
      metadata: { ...(input.metadata ?? {}) },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _readContent(input: IngestionInput): Promise<string> {
    if (input.content !== undefined) {
      return input.content;
    }
    if (input.filePath) {
      return await readFile(input.filePath, "utf-8");
    }
    throw new Error(
      `[${EXTRACTOR_NAME}] Either 'content' or 'filePath' must be provided for modality "text".`
    );
  }

  private _splitSections(fullText: string): DocumentSection[] {
    // Use a regex that gives us the exact position of each separator so we can
    // compute accurate startOffset / endOffset values, even when the same
    // paragraph text appears more than once in the document. Support both LF
    // and CRLF paragraph separators without normalizing the source text so
    // offsets remain aligned with the original content.
    const separatorPattern = /(?:\r?\n){2,}/g;
    const sections: DocumentSection[] = [];
    let lastEnd = 0;
    let sectionIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = separatorPattern.exec(fullText)) !== null) {
      const raw = fullText.slice(lastEnd, match.index);
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        const leadTrim = raw.length - raw.trimStart().length;
        const tailTrim = raw.length - raw.trimEnd().length;
        sections.push({
          id: `section-${++sectionIndex}`,
          text: trimmed,
          startOffset: lastEnd + leadTrim,
          endOffset: match.index - tailTrim,
        });
      }
      lastEnd = match.index + match[0].length;
    }

    // Handle the final segment (after the last separator, or the entire string
    // if no separator was found).
    const tail = fullText.slice(lastEnd);
    const trimmedTail = tail.trim();
    if (trimmedTail.length > 0) {
      const leadTrim = tail.length - tail.trimStart().length;
      const tailTrim = tail.length - tail.trimEnd().length;
      sections.push({
        id: `section-${++sectionIndex}`,
        text: trimmedTail,
        startOffset: lastEnd + leadTrim,
        endOffset: fullText.length - tailTrim,
      });
    }

    return sections;
  }

  private _resolveTitle(input: IngestionInput): string {
    if (input.metadata?.title && typeof input.metadata.title === "string") {
      return input.metadata.title;
    }
    if (input.filePath) {
      return basename(input.filePath);
    }
    return "Untitled";
  }

  private _resolveDocumentId(input: IngestionInput): string {
    if (input.metadata?.documentId && typeof input.metadata.documentId === "string") {
      return input.metadata.documentId;
    }
    // Fallback: generate a collision-resistant UUID when no external ID is supplied.
    return randomUUID();
  }
}
