import { describe, it, expect } from "vitest";
import {
  ContractViolationError,
  validateNormalizedDocument,
  validateRetrievalChunk,
  validateEmbeddedChunk,
  validateProcessedQuery,
  validateRetrievalChunks,
} from "./index";
import type { NormalizedDocument } from "../types/document";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validNormalizedDoc: NormalizedDocument = {
  documentId: "doc-001",
  title: "Test Document",
  modality: "text",
  content: {
    fullText: "Hello world",
    sections: [
      {
        id: "section-1",
        text: "Hello world",
      },
    ],
  },
  lineage: {
    sourceType: "manual",
    mimeType: "text/plain",
    extractedAt: "2026-01-01T00:00:00Z",
    extractor: "text-extractor",
  },
  metadata: {},
};

const validRetrievalChunk = {
  id: "doc-001:section-1:chunk-1",
  documentId: "doc-001",
  sectionId: "section-1",
  text: "Hello world",
  startOffset: 0,
  endOffset: 11,
  metadata: {
    documentTitle: "Test Document",
    modality: "text",
    sourceType: "manual",
    chunkIndex: 1,
    sectionChunkIndex: 1,
    offsetBasis: "section",
  },
};

const validEmbeddedChunk = {
  ...validRetrievalChunk,
  embedding: [0.1, 0.2, 0.3, 0.4],
  embeddingMetadata: {
    provider: "api-lexical",
    model: "api-lexical-v1",
    dimensions: 4,
    normalized: true,
  },
};

// ---------------------------------------------------------------------------
// NormalizedDocument
// ---------------------------------------------------------------------------

describe("validateNormalizedDocument", () => {
  it("accepts a valid NormalizedDocument", () => {
    expect(() => validateNormalizedDocument(validNormalizedDoc)).not.toThrow();
    const result = validateNormalizedDocument(validNormalizedDoc);
    expect(result.documentId).toBe("doc-001");
  });

  it("throws ContractViolationError when documentId is missing", () => {
    const input = { ...validNormalizedDoc, documentId: undefined };
    expect(() => validateNormalizedDocument(input)).toThrow(ContractViolationError);

    try {
      validateNormalizedDocument(input);
    } catch (err) {
      expect(err).toBeInstanceOf(ContractViolationError);
      expect((err as ContractViolationError).contract).toBe("NormalizedDocument");
      expect((err as ContractViolationError).field).toContain("documentId");
    }
  });

  it("throws ContractViolationError when title is missing", () => {
    const input = { ...validNormalizedDoc, title: undefined };
    expect(() => validateNormalizedDocument(input)).toThrow(ContractViolationError);
  });

  it("throws ContractViolationError when modality is invalid", () => {
    const input = { ...validNormalizedDoc, modality: "video" };
    expect(() => validateNormalizedDocument(input)).toThrow(ContractViolationError);
  });

  it("throws ContractViolationError when content.sections is not an array", () => {
    const input = {
      ...validNormalizedDoc,
      content: { fullText: "hello", sections: "not-an-array" },
    };
    expect(() => validateNormalizedDocument(input)).toThrow(ContractViolationError);
  });

  it("throws ContractViolationError when lineage.extractedAt is missing", () => {
    const input = {
      ...validNormalizedDoc,
      lineage: { ...validNormalizedDoc.lineage, extractedAt: undefined },
    };
    expect(() => validateNormalizedDocument(input)).toThrow(ContractViolationError);
  });

  it("throws ContractViolationError when the input is not an object", () => {
    expect(() => validateNormalizedDocument("not-an-object")).toThrow(ContractViolationError);
    expect(() => validateNormalizedDocument(null)).toThrow(ContractViolationError);
    expect(() => validateNormalizedDocument(42)).toThrow(ContractViolationError);
  });
});

// ---------------------------------------------------------------------------
// RetrievalChunk
// ---------------------------------------------------------------------------

