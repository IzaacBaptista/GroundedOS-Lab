/**
 * Ingestion Input
 *
 * The single entry point for any content that enters the ETL pipeline.
 * Callers supply an `IngestionInput` regardless of modality; the dispatcher
 * routes it to the correct extractor and returns a `NormalizedDocument`.
 */
import type { DocumentModality } from "./document";
/**
 * Unified input descriptor for the ingestion pipeline.
 *
 * At least one of `content`, `filePath`, or `url` should be provided.
 * When multiple are present, extractors follow this precedence order:
 * `content` → `filePath` → `url`.
 */
export interface IngestionInput {
    /**
     * The content modality. Determines which extractor is selected by the
     * dispatcher. Must match one of the values in {@link DocumentModality}.
     */
    type: DocumentModality;
    /**
     * Inline text payload. Use this when the content is already available as
     * a string (e.g. user-entered text, pre-fetched API response).
     *
     * Applicable modalities: `"text"`, `"markdown"`, `"html"`.
     */
    content?: string;
    /**
     * Absolute or relative path to a file on the local filesystem.
     * The extractor is responsible for reading and interpreting the file.
     *
     * Applicable modalities: `"pdf"`, `"image"`, `"audio"`, `"csv"`,
     * `"markdown"`, `"html"`, and `"text"` when stored on disk.
     */
    filePath?: string;
    /**
     * Remote URL from which the extractor should fetch the source material.
     * The extractor is responsible for downloading the content.
     */
    url?: string;
    /**
     * Arbitrary caller-supplied metadata attached to the ingestion request.
     *
     * Useful for carrying context such as `title`, `workspaceId`, `tags`, or
     * any domain-specific fields that should appear in the resulting
     * `NormalizedDocument.metadata`.
     */
    metadata?: Record<string, unknown>;
}
