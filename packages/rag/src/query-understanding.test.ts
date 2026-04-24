import { describe, it, expect } from "vitest";
import {
  detectIntent,
  expandQuery,
  processQuery,
  rewriteQuery,
} from "./query-understanding";

// ---------------------------------------------------------------------------
// rewriteQuery
// ---------------------------------------------------------------------------

describe("rewriteQuery", () => {
  it("returns undefined when rewriting produces the same result as the original", () => {
    // A query of purely meaningful words won't be shortened
    expect(rewriteQuery("rag embedding retrieval")).toBeUndefined();
  });

  it("strips filler words", () => {
    const result = rewriteQuery("What is RAG?");
    // "what" and "is" are filler, leaving only "rag"
    expect(result).toBe("rag");
  });

  it("lowercases the text", () => {
    const result = rewriteQuery("Tell me about Embeddings");
    expect(result?.toLowerCase()).toBe(result);
  });

  it("returns a string that is shorter than or equal in length to the lowercased original", () => {
    const inputs = [
      "Please explain what LLM inference is",
      "Can you tell me how to do fine-tuning?",
      "What is the definition of quantization?",
    ];

    for (const input of inputs) {
      const rewritten = rewriteQuery(input);

      if (rewritten !== undefined) {
        expect(rewritten.length).toBeLessThanOrEqual(input.toLowerCase().replace(/\s+/g, " ").trim().length);
      }
    }
  });

  it("returns undefined for an already minimal query", () => {
    expect(rewriteQuery("embedding vector retrieval")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// expandQuery
// ---------------------------------------------------------------------------

describe("expandQuery", () => {
  it("returns at least one expansion for 'rag'", () => {
    const result = expandQuery("rag");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("returns at least one expansion for 'embedding'", () => {
    const result = expandQuery("embedding");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("returns at least one expansion for 'llm'", () => {
    const result = expandQuery("llm");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("returns an empty array when there are no known terms", () => {
    const result = expandQuery("xyzzy foobar unknown");
    expect(result).toEqual([]);
  });

  it("does not produce duplicate expansions", () => {
    const result = expandQuery("rag rag rag");
    expect(new Set(result).size).toBe(result.length);
  });
});

// ---------------------------------------------------------------------------
// detectIntent
// ---------------------------------------------------------------------------

describe("detectIntent — factual", () => {
  const factualQueries = [
    "What is retrieval augmented generation?",
    "What are embeddings?",
    "Define vector similarity",
  ];

  for (const query of factualQueries) {
    it(`detects factual intent for: "${query}"`, () => {
      const { intent } = detectIntent(query);
      expect(intent).toBe("factual");
    });
  }
});

describe("detectIntent — comparative", () => {
  const comparativeQueries = [
    "What is the difference between RAG and fine-tuning?",
    "BM25 vs cosine similarity",
    "Compare local-hash and ollama embeddings",
  ];

  for (const query of comparativeQueries) {
    it(`detects comparative intent for: "${query}"`, () => {
      const { intent } = detectIntent(query);
      expect(intent).toBe("comparative");
    });
  }
});

describe("detectIntent — procedural", () => {
  const proceduralQueries = [
    "How do I set up Ollama for local embeddings?",
    "How to implement semantic search?",
    "Steps to configure the RAG pipeline",
  ];

  for (const query of proceduralQueries) {
    it(`detects procedural intent for: "${query}"`, () => {
      const { intent } = detectIntent(query);
      expect(intent).toBe("procedural");
    });
  }
});

describe("detectIntent — exploratory", () => {
  const exploratoryQueries = [
    "Tell me about memory in AI systems",
    "Give me an overview of grounding",
    "Summary of retrieval techniques",
  ];

  for (const query of exploratoryQueries) {
    it(`detects exploratory intent for: "${query}"`, () => {
      const { intent } = detectIntent(query);
      expect(intent).toBe("exploratory");
    });
  }
});

describe("detectIntent — unknown", () => {
  it("returns unknown for an unclassifiable query", () => {
    const { intent } = detectIntent("asdf qwerty 12345");
    expect(intent).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// processQuery
// ---------------------------------------------------------------------------

describe("processQuery", () => {
  it("returns a complete ProcessedQuery for a factual question", () => {
    const result = processQuery({ text: "What is RAG?" });
    expect(result.original).toBe("What is RAG?");
    expect(result.intent).toBe("factual");
    expect(result.confidence).toBeGreaterThan(0);
    expect(Array.isArray(result.expanded)).toBe(true);
  });

  it("produces expansions when known terms are present", () => {
    const result = processQuery({ text: "How do I use embeddings?" });
    expect(result.expanded.length).toBeGreaterThan(0);
  });

  it("respects caller-supplied intent override", () => {
    const result = processQuery({ text: "random query text", intent: "exploratory" });
    expect(result.intent).toBe("exploratory");
  });

  it("handles empty input gracefully", () => {
    const result = processQuery({ text: "" });
    expect(result.intent).toBe("unknown");
    expect(result.confidence).toBe(0);
    expect(result.expanded).toEqual([]);
  });

  it("rewritten is shorter than or equal to the original when present", () => {
    const result = processQuery({
      text: "Can you please explain what an embedding vector is?",
    });

    if (result.rewritten !== undefined) {
      expect(result.rewritten.length).toBeLessThanOrEqual(result.original.length);
    }
  });
});
