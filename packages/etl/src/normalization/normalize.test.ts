import { describe, expect, it } from "vitest";

import { normalizeDocument } from "./normalize";
import type { NormalizedDocument } from "@groundedos/core";

function makeDoc(sections: Array<{ id: string; text: string; page?: number }>): NormalizedDocument {
  const fullText = sections.map((s) => s.text).join("\n\n");
  return {
    documentId: "doc-1",
    title: "Test Doc",
    modality: "pdf",
    content: {
      fullText,
      sections: sections.map((s) => ({ id: s.id, text: s.text, page: s.page })),
    },
    lineage: {
      sourceType: "upload",
      mimeType: "application/pdf",
      extractedAt: "2024-01-01T00:00:00.000Z",
      extractor: "pdf-extractor",
    },
    metadata: {},
  };
}

describe("normalizeDocument", () => {
  it("collapses excessive whitespace and blank lines", () => {
    const doc = makeDoc([{ id: "s1", text: "Hello    world.\n\n\n\nSecond   line." }]);

    const { document } = normalizeDocument(doc);

    expect(document.content.sections[0]?.text).toBe("Hello world.\n\nSecond line.");
  });

  it("strips non-printable control characters", () => {
    const doc = makeDoc([{ id: "s1", text: "Clean\x00text\x0Bwith\x1Fcontrol chars" }]);

    const { document } = normalizeDocument(doc);

    expect(document.content.sections[0]?.text).toBe("Clean text with control chars");
  });

  it("removes a header line repeated across page sections", () => {
    const doc = makeDoc([
      { id: "p1", text: "ACME Corp Confidential\nIntroduction to the product.", page: 1 },
      { id: "p2", text: "ACME Corp Confidential\nDetails about pricing.", page: 2 },
      { id: "p3", text: "ACME Corp Confidential\nFinal remarks and summary.", page: 3 },
    ]);

    const { document, trace } = normalizeDocument(doc);

    expect(document.content.sections[0]?.text).toBe("Introduction to the product.");
    expect(document.content.sections[1]?.text).toBe("Details about pricing.");
    expect(trace.removedHeaderLines).toContain("ACME Corp Confidential");
  });

  it("removes a footer line repeated across page sections", () => {
    const doc = makeDoc([
      { id: "p1", text: "Introduction to the product.\nPage 1 of 3", page: 1 },
      { id: "p2", text: "Details about pricing.\nPage 2 of 3", page: 2 },
      { id: "p3", text: "Final remarks and summary.\nPage 3 of 3", page: 3 },
    ]);

    const { document, trace } = normalizeDocument(doc);

    expect(document.content.sections[0]?.text).toBe("Introduction to the product.");
    expect(trace.removedFooterLines.length).toBeGreaterThan(0);
  });

  it("does not strip repeated lines when there are too few sections", () => {
    const doc = makeDoc([
      { id: "p1", text: "ACME Corp Confidential\nIntro.", page: 1 },
      { id: "p2", text: "ACME Corp Confidential\nDetails.", page: 2 },
    ]);

    const { document } = normalizeDocument(doc, { minSectionsForHeaderFooterDetection: 3 });

    expect(document.content.sections[0]?.text).toContain("ACME Corp Confidential");
  });

  it("removes exact-duplicate sections, keeping the first occurrence", () => {
    const doc = makeDoc([
      { id: "s1", text: "The quick brown fox jumps over the lazy dog." },
      { id: "s2", text: "Something else entirely." },
      { id: "s3", text: "The quick brown fox jumps over the lazy dog." },
    ]);

    const { document, trace } = normalizeDocument(doc);

    expect(document.content.sections).toHaveLength(2);
    expect(document.content.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(trace.removedDuplicateSectionIds).toContain("s3");
  });

  it("repairs common mojibake encoding", () => {
    const doc = makeDoc([{ id: "s1", text: "CafÃ© and RÃ©sumÃ©" }]);

    const { document } = normalizeDocument(doc);

    expect(document.content.sections[0]?.text).toBe("Café and Résumé");
  });

  it("recomputes fullText and offsets after normalization", () => {
    const doc = makeDoc([
      { id: "s1", text: "First   section." },
      { id: "s2", text: "Second   section." },
    ]);

    const { document } = normalizeDocument(doc);

    expect(document.content.fullText).toBe("First section.\n\nSecond section.");
    const [first, second] = document.content.sections;
    expect(document.content.fullText.slice(first!.startOffset!, first!.endOffset!)).toBe(
      "First section."
    );
    expect(document.content.fullText.slice(second!.startOffset!, second!.endOffset!)).toBe(
      "Second section."
    );
  });
});
