/**
 * PdfExtractor
 *
 * Handles the `"pdf"` modality. Accepts a local file path or remote URL,
 * extracts page text, and produces a `NormalizedDocument` whose sections map
 * one-to-one with PDF pages that contain extractable text.
 */
import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { basename } from "path";
import { PDFParse } from "pdf-parse";
const EXTRACTOR_NAME = "pdf-extractor";
const EXTRACTOR_VERSION = "0.1.0";
export class PdfExtractor {
    supportedModalities = ["pdf"];
    async extract(input) {
        if (input.type !== "pdf") {
            throw new Error(`[${EXTRACTOR_NAME}] Unsupported modality "${input.type}". PdfExtractor only handles "pdf".`);
        }
        const source = await this._resolveSource(input);
        const parser = new PDFParse(source.loadParams);
        try {
            const result = await parser.getText();
            const pageTexts = result.pages
                .map((page) => ({ page: page.num, text: page.text.trim() }))
                .filter((page) => page.text.length > 0);
            const { fullText, sections } = this._buildContent(pageTexts);
            const now = new Date().toISOString();
            return {
                documentId: this._resolveDocumentId(input),
                title: this._resolveTitle(input),
                modality: "pdf",
                language: input.metadata?.language,
                content: {
                    fullText,
                    sections,
                },
                lineage: {
                    sourceType: source.sourceType,
                    originalFilename: source.originalFilename,
                    mimeType: "application/pdf",
                    checksum: source.checksum,
                    extractedAt: now,
                    extractor: EXTRACTOR_NAME,
                    extractorVersion: EXTRACTOR_VERSION,
                },
                metadata: {
                    ...(input.metadata ?? {}),
                    pageCount: result.total,
                },
            };
        }
        finally {
            await parser.destroy();
        }
    }
    async _resolveSource(input) {
        if (input.filePath) {
            const buffer = await readFile(input.filePath);
            return {
                loadParams: { data: new Uint8Array(buffer) },
                sourceType: "upload",
                originalFilename: basename(input.filePath),
                checksum: createHash("sha256").update(buffer).digest("hex"),
            };
        }
        if (input.url) {
            return {
                loadParams: { url: input.url },
                sourceType: "url",
                originalFilename: this._filenameFromUrl(input.url),
            };
        }
        throw new Error(`[${EXTRACTOR_NAME}] Either 'filePath' or 'url' must be provided for modality "pdf".`);
    }
    _buildContent(pages) {
        const sections = [];
        let fullText = "";
        for (const page of pages) {
            const separator = fullText.length > 0 ? "\n\n" : "";
            const startOffset = fullText.length + separator.length;
            fullText += `${separator}${page.text}`;
            sections.push({
                id: `page-${page.page}`,
                heading: `Page ${page.page}`,
                text: page.text,
                page: page.page,
                startOffset,
                endOffset: startOffset + page.text.length,
            });
        }
        return { fullText, sections };
    }
    _resolveTitle(input) {
        if (input.metadata?.title && typeof input.metadata.title === "string") {
            return input.metadata.title;
        }
        if (input.filePath) {
            return basename(input.filePath);
        }
        return this._filenameFromUrl(input.url) ?? "Untitled PDF";
    }
    _resolveDocumentId(input) {
        if (input.metadata?.documentId && typeof input.metadata.documentId === "string") {
            return input.metadata.documentId;
        }
        return randomUUID();
    }
    _filenameFromUrl(url) {
        if (!url) {
            return undefined;
        }
        try {
            const parsed = new URL(url);
            const name = basename(parsed.pathname);
            return name.length > 0 ? name : undefined;
        }
        catch {
            return undefined;
        }
    }
}
//# sourceMappingURL=pdf.js.map