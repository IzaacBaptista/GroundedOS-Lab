/**
 * JsonExtractor
 *
 * Handles the `"json"` modality. Parses the JSON payload and renders it as
 * indented "key: value" text that preserves the source's hierarchy (book
 * cap. 6, "Documentos estruturados") instead of flattening it into a single
 * line. A top-level object gets one section per key; anything else (array or
 * scalar root) becomes a single "root" section.
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
import { renderStructuredValue } from "./structured-text";

const EXTRACTOR_NAME = "json-extractor";
const EXTRACTOR_VERSION = "0.1.0";

export class JsonExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["json"];

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    if (input.type !== "json") {
      throw new Error(
        `[${EXTRACTOR_NAME}] Unsupported modality "${input.type}". JsonExtractor only handles "json".`
      );
    }

    const raw = await this._readContent(input);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[${EXTRACTOR_NAME}] invalid JSON: ${message}`);
    }

    const sections = this._buildSections(parsed);
    const fullText = sections.map((section) => section.text).join("\n\n");
    const now = new Date().toISOString();

    return {
      documentId: this._resolveDocumentId(input),
      title: this._resolveTitle(input),
      modality: "json",
      language: input.metadata?.language as string | undefined,
      content: { fullText, sections },
      lineage: {
        sourceType: input.url ? "url" : input.filePath ? "upload" : "manual",
        originalFilename: input.filePath ? basename(input.filePath) : undefined,
        mimeType: "application/json",
        extractedAt: now,
        extractor: EXTRACTOR_NAME,
        extractorVersion: EXTRACTOR_VERSION,
      },
      metadata: { ...(input.metadata ?? {}) },
    };
  }

  private _buildSections(parsed: unknown): DocumentSection[] {
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return this._sectionsFromOffsets(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
          heading: key,
          text: renderStructuredValue(value),
        }))
      );
    }

    return this._sectionsFromOffsets([{ heading: "root", text: renderStructuredValue(parsed) }]);
  }

  private _sectionsFromOffsets(
    entries: Array<{ heading: string; text: string }>
  ): DocumentSection[] {
    const sections: DocumentSection[] = [];
    let offset = 0;

    entries.forEach((entry, index) => {
      const separator = index > 0 ? "\n\n" : "";
      offset += separator.length;
      sections.push({
        id: `section-${index + 1}`,
        heading: entry.heading,
        text: entry.text,
        startOffset: offset,
        endOffset: offset + entry.text.length,
      });
      offset += entry.text.length;
    });

    return sections;
  }

  private async _readContent(input: IngestionInput): Promise<string> {
    if (input.content !== undefined) {
      return input.content;
    }
    if (input.filePath) {
      return await readFile(input.filePath, "utf-8");
    }
    throw new Error(
      `[${EXTRACTOR_NAME}] Either 'content' or 'filePath' must be provided for modality "json".`
    );
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
    return randomUUID();
  }
}
