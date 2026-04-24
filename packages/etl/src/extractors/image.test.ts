import { describe, expect, it } from "vitest";

import { ImageExtractor } from "./image";

describe("ImageExtractor", () => {
  it("declares the image modality", () => {
    const extractor = new ImageExtractor();

    expect(extractor.supportedModalities).toEqual(["image"]);
  });

  it("throws a NOT_IMPLEMENTED error when extract is called", async () => {
    const extractor = new ImageExtractor();

    await expect(
      extractor.extract({ type: "image", filePath: "/fake/image.png" })
    ).rejects.toThrow(
      "[image-extractor] NOT_IMPLEMENTED — Image extraction (OCR / captioning) is planned for Phase 1."
    );
  });

  it("throws for any kind of input since the stub is not yet implemented", async () => {
    const extractor = new ImageExtractor();

    await expect(
      extractor.extract({ type: "image", url: "https://example.com/photo.jpg" })
    ).rejects.toThrow("[image-extractor] NOT_IMPLEMENTED");
  });
});
