import { describe, expect, it } from "vitest";
import {
  bm25Score,
  buildCorpusStats,
  scoreCandidatesWithBm25,
  tfIdfScore,
  tokenize,
} from "./sparse-retrieval";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumeric characters", () => {
    expect(tokenize("Dispatcher can route NormalizedDocument!")).toEqual([
      "dispatcher",
      "can",
      "route",
      "normalizeddocument",
    ]);
  });
});

describe("buildCorpusStats", () => {
  it("computes document frequency and average document length across the corpus", () => {
    const stats = buildCorpusStats([
      { id: "a", text: "alpha beta" },
      { id: "b", text: "beta gamma gamma" },
    ]);

    expect(stats.documentFrequency.get("beta")).toBe(2);
    expect(stats.documentFrequency.get("alpha")).toBe(1);
    expect(stats.documentFrequency.get("gamma")).toBe(1);
    expect(stats.averageDocumentLength).toBe(2.5);
  });
});

describe("tfIdfScore (book cap. 15)", () => {
  it("scores a term higher when it's rare across the corpus (higher IDF)", () => {
    const stats = buildCorpusStats([
      { id: "a", text: "common word raretermxyz" },
      { id: "b", text: "common word" },
      { id: "c", text: "common word" },
    ]);
    const docA = stats.documents.find((d) => d.id === "a")!;

    const commonScore = tfIdfScore(["common"], docA, stats.documentFrequency, stats.documents.length);
    const rareScore = tfIdfScore(["raretermxyz"], docA, stats.documentFrequency, stats.documents.length);

    expect(rareScore).toBeGreaterThan(commonScore);
  });

  it("returns 0 for a query term absent from the document", () => {
    const stats = buildCorpusStats([{ id: "a", text: "alpha beta" }]);
    const docA = stats.documents[0]!;

    expect(tfIdfScore(["zzz"], docA, stats.documentFrequency, 1)).toBe(0);
  });
});

describe("bm25Score (book cap. 15)", () => {
  it("scores a document containing all query terms higher than one containing none", () => {
    const stats = buildCorpusStats([
      { id: "match", text: "the dispatcher routes a normalized document end to end" },
      { id: "nomatch", text: "alpha control note without any of those terms" },
    ]);
    const matchDoc = stats.documents.find((d) => d.id === "match")!;
    const noMatchDoc = stats.documents.find((d) => d.id === "nomatch")!;
    const queryTokens = tokenize("dispatcher normalized document");

    const matchScore = bm25Score(
      queryTokens,
      matchDoc,
      stats.documentFrequency,
      stats.documents.length,
      stats.averageDocumentLength
    );
    const noMatchScore = bm25Score(
      queryTokens,
      noMatchDoc,
      stats.documentFrequency,
      stats.documents.length,
      stats.averageDocumentLength
    );

    expect(matchScore).toBeGreaterThan(noMatchScore);
    expect(noMatchScore).toBe(0);
  });

  it("saturates term-frequency benefit (10th occurrence adds much less than the 2nd)", () => {
    const stats = buildCorpusStats([
      { id: "few", text: "term appears twice term here" },
      { id: "many", text: Array(10).fill("term").join(" ") + " filler" },
      { id: "other", text: "completely unrelated content" },
    ]);
    const fewDoc = stats.documents.find((d) => d.id === "few")!;
    const manyDoc = stats.documents.find((d) => d.id === "many")!;
    const queryTokens = ["term"];

    const scoreFew = bm25Score(
      queryTokens,
      fewDoc,
      stats.documentFrequency,
      stats.documents.length,
      stats.averageDocumentLength
    );
    const scoreMany = bm25Score(
      queryTokens,
      manyDoc,
      stats.documentFrequency,
      stats.documents.length,
      stats.averageDocumentLength
    );

    // 5x the term frequency should NOT produce anywhere close to 5x the score.
    expect(scoreMany).toBeGreaterThan(scoreFew);
    expect(scoreMany / scoreFew).toBeLessThan(3);
  });

  it("penalizes longer documents via length normalization (b parameter)", () => {
    const stats = buildCorpusStats([
      { id: "short", text: "term short document" },
      { id: "long", text: "term " + Array(50).fill("padding").join(" ") },
    ]);
    const shortDoc = stats.documents.find((d) => d.id === "short")!;
    const longDoc = stats.documents.find((d) => d.id === "long")!;

    const shortScore = bm25Score(
      ["term"],
      shortDoc,
      stats.documentFrequency,
      stats.documents.length,
      stats.averageDocumentLength
    );
    const longScore = bm25Score(
      ["term"],
      longDoc,
      stats.documentFrequency,
      stats.documents.length,
      stats.averageDocumentLength
    );

    expect(shortScore).toBeGreaterThan(longScore);
  });
});

describe("scoreCandidatesWithBm25", () => {
  it("min-max normalizes scores to [0, 1] across the candidate pool", () => {
    const scores = scoreCandidatesWithBm25("dispatcher normalized document", [
      { id: "high", text: "the dispatcher routes a normalized document" },
      { id: "mid", text: "the dispatcher does something" },
      { id: "zero", text: "completely unrelated content" },
    ]);

    expect(scores.get("high")).toBe(1);
    expect(scores.get("zero")).toBe(0);
    expect(scores.get("mid")!).toBeGreaterThan(0);
    expect(scores.get("mid")!).toBeLessThan(1);
  });

  it("returns all zeros when the query has no tokens", () => {
    const scores = scoreCandidatesWithBm25("???", [{ id: "a", text: "anything" }]);
    expect(scores.get("a")).toBe(0);
  });

  it("returns an empty map for an empty candidate pool", () => {
    const scores = scoreCandidatesWithBm25("query", []);
    expect(scores.size).toBe(0);
  });
});
