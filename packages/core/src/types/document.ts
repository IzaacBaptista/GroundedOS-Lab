/**
 * Uniform Document Schema
 *
 * A single contract for every document modality (text, PDF, image, audio, CSV,
 * markdown, HTML) that flows through the GroundedOS Lab pipeline.
 *
 * Two main entities:
 *   - SourceDocument  → the raw ingestion record (what came in)
 *   - NormalizedDocument → the standardized payload the pipeline works with
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Every content modality supported by the ingestion pipeline. */
export type DocumentModality =
  | "text"
  | "pdf"
  | "image"
  | "audio"
  | "csv"
  | "markdown"
  | "html";

/** Lifecycle of a document as it moves through the ETL pipeline. */
export type DocumentStatus =
  | "uploaded"    // Raw file received; no processing has started
  | "processing"  // ETL pipeline is actively working on it
  | "processed"   // Normalized document is ready for downstream use
  | "failed";     // Processing failed; see error details in metadata

// ---------------------------------------------------------------------------
// SourceDocument — the raw ingestion record
// ---------------------------------------------------------------------------

/**
 * Represents the entry point for any document ingested by the system.
 *
 * Created when a file is uploaded, a URL is submitted, or content is entered
 * manually. Tracks provenance, storage paths and processing status. The ETL
 * pipeline reads this record to know what to do and where to write results.
 */
export interface SourceDocument {
  /** Unique identifier for this document (UUID recommended). */
  id: string;

  /** Optional workspace/tenant this document belongs to. */
  workspaceId?: string;

  /** Human-readable title (may be derived from filename if not provided). */
  title: string;

  /** Content type that determines which extractor to apply. */
  modality: DocumentModality;

  /** IANA MIME type (e.g. "application/pdf", "image/png"). */
  mimeType: string;

  /** Original filename as provided by the user or source system. */
  originalFilename?: string;

  /** BCP-47 language tag (e.g. "en", "pt-BR"). Populated after detection. */
  language?: string;

  /** Where this document came from. */
  source: {
    type: "upload" | "url" | "manual";
    /** Remote URL when type is "url". */
    uri?: string;
  };

  /**
   * File-system or object-storage paths produced at each pipeline stage.
   * Paths are relative to the configured storage root.
   */
  storage: {
    /** Path to the original raw file. */
    rawPath?: string;
    /** Path to the plain-text extraction output. */
    extractedTextPath?: string;
    /** Path to the fully normalized JSON document. */
    normalizedJsonPath?: string;
  };

  /** Additional information about the document's origin and content. */
  metadata: {
    /** File size in bytes. */
    sizeBytes?: number;
    /** SHA-256 (or equivalent) hash of the raw file contents. */
    checksum?: string;
    /** Document author when available from file metadata. */
    author?: string;
    /** ISO-8601 timestamp of when the document was originally created. */
    createdAtSource?: string;
    /** User-defined or auto-detected tags for filtering and search. */
    tags?: string[];
  };

  /** Current lifecycle state of the document. */
  status: DocumentStatus;

  /** ISO-8601 timestamp of when this record was first created. */
  createdAt: string;

  /** ISO-8601 timestamp of the most recent update to this record. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// NormalizedDocument — the standardized pipeline payload
// ---------------------------------------------------------------------------

/**
 * A single section extracted from the source document.
 *
 * Sections map to natural divisions in the source (pages in a PDF, headings in
 * Markdown, slides in a presentation, etc.). They are the atomic units that the
 * chunking stage further splits into retrieval chunks.
 */
export interface DocumentSection {
  /** Unique identifier within the document (e.g. "section-3"). */
  id: string;
  /** Section heading or title, when present. */
  heading?: string;
  /** Full plain-text content of this section. */
  text: string;
  /** Page number in page-based formats (PDF, DOCX). */
  page?: number;
  /** Byte/character offset where this section starts in fullText. */
  startOffset?: number;
  /** Byte/character offset where this section ends in fullText. */
  endOffset?: number;
}

/**
 * The standardized document that every downstream pipeline stage consumes.
 *
 * Produced by the ETL extractor from a {@link SourceDocument}. Contains
 * the full extracted text, a section breakdown, and complete data-lineage
 * information so that any result can be traced back to its source.
 */
export interface NormalizedDocument {
  /** References the originating {@link SourceDocument.id}. */
  documentId: string;

  /** Human-readable title, carried over from the source document. */
  title: string;

  /** Content modality of the source material. */
  modality: DocumentModality;

  /** BCP-47 language tag detected or declared for this document. */
  language?: string;

  /** Extracted and structured textual content. */
  content: {
    /** Complete plain-text representation of the document. */
    fullText: string;
    /**
     * Ordered list of logical sections extracted from the document.
     * The chunking pipeline operates on these sections.
     */
    sections: DocumentSection[];
  };

  /** Data-lineage record describing how this document was produced. */
  lineage: {
    /** Origin type of the source document. */
    sourceType: "upload" | "url" | "manual";
    /** Original filename, if available. */
    originalFilename?: string;
    /** IANA MIME type of the source file. */
    mimeType: string;
    /** Checksum of the source file for integrity verification. */
    checksum?: string;
    /** ISO-8601 timestamp of when text extraction completed. */
    extractedAt: string;
    /** Name of the extractor module (e.g. "pdf-extractor", "whisper-asr"). */
    extractor: string;
    /** SemVer string of the extractor, for reproducibility. */
    extractorVersion?: string;
  };

  /**
   * Arbitrary key-value metadata.
   * Use this for domain-specific fields not covered by the base schema
   * (e.g. custom tags, external system IDs, model-specific annotations).
   */
  metadata: Record<string, unknown>;
}
