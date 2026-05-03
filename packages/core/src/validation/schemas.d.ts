/**
 * Runtime Zod schemas for every stable contract type that crosses a package
 * boundary in GroundedOS Lab.
 *
 * These schemas mirror the TypeScript interfaces defined in packages/core and
 * packages/rag, but enforce correctness at runtime — not just compile time.
 */
import { z } from "zod";
export declare const DocumentModalitySchema: z.ZodEnum<{
    text: "text";
    pdf: "pdf";
    image: "image";
    audio: "audio";
    csv: "csv";
    markdown: "markdown";
    html: "html";
}>;
export declare const DocumentStatusSchema: z.ZodEnum<{
    uploaded: "uploaded";
    processing: "processing";
    processed: "processed";
    failed: "failed";
}>;
export declare const DocumentSectionSchema: z.ZodObject<{
    id: z.ZodString;
    heading: z.ZodOptional<z.ZodString>;
    text: z.ZodString;
    page: z.ZodOptional<z.ZodNumber>;
    startOffset: z.ZodOptional<z.ZodNumber>;
    endOffset: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const NormalizedDocumentSchema: z.ZodObject<{
    documentId: z.ZodString;
    title: z.ZodString;
    modality: z.ZodEnum<{
        text: "text";
        pdf: "pdf";
        image: "image";
        audio: "audio";
        csv: "csv";
        markdown: "markdown";
        html: "html";
    }>;
    language: z.ZodOptional<z.ZodString>;
    content: z.ZodObject<{
        fullText: z.ZodString;
        sections: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            heading: z.ZodOptional<z.ZodString>;
            text: z.ZodString;
            page: z.ZodOptional<z.ZodNumber>;
            startOffset: z.ZodOptional<z.ZodNumber>;
            endOffset: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    lineage: z.ZodObject<{
        sourceType: z.ZodEnum<{
            upload: "upload";
            manual: "manual";
            url: "url";
        }>;
        originalFilename: z.ZodOptional<z.ZodString>;
        mimeType: z.ZodString;
        checksum: z.ZodOptional<z.ZodString>;
        extractedAt: z.ZodString;
        extractor: z.ZodString;
        extractorVersion: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
export declare const RetrievalChunkMetadataSchema: z.ZodObject<{
    documentTitle: z.ZodString;
    modality: z.ZodEnum<{
        text: "text";
        pdf: "pdf";
        image: "image";
        audio: "audio";
        csv: "csv";
        markdown: "markdown";
        html: "html";
    }>;
    sectionHeading: z.ZodOptional<z.ZodString>;
    page: z.ZodOptional<z.ZodNumber>;
    sourceType: z.ZodEnum<{
        upload: "upload";
        manual: "manual";
        url: "url";
    }>;
    originalFilename: z.ZodOptional<z.ZodString>;
    chunkIndex: z.ZodNumber;
    sectionChunkIndex: z.ZodNumber;
    offsetBasis: z.ZodEnum<{
        document: "document";
        section: "section";
    }>;
}, z.core.$strip>;
export declare const RetrievalChunkSchema: z.ZodObject<{
    id: z.ZodString;
    documentId: z.ZodString;
    sectionId: z.ZodString;
    text: z.ZodString;
    startOffset: z.ZodNumber;
    endOffset: z.ZodNumber;
    metadata: z.ZodObject<{
        documentTitle: z.ZodString;
        modality: z.ZodEnum<{
            text: "text";
            pdf: "pdf";
            image: "image";
            audio: "audio";
            csv: "csv";
            markdown: "markdown";
            html: "html";
        }>;
        sectionHeading: z.ZodOptional<z.ZodString>;
        page: z.ZodOptional<z.ZodNumber>;
        sourceType: z.ZodEnum<{
            upload: "upload";
            manual: "manual";
            url: "url";
        }>;
        originalFilename: z.ZodOptional<z.ZodString>;
        chunkIndex: z.ZodNumber;
        sectionChunkIndex: z.ZodNumber;
        offsetBasis: z.ZodEnum<{
            document: "document";
            section: "section";
        }>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const EmbeddedChunkSchema: z.ZodObject<{
    id: z.ZodString;
    documentId: z.ZodString;
    sectionId: z.ZodString;
    text: z.ZodString;
    startOffset: z.ZodNumber;
    endOffset: z.ZodNumber;
    metadata: z.ZodObject<{
        documentTitle: z.ZodString;
        modality: z.ZodEnum<{
            text: "text";
            pdf: "pdf";
            image: "image";
            audio: "audio";
            csv: "csv";
            markdown: "markdown";
            html: "html";
        }>;
        sectionHeading: z.ZodOptional<z.ZodString>;
        page: z.ZodOptional<z.ZodNumber>;
        sourceType: z.ZodEnum<{
            upload: "upload";
            manual: "manual";
            url: "url";
        }>;
        originalFilename: z.ZodOptional<z.ZodString>;
        chunkIndex: z.ZodNumber;
        sectionChunkIndex: z.ZodNumber;
        offsetBasis: z.ZodEnum<{
            document: "document";
            section: "section";
        }>;
    }, z.core.$strip>;
    embedding: z.ZodArray<z.ZodNumber>;
    embeddingMetadata: z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        dimensions: z.ZodNumber;
        normalized: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const VectorSearchResultSchema: z.ZodObject<{
    chunk: z.ZodObject<{
        id: z.ZodString;
        documentId: z.ZodString;
        sectionId: z.ZodString;
        text: z.ZodString;
        startOffset: z.ZodNumber;
        endOffset: z.ZodNumber;
        metadata: z.ZodObject<{
            documentTitle: z.ZodString;
            modality: z.ZodEnum<{
                text: "text";
                pdf: "pdf";
                image: "image";
                audio: "audio";
                csv: "csv";
                markdown: "markdown";
                html: "html";
            }>;
            sectionHeading: z.ZodOptional<z.ZodString>;
            page: z.ZodOptional<z.ZodNumber>;
            sourceType: z.ZodEnum<{
                upload: "upload";
                manual: "manual";
                url: "url";
            }>;
            originalFilename: z.ZodOptional<z.ZodString>;
            chunkIndex: z.ZodNumber;
            sectionChunkIndex: z.ZodNumber;
            offsetBasis: z.ZodEnum<{
                document: "document";
                section: "section";
            }>;
        }, z.core.$strip>;
        embedding: z.ZodArray<z.ZodNumber>;
        embeddingMetadata: z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodOptional<z.ZodString>;
            dimensions: z.ZodNumber;
            normalized: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    score: z.ZodNumber;
}, z.core.$strip>;
export declare const QueryIntentSchema: z.ZodEnum<{
    factual: "factual";
    comparative: "comparative";
    procedural: "procedural";
    exploratory: "exploratory";
    unknown: "unknown";
}>;
export declare const ProcessedQuerySchema: z.ZodObject<{
    original: z.ZodString;
    rewritten: z.ZodOptional<z.ZodString>;
    expanded: z.ZodArray<z.ZodString>;
    intent: z.ZodEnum<{
        factual: "factual";
        comparative: "comparative";
        procedural: "procedural";
        exploratory: "exploratory";
        unknown: "unknown";
    }>;
    confidence: z.ZodNumber;
}, z.core.$strip>;
export declare const GroundedAnswerSchema: z.ZodObject<{
    grounded: z.ZodBoolean;
    text: z.ZodString;
    citations: z.ZodArray<z.ZodObject<{
        chunkId: z.ZodString;
        documentId: z.ZodString;
        sectionId: z.ZodString;
        score: z.ZodNumber;
        source: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        offsets: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const RagDocumentSummarySchema: z.ZodObject<{
    documentId: z.ZodString;
    title: z.ZodString;
    modality: z.ZodEnum<{
        text: "text";
        pdf: "pdf";
        image: "image";
        audio: "audio";
        csv: "csv";
        markdown: "markdown";
        html: "html";
    }>;
    checksum: z.ZodString;
    originalFilename: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const RagIndexSummarySchema: z.ZodObject<{
    chunkCount: z.ZodNumber;
    embeddingProvider: z.ZodString;
    embeddingDimensions: z.ZodNumber;
    embeddingModel: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const RagAskResponseSchema: z.ZodObject<{
    document: z.ZodObject<{
        documentId: z.ZodString;
        title: z.ZodString;
        modality: z.ZodEnum<{
            text: "text";
            pdf: "pdf";
            image: "image";
            audio: "audio";
            csv: "csv";
            markdown: "markdown";
            html: "html";
        }>;
        checksum: z.ZodString;
        originalFilename: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    query: z.ZodString;
    answer: z.ZodObject<{
        grounded: z.ZodBoolean;
        text: z.ZodString;
        citations: z.ZodArray<z.ZodObject<{
            chunkId: z.ZodString;
            documentId: z.ZodString;
            sectionId: z.ZodString;
            score: z.ZodNumber;
            source: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            offsets: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    index: z.ZodObject<{
        chunkCount: z.ZodNumber;
        embeddingProvider: z.ZodString;
        embeddingDimensions: z.ZodNumber;
        embeddingModel: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
    storage: z.ZodOptional<z.ZodObject<{
        persisted: z.ZodBoolean;
        indexPath: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    devMode: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
