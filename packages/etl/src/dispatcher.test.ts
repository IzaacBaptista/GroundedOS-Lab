import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { ingest } from "./dispatcher";
import { createSimplePdfBuffer } from "../test-fixtures/pdf";
import type { IngestionInput } from "@groundedos/core";

describe("ingest", () => {
  it("routes text input to the text extractor", async () => {
    const doc = await ingest({
      type: "text",
      content: "Intro\n\nDetails",
      metadata: {
        documentId: "doc-1",
        title: "Dispatcher test",
      },
    });

    expect(doc.documentId).toBe("doc-1");
    expect(doc.title).toBe("Dispatcher test");
    expect(doc.modality).toBe("text");
    expect(doc.content.sections).toHaveLength(2);
    expect(doc.content.sections.map((section) => section.text)).toEqual([
      "Intro",
      "Details",
    ]);
  });

  it("throws a clear error when no extractor is registered", async () => {
    const input = {
      type: "csv",
      content: "id,name\n1,Ada",
    } as IngestionInput;

    await expect(ingest(input)).rejects.toThrow(
      'No extractor registered for modality "csv"'
    );
  });

  it("routes PDF file input to the PDF extractor", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-dispatcher-pdf-"));
    const filePath = join(dir, "sample.pdf");

    try {
      await writeFile(
        filePath,
        createSimplePdfBuffer(["Dispatcher PDF test."])
      );

      const doc = await ingest({
        type: "pdf",
        filePath,
        metadata: {
          documentId: "doc-dispatcher-pdf",
          title: "Dispatcher PDF",
        },
      });

      expect(doc.documentId).toBe("doc-dispatcher-pdf");
      expect(doc.title).toBe("Dispatcher PDF");
      expect(doc.modality).toBe("pdf");
      expect(doc.content.sections).toHaveLength(1);
      expect(doc.content.sections[0]?.text).toBe("Dispatcher PDF test.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("routes image input to multimodal image extractor", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-dispatcher-image-"));
    const filePath = join(dir, "sample.png");

    try {
      await writeFile(filePath, Buffer.from("image"));
      const doc = await ingest({
        type: "image",
        filePath,
        metadata: {
          documentId: "doc-image-dispatcher",
        },
      });

      expect(doc.documentId).toBe("doc-image-dispatcher");
      expect(doc.modality).toBe("image");
      expect(doc.content.fullText).toContain("OCR extracted text");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("routes audio input to transcription extractor", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-dispatcher-audio-"));
    const filePath = join(dir, "sample.mp3");

    try {
      await writeFile(filePath, Buffer.from("audio"));
      const doc = await ingest({
        type: "audio",
        filePath,
        metadata: {
          documentId: "doc-audio-dispatcher",
        },
      });

      expect(doc.documentId).toBe("doc-audio-dispatcher");
      expect(doc.modality).toBe("audio");
      expect(doc.content.fullText).toContain("Transcribed content");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
