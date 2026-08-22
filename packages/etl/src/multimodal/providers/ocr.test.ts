import { describe, expect, it, vi } from "vitest";

import { TesseractOcrProvider } from "./ocr";

const IMAGE = {
  assetId: "asset-1",
  sourceDocumentId: "doc-1",
  pageNumber: 3,
  mimeType: "image/png",
  extractedPath: "/tmp/asset-1.png",
  extractionMethod: "embedded" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
};

describe("TesseractOcrProvider", () => {
  it("runs real recognition via the injected recognizer and maps the result", async () => {
    const recognizeFn = vi.fn().mockResolvedValue({ text: "Invoice #4471\nTotal: $120.00", confidence: 88 });

    const provider = new TesseractOcrProvider({ recognizeFn });
    const result = await provider.recognize(IMAGE);

    expect(recognizeFn).toHaveBeenCalledWith("/tmp/asset-1.png", "eng");
    expect(result.text).toBe("Invoice #4471\nTotal: $120.00");
    expect(result.confidence).toBeCloseTo(0.88);
    expect(result.provider).toBe("tesseract-ocr");
    expect(result.pageNumber).toBe(3);
  });

  it("uses the configured language", async () => {
    const recognizeFn = vi.fn().mockResolvedValue({ text: "Olá mundo", confidence: 90 });
    const provider = new TesseractOcrProvider({ language: "por", recognizeFn });

    await provider.recognize(IMAGE);

    expect(recognizeFn).toHaveBeenCalledWith("/tmp/asset-1.png", "por");
  });

  it("propagates recognizer errors", async () => {
    const recognizeFn = vi.fn().mockRejectedValue(new Error("worker crashed"));
    const provider = new TesseractOcrProvider({ recognizeFn });

    await expect(provider.recognize(IMAGE)).rejects.toThrow("worker crashed");
  });
});
