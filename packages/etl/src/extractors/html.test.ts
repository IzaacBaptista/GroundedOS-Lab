import { describe, expect, it } from "vitest";

import { HtmlExtractor } from "./html";

describe("HtmlExtractor", () => {
  it("strips tags and produces plain-text content", async () => {
    const extractor = new HtmlExtractor();

    const doc = await extractor.extract({
      type: "html",
      content: "<html><body><p>Hello <b>world</b></p></body></html>",
      metadata: { documentId: "doc-html-1" },
    });

    expect(doc.documentId).toBe("doc-html-1");
    expect(doc.modality).toBe("html");
    expect(doc.lineage.mimeType).toBe("text/html");
    expect(doc.content.fullText).toBe("Hello world");
  });

  it("drops script and style content entirely", async () => {
    const extractor = new HtmlExtractor();

    const doc = await extractor.extract({
      type: "html",
      content:
        "<style>.x{color:red}</style><p>Visible</p><script>alert('x')</script>",
    });

    expect(doc.content.fullText).toBe("Visible");
  });

  it("uses the <title> tag as the document title when metadata has none", async () => {
    const extractor = new HtmlExtractor();

    const doc = await extractor.extract({
      type: "html",
      content: "<html><head><title>Page Title</title></head><body><p>Body</p></body></html>",
    });

    expect(doc.title).toBe("Page Title");
  });

  it("throws for unsupported modalities", async () => {
    const extractor = new HtmlExtractor();

    await expect(
      extractor.extract({ type: "text", content: "x" })
    ).rejects.toThrow('Unsupported modality "text"');
  });
});
