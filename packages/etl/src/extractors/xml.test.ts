import { describe, expect, it } from "vitest";

import { XmlExtractor } from "./xml";

describe("XmlExtractor", () => {
  it("splits the root element's children into one section per tag, preserving hierarchy", async () => {
    const extractor = new XmlExtractor();

    const doc = await extractor.extract({
      type: "xml",
      content:
        "<order><customer><name>Ada</name></customer><items><item>Widget</item><item>Gadget</item></items></order>",
      metadata: { documentId: "doc-xml-1" },
    });

    expect(doc.documentId).toBe("doc-xml-1");
    expect(doc.modality).toBe("xml");
    expect(doc.lineage.mimeType).toBe("application/xml");
    expect(doc.content.sections.map((s) => s.heading)).toEqual(["customer", "items"]);
    expect(doc.content.sections[0]?.text).toContain("name: Ada");
  });

  it("throws a clear error for malformed XML", async () => {
    const extractor = new XmlExtractor();

    await expect(
      extractor.extract({ type: "xml", content: "<order><customer></order>" })
    ).rejects.toThrow(/invalid XML/i);
  });

  it("throws for unsupported modalities", async () => {
    const extractor = new XmlExtractor();

    await expect(extractor.extract({ type: "text", content: "x" })).rejects.toThrow(
      'Unsupported modality "text"'
    );
  });
});
