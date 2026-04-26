/**
 * TextExtractor
 *
 * Handles the `"text"` modality. Accepts either an inline string via
 * `input.content` or a local file path via `input.filePath`, reads the
 * plain-text content, and produces a `NormalizedDocument` whose sections are
 * derived by splitting on blank lines (double-newline paragraphs).
 */
import type { DocumentModality, Extractor, IngestionInput, NormalizedDocument } from "@groundedos/core";
export declare class TextExtractor implements Extractor {
    readonly supportedModalities: DocumentModality[];
    extract(input: IngestionInput): Promise<NormalizedDocument>;
    private _readContent;
    private _splitSections;
    private _resolveTitle;
    private _resolveDocumentId;
}
