/**
 * HtmlExtractor
 *
 * Handles the `"html"` modality. Accepts either an inline string via
 * `input.content` or a local file path via `input.filePath`, strips markup
 * (including `<script>`/`<style>` blocks) and produces a `NormalizedDocument`
 * with the resulting plain text.
 *
 * ponytail: regex-based tag stripping, not a real DOM parser — good enough
 * for well-formed HTML snippets/pages. Upgrade to a proper HTML parser
 * (e.g. a DOM library) if malformed markup or structure-aware extraction
 * (tables, nested sections — book cap. 6) becomes a real requirement.
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

const EXTRACTOR_NAME = "html-extractor";
const EXTRACTOR_VERSION = "0.1.0";

export class HtmlExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["html"];

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    if (input.type !== "html") {
      throw new Error(
        `[${EXTRACTOR_NAME}] Unsupported modality "${input.type}". HtmlExtractor only handles "html".`
      );
    }
    const rawHtml = await this._readContent(input);
    const fullText = this._stripTags(rawHtml);
    const sections: DocumentSection[] =
      fullText.length > 0
        ? [{ id: "section-1", text: fullText, startOffset: 0, endOffset: fullText.length }]
        : [];
    const now = new Date().toISOString();

    return {
      documentId: this._resolveDocumentId(input),
      title: this._resolveTitle(input, rawHtml),
      modality: "html",
      language: input.metadata?.language as string | undefined,
      content: { fullText, sections },
      lineage: {
        sourceType: input.url ? "url" : input.filePath ? "upload" : "manual",
        originalFilename: input.filePath ? basename(input.filePath) : undefined,
        mimeType: "text/html",
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
      `[${EXTRACTOR_NAME}] Either 'content' or 'filePath' must be provided for modality "html".`
    );
  }

  private _stripTags(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  private _resolveTitle(input: IngestionInput, rawHtml: string): string {
    if (input.metadata?.title && typeof input.metadata.title === "string") {
      return input.metadata.title;
    }
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawHtml);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      if (title.length > 0) {
        return title;
      }
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
