import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { ImageExtractor } from "./image";

describe("ImageExtractor", () => {
  it("extracts OCR + description text and multimodal metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-image-"));
    const filePath = join(dir, "sample.png");

    try {
      await writeFile(filePath, Buffer.from("fake-image-binary"));

      const doc = await new ImageExtractor().extract({
        type: "image",
        filePath,
        metadata: {
          documentId: "doc-image-1",
          title: "Sample Image",
          mimeType: "image/png",
        },
      });

      expect(doc.documentId).toBe("doc-image-1");
      expect(doc.title).toBe("Sample Image");
      expect(doc.modality).toBe("image");
      expect(doc.lineage.extractor).toBe("image-extractor");
      expect(doc.content.fullText).toContain("OCR extracted text");
      expect(doc.content.fullText).toContain("Image extracted from page");

      const multimodal = (doc.metadata.multimodal ?? {}) as Record<string, unknown>;
      expect(Array.isArray(multimodal.assets)).toBe(true);
      expect(Array.isArray(multimodal.ocrResults)).toBe(true);
      expect(Array.isArray(multimodal.imageDescriptions)).toBe(true);
      expect(Array.isArray(multimodal.chunks)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
