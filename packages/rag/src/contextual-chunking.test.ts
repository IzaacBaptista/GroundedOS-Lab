import { describe, expect, it, vi } from "vitest";
import { annotateChunksWithContext, buildChunkContext, contextualizedChunkText } from "./contextual-chunking";
import type { RetrievalChunk } from "./chunking";
import type { LlmTextProvider, LlmTextRequest } from "./llm-text-provider";

function makeChunk(overrides: Partial<RetrievalChunk> = {}): RetrievalChunk {
  return {
    id: "doc-1:section-1:chunk-1",
    documentId: "doc-1",
    sectionId: "section-1",
    text: "Revenue grew 3% versus last quarter.",
    startOffset: 0,
    endOffset: 37,
    metadata: {
      documentTitle: "Q2 report",
      modality: "text",
      sourceType: "manual",
      chunkIndex: 1,
      sectionChunkIndex: 1,
      offsetBasis: "document",
    },
    ...overrides,
  };
}

function fakeProvider(response: string | (() => Promise<string>)): LlmTextProvider {
  return {
    id: "fake",
    async complete() {
      return typeof response === "string" ? response : response();
    },
  };
}

describe("buildChunkContext (book cap. 21, contextual chunks)", () => {
  it("sends the full document and the chunk's own text to the LLM", async () => {
    const complete = vi.fn(async (_request: LlmTextRequest) => "This is Acme Corp's Q2 2023 revenue section.");
    const provider: LlmTextProvider = { id: "spy", complete };
    const chunk = makeChunk();

    const context = await buildChunkContext(chunk, "Acme Corp Q2 2023 report. Revenue grew 3%...", provider);

    expect(context).toBe("This is Acme Corp's Q2 2023 revenue section.");
    const request = complete.mock.calls[0]![0]!;
    expect(request.user).toContain("Acme Corp Q2 2023 report");
    expect(request.user).toContain(chunk.text);
  });
});

describe("annotateChunksWithContext", () => {
  it("attaches metadata.context to every chunk", async () => {
    const provider = fakeProvider("Acme Corp Q2 revenue.");
    const chunks = [makeChunk({ id: "a" }), makeChunk({ id: "b" })];

    const annotated = await annotateChunksWithContext(chunks, "full doc text", provider);

    expect(annotated.map((c) => c.metadata.context)).toEqual([
      "Acme Corp Q2 revenue.",
      "Acme Corp Q2 revenue.",
    ]);
    // chunk.text itself is untouched — the blurb lives only in metadata.
    expect(annotated[0]!.text).toBe(chunks[0]!.text);
  });

  it("leaves context unset for a chunk whose LLM call fails, without failing the batch", async () => {
    const provider = fakeProvider(() => Promise.reject(new Error("boom")));
    const chunks = [makeChunk({ id: "a" })];

    const annotated = await annotateChunksWithContext(chunks, "full doc text", provider);

    expect(annotated[0]!.metadata.context).toBeUndefined();
    expect(annotated[0]!.text).toBe(chunks[0]!.text);
  });
});

describe("contextualizedChunkText", () => {
  it("prepends context when present", () => {
    const chunk = makeChunk({ metadata: { ...makeChunk().metadata, context: "Acme Corp Q2 revenue." } });
    expect(contextualizedChunkText(chunk)).toBe(`Acme Corp Q2 revenue.\n\n${chunk.text}`);
  });

  it("returns the chunk text unchanged when no context was generated", () => {
    const chunk = makeChunk();
    expect(contextualizedChunkText(chunk)).toBe(chunk.text);
  });
});
