import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { TextExtractor } from "./text";

describe("TextExtractor", () => {
  it("normalizes inline text into paragraph sections with lineage", async () => {
    const extractor = new TextExtractor();

    const doc = await extractor.extract({
      type: "text",
      content: "  First paragraph.  \n\nSecond paragraph.\n\n\nThird paragraph. ",
      metadata: {
        documentId: "doc-inline",
        title: "Inline note",
        language: "en",
        tags: ["smoke"],
      },
    });

    expect(doc).toMatchObject({
      documentId: "doc-inline",
      title: "Inline note",
      modality: "text",
      language: "en",
      lineage: {
        sourceType: "manual",
        mimeType: "text/plain",
        extractor: "text-extractor",
        extractorVersion: "0.1.0",
      },
      metadata: {
        documentId: "doc-inline",
        title: "Inline note",
        language: "en",
        tags: ["smoke"],
      },
    });
    expect(doc.content.fullText).toContain("First paragraph.");
    expect(doc.content.sections.map((section) => section.text)).toEqual([
      "First paragraph.",
      "Second paragraph.",
      "Third paragraph.",
    ]);
    expect(doc.content.sections[0]).toMatchObject({
      id: "section-1",
      startOffset: 2,
      endOffset: 18,
    });
    expect(doc.lineage.extractedAt).toEqual(expect.any(String));
  });

  it("reads text from a file path and derives filename metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-text-"));
    const filePath = join(dir, "sample.txt");

    try {
      await writeFile(filePath, "From file\n\nSecond section", "utf-8");

      const doc = await new TextExtractor().extract({
        type: "text",
        filePath,
        metadata: {
          documentId: "doc-file",
        },
      });

      expect(doc.title).toBe("sample.txt");
      expect(doc.lineage.sourceType).toBe("upload");
      expect(doc.lineage.originalFilename).toBe("sample.txt");
      expect(doc.content.sections.map((section) => section.text)).toEqual([
        "From file",
        "Second section",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing content and file path", async () => {
    await expect(
      new TextExtractor().extract({
        type: "text",
      })
    ).rejects.toThrow("Either 'content' or 'filePath' must be provided");
  });

  it("rejects unsupported modalities", async () => {
    await expect(
      new TextExtractor().extract({
        type: "pdf",
        content: "not a text input",
      })
    ).rejects.toThrow('TextExtractor only handles "text"');
  });
});
