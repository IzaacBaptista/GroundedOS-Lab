/**
 * PdfExtractor
 *
 * Handles the `"pdf"` modality. Accepts a local file path or remote URL,
 * extracts page text, and produces a `NormalizedDocument` whose sections map
 * one-to-one with PDF pages that contain extractable text.
 */
import type { DocumentModality, Extractor, IngestionInput, NormalizedDocument } from "@groundedos/core";
export declare class PdfExtractor implements Extractor {
    readonly supportedModalities: DocumentModality[];
    extract(input: IngestionInput): Promise<NormalizedDocument>;
    private _resolveSource;
    private _buildContent;
    private _resolveTitle;
    private _resolveDocumentId;
    private _filenameFromUrl;
}
