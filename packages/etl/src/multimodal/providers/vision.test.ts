import { describe, expect, it, vi } from "vitest";

import { OllamaVisionProvider } from "./vision";

const IMAGE = {
  assetId: "asset-1",
  sourceDocumentId: "doc-1",
  pageNumber: 2,
  mimeType: "image/png",
  extractedPath: "/tmp/asset-1.png",
  extractionMethod: "embedded" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
};

describe("OllamaVisionProvider", () => {
  it("sends the image as base64 to Ollama chat and parses the JSON description", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            shortCaption: "Bar chart of quarterly revenue",
            detailedDescription: "A bar chart showing revenue growth across four quarters.",
            detectedObjects: ["chart", "axis-labels"],
            detectedTextSummary: "Q1 Q2 Q3 Q4",
            diagramType: "bar-chart",
            tableLikeStructure: false,
          }),
        },
      }),
    });
    const readFileFn = vi.fn().mockResolvedValue(Buffer.from("fake-png-bytes"));

    const provider = new OllamaVisionProvider({
      fetchFn: fetchFn as unknown as typeof fetch,
      readFileFn,
    });

    const result = await provider.describe(IMAGE);

    expect(result.shortCaption).toBe("Bar chart of quarterly revenue");
    expect(result.diagramType).toBe("bar-chart");
    expect(result.detectedObjects).toEqual(["chart", "axis-labels"]);
    expect(result.provider).toBe("ollama-vision");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].images[0]).toBe(Buffer.from("fake-png-bytes").toString("base64"));
  });

  it("falls back to a plain-text description when the model doesn't return JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "A diagram of a network topology." } }),
    });
    const readFileFn = vi.fn().mockResolvedValue(Buffer.from("bytes"));

    const provider = new OllamaVisionProvider({
      fetchFn: fetchFn as unknown as typeof fetch,
      readFileFn,
    });

    const result = await provider.describe(IMAGE);

    expect(result.detailedDescription).toBe("A diagram of a network topology.");
    expect(result.shortCaption.length).toBeGreaterThan(0);
  });

  it("throws a clear error when the ollama response is not ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const readFileFn = vi.fn().mockResolvedValue(Buffer.from("bytes"));
    const provider = new OllamaVisionProvider({
      fetchFn: fetchFn as unknown as typeof fetch,
      readFileFn,
    });

    await expect(provider.describe(IMAGE)).rejects.toThrow(/ollama vision request failed with status 500/);
  });
});
