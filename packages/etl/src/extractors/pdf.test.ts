import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { createSimplePdfBuffer } from "../../test-fixtures/pdf";
import { PdfExtractor } from "./pdf";

describe("PdfExtractor", () => {
  it("extracts text from a local PDF file into page sections with lineage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-pdf-"));
    const filePath = join(dir, "sample.pdf");

    try {
      await writeFile(
        filePath,
        createSimplePdfBuffer([
          "GroundedOS PDF smoke test.",
          "Second PDF section.",
        ])
      );

      const doc = await new PdfExtractor().extract({
        type: "pdf",
        filePath,
        metadata: {
          documentId: "doc-pdf",
          title: "Sample PDF",
          language: "en",
        },
      });

      expect(doc).toMatchObject({
        documentId: "doc-pdf",
        title: "Sample PDF",
        modality: "pdf",
        language: "en",
        lineage: {
          sourceType: "upload",
          originalFilename: "sample.pdf",
          mimeType: "application/pdf",
          extractor: "pdf-extractor",
          extractorVersion: "0.1.0",
        },
        metadata: {
          documentId: "doc-pdf",
          title: "Sample PDF",
          language: "en",
          pageCount: 1,
        },
      });
      expect(doc.lineage.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(doc.content.fullText).toContain("GroundedOS PDF smoke test.");
      expect(doc.content.fullText).toContain("Second PDF section.");
      const expectedPageText =
        "GroundedOS PDF smoke test.\nSecond PDF section.";
      expect(doc.content.sections).toEqual([
        {
          id: "page-1",
          heading: "Page 1",
          text: expectedPageText,
          page: 1,
          startOffset: 0,
          endOffset: expectedPageText.length,
        },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing file path and URL", async () => {
    await expect(
      new PdfExtractor().extract({
        type: "pdf",
      })
    ).rejects.toThrow("Either 'filePath' or 'url' must be provided");
  });

  it("uses file path precedence when both file path and URL are provided", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-pdf-precedence-"));
    const filePath = join(dir, "local.pdf");

    try {
      await writeFile(filePath, createSimplePdfBuffer(["Local PDF wins."]));

      const doc = await new PdfExtractor().extract({
        type: "pdf",
        filePath,
        url: "https://example.com/remote.pdf",
        metadata: {
          documentId: "doc-precedence",
        },
      });

      expect(doc.lineage.sourceType).toBe("upload");
      expect(doc.lineage.originalFilename).toBe("local.pdf");
      expect(doc.content.fullText).toBe("Local PDF wins.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported modalities", async () => {
    await expect(
      new PdfExtractor().extract({
        type: "text",
        content: "not a pdf input",
      })
    ).rejects.toThrow('PdfExtractor only handles "pdf"');
  });
});
