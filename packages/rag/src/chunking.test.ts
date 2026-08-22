import { describe, expect, it } from "vitest";
import type { NormalizedDocument } from "@groundedos/core";

import { chunkDocument, chunkDocumentWithParents } from "./chunking";

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

  it("propagates cap. 9 enrichment metadata (author/timestamp/tags/permissions/tenantId/relationships) onto chunks", () => {
    const chunks = chunkDocument(
      createDocument({
        metadata: {
          author: "Izaac Comze",
          timestamp: "2026-01-10T00:00:00.000Z",
          tags: ["policy", "hr"],
          permissions: ["role:qa"],
          tenantId: "tenant-42",
          relationships: [{ documentId: "doc-9", type: "supersedes" }],
        },
      }),
      { maxChunkChars: 100, overlapChars: 10 }
    );

    expect(chunks[0].metadata.author).toBe("Izaac Comze");
    expect(chunks[0].metadata.timestamp).toBe("2026-01-10T00:00:00.000Z");
    expect(chunks[0].metadata.tags).toEqual(["policy", "hr"]);
    expect(chunks[0].metadata.permissions).toEqual(["role:qa"]);
    expect(chunks[0].metadata.tenantId).toBe("tenant-42");
    expect(chunks[0].metadata.relationships).toEqual([
      { documentId: "doc-9", type: "supersedes" },
    ]);
  });

  it("leaves cap. 9 enrichment metadata undefined when the document has none", () => {
    const chunks = chunkDocument(createDocument(), {
      maxChunkChars: 100,
      overlapChars: 10,
    });

    expect(chunks[0].metadata.author).toBeUndefined();
    expect(chunks[0].metadata.tags).toBeUndefined();
    expect(chunks[0].metadata.permissions).toBeUndefined();
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

  it("does not split a function body in the middle for recognized code files", () => {
    const code = [
      "function alpha() {",
      "  return 1;",
      "}",
      "",
      "function beta() {",
      "  const x = 1;",
      "",
      "  return x;",
      "}",
      "",
      "class Gamma {",
      "  method() {",
      "    return true;",
      "  }",
      "}",
    ].join("\n");

    const doc = createDocument({
      content: {
        fullText: code,
        sections: [{ id: "section-1", text: code, startOffset: 0, endOffset: code.length }],
      },
      lineage: {
        sourceType: "upload",
        originalFilename: "sample.ts",
        mimeType: "text/plain",
        extractedAt: "2026-04-21T00:00:00.000Z",
        extractor: "text-extractor",
        extractorVersion: "0.1.0",
      },
    });

    const chunks = chunkDocument(doc, { maxChunkChars: 60, overlapChars: 0 });

    const betaChunk = chunks.find((c) => c.text.includes("function beta"));
    expect(betaChunk?.text).toContain("const x = 1;");
    expect(betaChunk?.text).toContain("return x;");

    const gammaChunk = chunks.find((c) => c.text.includes("class Gamma"));
    expect(gammaChunk?.text).toContain("method() {");
    expect(gammaChunk?.text).toContain("return true;");

    expect(chunks.some((c) => c.text.includes("function alpha"))).toBe(true);
  });

  it("falls back to fixed-size slicing for non-code files even with blank-line-separated blocks", () => {
    const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
    const doc = createDocument({
      content: {
        fullText: text,
        sections: [{ id: "section-1", text, startOffset: 0, endOffset: text.length }],
      },
    });

    const chunks = chunkDocument(doc, { maxChunkChars: 20, overlapChars: 0 });

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("adjusts the chunk boundary to the nearest whitespace instead of cutting a word in half", () => {
    const text = "aaaaaaaaaa bbbbbbbbbb cccccccccc";
    const doc = createDocument({
      content: {
        fullText: text,
        sections: [{ id: "section-1", text, startOffset: 0, endOffset: text.length }],
      },
    });

    const chunks = chunkDocument(doc, { maxChunkChars: 15, overlapChars: 0 });

    expect(chunks.map((c) => c.text)).toEqual(["aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc"]);
  });

  describe("strategy: recursive", () => {
    it("packs whole paragraphs together instead of cutting mid-paragraph", () => {
      const text = "Alpha paragraph is short.\n\nBeta paragraph is short too.\n\nGamma paragraph also short.";
      const doc = createDocument({
        content: {
          fullText: text,
          sections: [{ id: "section-1", text, startOffset: 0, endOffset: text.length }],
        },
      });

      const chunks = chunkDocument(doc, {
        maxChunkChars: 60,
        overlapChars: 0,
        strategy: "recursive",
      });

      for (const chunk of chunks) {
        expect(chunk.text.endsWith(".")).toBe(true);
        expect(chunk.text.startsWith("Alpha") || chunk.text.startsWith("Beta") || chunk.text.startsWith("Gamma")).toBe(
          true
        );
      }
      expect(chunks.some((c) => c.text.includes("Alpha") && c.text.includes("Beta"))).toBe(true);
    });

    it("recurses into sentence splitting when a single paragraph exceeds maxChunkChars", () => {
      const text = "First sentence here. Second sentence here. Third sentence here.";
      const doc = createDocument({
        content: {
          fullText: text,
          sections: [{ id: "section-1", text, startOffset: 0, endOffset: text.length }],
        },
      });

      const chunks = chunkDocument(doc, {
        maxChunkChars: 30,
        overlapChars: 0,
        strategy: "recursive",
      });

      for (const chunk of chunks) {
        expect(chunk.text.trim().endsWith(".")).toBe(true);
      }
    });
  });

  describe("strategy: sentence", () => {
    it("never splits a sentence across chunks", () => {
      const text = "Sentence one is short. Sentence two is also short. Sentence three too.";
      const doc = createDocument({
        content: {
          fullText: text,
          sections: [{ id: "section-1", text, startOffset: 0, endOffset: text.length }],
        },
      });

      const chunks = chunkDocument(doc, {
        maxChunkChars: 35,
        overlapChars: 0,
        strategy: "sentence",
      });

      for (const chunk of chunks) {
        expect(chunk.text.trim().endsWith(".")).toBe(true);
      }
      expect(chunks.join(" ")).not.toBe("");
    });
  });

  describe("chunkDocumentWithParents", () => {
    it("returns child chunks carrying a parentChunkId that resolves to the full section text", () => {
      const doc = createDocument();

      const { chunks, parents } = chunkDocumentWithParents(doc, {
        maxChunkChars: 5,
        overlapChars: 0,
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(parents).toHaveLength(2);

      const parentIds = new Set(parents.map((p) => p.id));
      for (const chunk of chunks) {
        expect(parentIds.has(chunk.parentChunkId)).toBe(true);
      }

      const parentForFirstSection = parents.find((p) => p.sectionId === "section-1");
      expect(parentForFirstSection?.text).toBe("First section.");
    });
  });
});
