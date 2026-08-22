/**
 * XmlExtractor
 *
 * Handles the `"xml"` modality. Parses XML into a nested object (via
 * fast-xml-parser) and renders it with the same hierarchy-preserving text
 * renderer used by `JsonExtractor` (book cap. 6, "Documentos estruturados").
 * The root element's children each become their own section.
 */

import { readFile } from "fs/promises";
import { basename } from "path";
import { randomUUID } from "crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
  DocumentModality,
  DocumentSection,
  Extractor,
  IngestionInput,
  NormalizedDocument,
} from "@groundedos/core";
import { renderStructuredValue } from "./structured-text";

const EXTRACTOR_NAME = "xml-extractor";
const EXTRACTOR_VERSION = "0.1.0";

export class XmlExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["xml"];

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    if (input.type !== "xml") {
      throw new Error(
        `[${EXTRACTOR_NAME}] Unsupported modality "${input.type}". XmlExtractor only handles "xml".`
      );
    }

    const raw = await this._readContent(input);
    const validation = XMLValidator.validate(raw);
    if (validation !== true) {
      throw new Error(`[${EXTRACTOR_NAME}] invalid XML: ${validation.err.msg}`);
    }

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(raw) as Record<string, unknown>;
    const sections = this._buildSections(parsed);
    const fullText = sections.map((section) => section.text).join("\n\n");
    const now = new Date().toISOString();

    return {
      documentId: this._resolveDocumentId(input),
      title: this._resolveTitle(input),
      modality: "xml",
      language: input.metadata?.language as string | undefined,
      content: { fullText, sections },
      lineage: {
        sourceType: input.url ? "url" : input.filePath ? "upload" : "manual",
        originalFilename: input.filePath ? basename(input.filePath) : undefined,
        mimeType: "application/xml",
        extractedAt: now,
        extractor: EXTRACTOR_NAME,
        extractorVersion: EXTRACTOR_VERSION,
      },
      metadata: { ...(input.metadata ?? {}) },
    };
  }

  private _buildSections(parsed: Record<string, unknown>): DocumentSection[] {
    const rootKeys = Object.keys(parsed).filter((key) => key !== "?xml");
    const rootValue = rootKeys.length > 0 ? parsed[rootKeys[0]!] : undefined;

    const entries: Array<{ heading: string; text: string }> =
      rootValue !== null && typeof rootValue === "object" && !Array.isArray(rootValue)
        ? Object.entries(rootValue as Record<string, unknown>).map(([key, value]) => ({
            heading: key,
            text: renderStructuredValue(value),
          }))
        : [{ heading: "root", text: renderStructuredValue(rootValue) }];

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
      `[${EXTRACTOR_NAME}] Either 'content' or 'filePath' must be provided for modality "xml".`
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