describe("validateRetrievalChunk", () => {
  it("accepts a valid RetrievalChunk", () => {
    expect(() => validateRetrievalChunk(validRetrievalChunk)).not.toThrow();
  });

  it("throws ContractViolationError when id is missing", () => {
    const input = { ...validRetrievalChunk, id: undefined };
    expect(() => validateRetrievalChunk(input)).toThrow(ContractViolationError);

    try {
      validateRetrievalChunk(input);
    } catch (err) {
      expect((err as ContractViolationError).field).toContain("id");
    }
  });

  it("throws ContractViolationError when startOffset is negative", () => {
    const input = { ...validRetrievalChunk, startOffset: -1 };
    expect(() => validateRetrievalChunk(input)).toThrow(ContractViolationError);
  });

  it("throws ContractViolationError when metadata.modality is invalid", () => {
    const input = {
      ...validRetrievalChunk,
      metadata: { ...validRetrievalChunk.metadata, modality: "video" },
    };
    expect(() => validateRetrievalChunk(input)).toThrow(ContractViolationError);
  });
});

// ---------------------------------------------------------------------------
// EmbeddedChunk
// ---------------------------------------------------------------------------

describe("validateEmbeddedChunk", () => {
  it("accepts a valid EmbeddedChunk", () => {
    expect(() => validateEmbeddedChunk(validEmbeddedChunk)).not.toThrow();
  });

  it("throws ContractViolationError when embedding is missing", () => {
    const input = { ...validEmbeddedChunk, embedding: undefined };
    expect(() => validateEmbeddedChunk(input)).toThrow(ContractViolationError);
  });

  it("throws ContractViolationError when embeddingMetadata.dimensions is zero", () => {
    const input = {
      ...validEmbeddedChunk,
      embeddingMetadata: { ...validEmbeddedChunk.embeddingMetadata, dimensions: 0 },
    };
    expect(() => validateEmbeddedChunk(input)).toThrow(ContractViolationError);
  });
});

// ---------------------------------------------------------------------------
// ProcessedQuery
// ---------------------------------------------------------------------------

describe("validateProcessedQuery", () => {
  it("accepts a valid ProcessedQuery", () => {
    const input = {
      original: "What is RAG?",
      rewritten: "What is retrieval augmented generation?",
      expanded: ["retrieval augmented generation", "rag", "retrieval"],
      intent: "factual",
      confidence: 0.9,
    };
    expect(() => validateProcessedQuery(input)).not.toThrow();
  });

  it("throws when intent is not a valid QueryIntent", () => {
    const input = {
      original: "test",
      expanded: [],
      intent: "random-intent",
      confidence: 0.5,
    };
    expect(() => validateProcessedQuery(input)).toThrow(ContractViolationError);
  });

  it("throws when confidence is out of range", () => {
    const input = {
      original: "test",
      expanded: [],
      intent: "factual",
      confidence: 1.5,
    };
    expect(() => validateProcessedQuery(input)).toThrow(ContractViolationError);
  });
});

// ---------------------------------------------------------------------------
// validateRetrievalChunks (array validator)
// ---------------------------------------------------------------------------

describe("validateRetrievalChunks", () => {
  it("accepts an empty array", () => {
    expect(() => validateRetrievalChunks([])).not.toThrow();
    expect(validateRetrievalChunks([])).toEqual([]);
  });

  it("accepts an array of valid chunks", () => {
    expect(() => validateRetrievalChunks([validRetrievalChunk])).not.toThrow();
  });

  it("throws ContractViolationError if the input is not an array", () => {
    expect(() => validateRetrievalChunks("not-an-array")).toThrow(ContractViolationError);
  });

  it("throws ContractViolationError with index info when an item is invalid", () => {
    const invalid = { ...validRetrievalChunk, id: undefined };

    try {
      validateRetrievalChunks([validRetrievalChunk, invalid]);
    } catch (err) {
      expect(err).toBeInstanceOf(ContractViolationError);
      expect((err as ContractViolationError).field).toContain("[1]");
    }
  });
});
