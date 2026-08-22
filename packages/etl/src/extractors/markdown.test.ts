import { describe, expect, it } from "vitest";

import { MarkdownExtractor } from "./markdown";

describe("MarkdownExtractor", () => {
  it("splits sections by heading and keeps heading text", async () => {
    const extractor = new MarkdownExtractor();

    const doc = await extractor.extract({
      type: "markdown",
      content: "# Title\n\nIntro paragraph.\n\n## Section Two\n\nMore detail here.",
      metadata: { documentId: "doc-md-1" },
    });

    expect(doc.documentId).toBe("doc-md-1");
    expect(doc.modality).toBe("markdown");
    expect(doc.lineage.mimeType).toBe("text/markdown");
    expect(doc.content.sections).toHaveLength(2);
    expect(doc.content.sections[0]).toMatchObject({
      heading: "Title",
      text: "Intro paragraph.",
    });
    expect(doc.content.sections[1]).toMatchObject({
      heading: "Section Two",
      text: "More detail here.",
    });
  });

  it("derives the title from the first H1 heading when metadata has none", async () => {
    const extractor = new MarkdownExtractor();

    const doc = await extractor.extract({
      type: "markdown",
      content: "# My Doc Title\n\nBody text.",
    });

    expect(doc.title).toBe("My Doc Title");
  });

  it("throws for unsupported modalities", async () => {
    const extractor = new MarkdownExtractor();

    await expect(
      extractor.extract({ type: "text", content: "x" })
    ).rejects.toThrow('Unsupported modality "text"');
  });
});
