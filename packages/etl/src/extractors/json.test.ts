import { describe, expect, it } from "vitest";

import { JsonExtractor } from "./json";

describe("JsonExtractor", () => {
  it("splits a top-level object into one section per key, preserving hierarchy", async () => {
    const extractor = new JsonExtractor();

    const doc = await extractor.extract({
      type: "json",
      content: JSON.stringify({
        customer: { name: "Ada", address: { city: "London" } },
        orders: [{ id: 1 }, { id: 2 }],
      }),
      metadata: { documentId: "doc-json-1" },
    });

    expect(doc.documentId).toBe("doc-json-1");
    expect(doc.modality).toBe("json");
    expect(doc.lineage.mimeType).toBe("application/json");
    expect(doc.content.sections).toHaveLength(2);
    expect(doc.content.sections[0]).toMatchObject({ heading: "customer" });
    expect(doc.content.sections[0]?.text).toContain("name: Ada");
    expect(doc.content.sections[0]?.text).toContain("address:");
    expect(doc.content.sections[1]?.text).toContain("- [0]");
  });

  it("wraps a non-object root (array/scalar) into a single 'root' section", async () => {
    const extractor = new JsonExtractor();

    const doc = await extractor.extract({
      type: "json",
      content: JSON.stringify([1, 2, 3]),
    });

    expect(doc.content.sections).toHaveLength(1);
    expect(doc.content.sections[0]?.heading).toBe("root");
  });

  it("throws a clear error for invalid JSON", async () => {
    const extractor = new JsonExtractor();

    await expect(extractor.extract({ type: "json", content: "{not valid" })).rejects.toThrow(
      /invalid JSON/i
    );
  });

  it("throws for unsupported modalities", async () => {
    const extractor = new JsonExtractor();

    await expect(extractor.extract({ type: "text", content: "x" })).rejects.toThrow(
      'Unsupported modality "text"'
    );
  });
});
