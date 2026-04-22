import { describe, expect, it } from "vitest";
import type { NormalizedDocument } from "@groundedos/core";

import { chunkDocument } from "./chunking";

function createDocument(
  overrides: Partial<NormalizedDocument> = {}
): NormalizedDocument {
  return {
    documentId: "doc-1",
    title: "Chunking Test",
    modality: "text",
    content: {
      fullText: "First section.\n\nSecond section.",
      sections: [
        {
          id: "section-1",
          text: "First section.",
          startOffset: 0,
          endOffset: 14,
        },
        {
          id: "section-2",
          text: "Second section.",
          startOffset: 16,
          endOffset: 31,
        },
      ],
    },
    lineage: {
      sourceType: "upload",
      originalFilename: "sample.txt",
      mimeType: "text/plain",
      extractedAt: "2026-04-21T00:00:00.000Z",
      extractor: "text-extractor",
      extractorVersion: "0.1.0",
    },
    metadata: {},
    ...overrides,
  };
}

describe("chunkDocument", () => {
  it("creates one stable chunk for a short section", () => {
    const chunks = chunkDocument(createDocument(), {
      maxChunkChars: 100,
      overlapChars: 10,
    });

    expect(chunks[0]).toEqual({
      id: "doc-1:section-1:chunk-1",
      documentId: "doc-1",
      sectionId: "section-1",
      text: "First section.",
      startOffset: 0,
      endOffset: 14,
      metadata: {
        documentTitle: "Chunking Test",
        modality: "text",
        sectionHeading: undefined,
        page: undefined,
        sourceType: "upload",
        originalFilename: "sample.txt",
        chunkIndex: 1,
        sectionChunkIndex: 1,
        offsetBasis: "document",
      },
    });
  });

  it("splits long sections with deterministic overlap", () => {
    const chunks = chunkDocument(
      createDocument({
        content: {
          fullText: "abcdefghijklmnopqrstuvwxyz",
          sections: [
            {
              id: "section-1",
              text: "abcdefghijklmnopqrstuvwxyz",
              startOffset: 10,
              endOffset: 36,
            },
          ],
        },
      }),
      { maxChunkChars: 10, overlapChars: 3 }
    );

    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "abcdefghij",
      "hijklmnopq",
      "opqrstuvwx",
      "vwxyz",
    ]);
    expect(chunks.map((chunk) => [chunk.startOffset, chunk.endOffset])).toEqual([
      [10, 20],
      [17, 27],
      [24, 34],
      [31, 36],
    ]);
    expect(chunks.map((chunk) => chunk.id)).toEqual([
      "doc-1:section-1:chunk-1",
      "doc-1:section-1:chunk-2",
      "doc-1:section-1:chunk-3",
      "doc-1:section-1:chunk-4",
    ]);
  });

  it("preserves section metadata and ordering across multiple sections", () => {
    const chunks = chunkDocument(
      createDocument({
        modality: "pdf",
        content: {
          fullText: "PDF one\n\nPDF two",
          sections: [
            {
              id: "page-1",
              heading: "Page 1",
              text: "PDF one",
              page: 1,
              startOffset: 0,
              endOffset: 7,
            },
            {
              id: "page-2",
              heading: "Page 2",
              text: "PDF two",
              page: 2,
              startOffset: 9,
              endOffset: 16,
            },
          ],
        },
        lineage: {
          sourceType: "upload",
          originalFilename: "sample.pdf",
          mimeType: "application/pdf",
          extractedAt: "2026-04-21T00:00:00.000Z",
          extractor: "pdf-extractor",
          extractorVersion: "0.1.0",
        },
      }),
      { maxChunkChars: 100, overlapChars: 0 }
    );

    expect(chunks.map((chunk) => chunk.sectionId)).toEqual(["page-1", "page-2"]);
    expect(chunks.map((chunk) => chunk.metadata)).toMatchObject([
      {
        modality: "pdf",
        sectionHeading: "Page 1",
        page: 1,
        originalFilename: "sample.pdf",
        chunkIndex: 1,
        sectionChunkIndex: 1,
      },
      {
        modality: "pdf",
        sectionHeading: "Page 2",
        page: 2,
        originalFilename: "sample.pdf",
        chunkIndex: 2,
        sectionChunkIndex: 1,
      },
    ]);
  });

  it("ignores empty sections", () => {
    const chunks = chunkDocument(
      createDocument({
        content: {
          fullText: "Keep me",
          sections: [
            { id: "empty-1", text: "", startOffset: 0, endOffset: 0 },
            { id: "empty-2", text: "   \n\t", startOffset: 0, endOffset: 5 },
            { id: "section-1", text: "Keep me", startOffset: 0, endOffset: 7 },
          ],
        },
      }),
      { maxChunkChars: 100, overlapChars: 0 }
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.id).toBe("doc-1:section-1:chunk-1");
  });

  it("uses section-relative offsets when section startOffset is missing", () => {
    const chunks = chunkDocument(
      createDocument({
        content: {
          fullText: "Unknown offset section",
          sections: [
            {
              id: "section-1",
              text: "  Unknown offset section  ",
            },
          ],
        },
      }),
      { maxChunkChars: 100, overlapChars: 0 }
    );

    expect(chunks[0]).toMatchObject({
      text: "Unknown offset section",
      startOffset: 2,
      endOffset: 24,
      metadata: {
        offsetBasis: "section",
      },
    });
  });

  it("trims chunk text and adjusts offsets to the emitted text", () => {
    const chunks = chunkDocument(
      createDocument({
        content: {
          fullText: "  First chunk   Second chunk  ",
          sections: [
            {
              id: "section-1",
              text: "  First chunk   Second chunk  ",
              startOffset: 20,
              endOffset: 50,
            },
          ],
        },
      }),
      { maxChunkChars: 16, overlapChars: 0 }
    );

    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "First chunk",
      "Second chunk",
    ]);
    expect(chunks.map((chunk) => [chunk.startOffset, chunk.endOffset])).toEqual([
      [22, 33],
      [36, 48],
    ]);
  });

  it("rejects invalid chunking options", () => {
    const doc = createDocument();

    expect(() => chunkDocument(doc, { maxChunkChars: 0 })).toThrow(
      "[rag/chunking] maxChunkChars must be a positive integer."
    );
    expect(() => chunkDocument(doc, { maxChunkChars: 1.5 })).toThrow(
      "[rag/chunking] maxChunkChars must be a positive integer."
    );
    expect(() => chunkDocument(doc, { overlapChars: -1 })).toThrow(
      "[rag/chunking] overlapChars must be an integer greater than or equal to 0."
    );
    expect(() => chunkDocument(doc, { maxChunkChars: 10, overlapChars: 10 })).toThrow(
      "[rag/chunking] overlapChars must be smaller than maxChunkChars."
    );
  });
});
