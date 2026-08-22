/**
 * MarkdownExtractor
 *
 * Handles the `"markdown"` modality. Accepts either an inline string via
 * `input.content` or a local file path via `input.filePath`, and splits the
 * document into sections by ATX heading (`#`..`######`), mirroring how
 * headings map to natural sections in Markdown source.
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

const EXTRACTOR_NAME = "markdown-extractor";
const EXTRACTOR_VERSION = "0.1.0";
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/gm;

export class MarkdownExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["markdown"];

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    if (input.type !== "markdown") {
      throw new Error(
        `[${EXTRACTOR_NAME}] Unsupported modality "${input.type}". MarkdownExtractor only handles "markdown".`
      );
    }
    const fullText = await this._readContent(input);
    const sections = this._splitSections(fullText);
    const now = new Date().toISOString();

    return {
      documentId: this._resolveDocumentId(input),
      title: this._resolveTitle(input, sections),
      modality: "markdown",
      language: input.metadata?.language as string | undefined,
      content: { fullText, sections },
      lineage: {
        sourceType: input.url ? "url" : input.filePath ? "upload" : "manual",
        originalFilename: input.filePath ? basename(input.filePath) : undefined,
        mimeType: "text/markdown",
        extractedAt: now,
        extractor: EXTRACTOR_NAME,
        extractorVersion: EXTRACTOR_VERSION,
      },
      metadata: { ...(input.metadata ?? {}) },
    };
  }

  private async _readContent(input: IngestionInput): Promise<string> {
    if (input.content !== undefined) {
      return input.content;
    }
    if (input.filePath) {
      return await readFile(input.filePath, "utf-8");
    }
    throw new Error(
      `[${EXTRACTOR_NAME}] Either 'content' or 'filePath' must be provided for modality "markdown".`
    );
  }

  // ponytail: heading-based split only, no nesting/hierarchy — parent-child
  // chunking (book cap. 8) would build on this if a hierarchical view is needed.
  private _splitSections(fullText: string): DocumentSection[] {
    const headingMatches = [...fullText.matchAll(HEADING_PATTERN)];

    if (headingMatches.length === 0) {
      const trimmed = fullText.trim();
      return trimmed.length > 0
        ? [{ id: "section-1", text: trimmed, startOffset: 0, endOffset: fullText.length }]
        : [];
    }

    const sections: DocumentSection[] = [];
    for (let i = 0; i < headingMatches.length; i++) {
      const match = headingMatches[i];
      const heading = match[2].trim();
      const bodyStart = match.index! + match[0].length;
      const bodyEnd = headingMatches[i + 1]?.index ?? fullText.length;
      const text = fullText.slice(bodyStart, bodyEnd).trim();

      if (text.length > 0) {
        sections.push({
          id: `section-${i + 1}`,
          heading,
          text,
          startOffset: bodyStart,
          endOffset: bodyEnd,
        });
      }
    }

    return sections;
  }

  private _resolveTitle(input: IngestionInput, sections: DocumentSection[]): string {
    if (input.metadata?.title && typeof input.metadata.title === "string") {
      return input.metadata.title;
    }
    if (sections[0]?.heading) {
      return sections[0].heading;
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
    return randomUUID();
  }
}
