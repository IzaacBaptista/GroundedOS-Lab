/**
 * TextExtractor
 *
 * Handles the `"text"` modality. Accepts either an inline string via
 * `input.content` or a local file path via `input.filePath`, reads the
 * plain-text content, and produces a `NormalizedDocument` whose sections are
 * derived by splitting on blank lines (double-newline paragraphs).
 */

import { readFileSync } from "fs";
import { basename } from "path";
import type { DocumentModality, NormalizedDocument, DocumentSection } from "../../../core/src/types/document";
import type { Extractor } from "../../../core/src/types/extractor";
import type { IngestionInput } from "../../../core/src/types/ingestion";

const EXTRACTOR_NAME = "text-extractor";
const EXTRACTOR_VERSION = "0.1.0";

export class TextExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["text"];

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    const fullText = this._readContent(input);
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

  private _readContent(input: IngestionInput): string {
    if (input.content !== undefined) {
      return input.content;
    }
    if (input.filePath) {
      return readFileSync(input.filePath, "utf-8");
    }
    throw new Error(
      `[${EXTRACTOR_NAME}] Either 'content' or 'filePath' must be provided for modality "text".`
    );
  }

  private _splitSections(fullText: string): DocumentSection[] {
    // Use a regex that gives us the exact position of each separator so we can
    // compute accurate startOffset / endOffset values, even when the same
    // paragraph text appears more than once in the document.
    const separatorPattern = /\n{2,}/g;
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
    // Fallback: generate a simple time-based ID when no external ID is supplied.
    return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
