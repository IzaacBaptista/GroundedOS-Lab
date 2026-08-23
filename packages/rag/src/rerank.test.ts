import { describe, expect, it, vi } from "vitest";
import { rerankWithLlm } from "./rerank";
import type { LlmTextProvider, LlmTextRequest } from "./llm-text-provider";

function fakeProvider(response: string): LlmTextProvider {
  return { id: "fake", async complete() { return response; } };
}

describe("rerankWithLlm (book cap. 19)", () => {
  it("reorders candidates by the position their id appears in the LLM's response", async () => {
    const candidates = [
      { id: "a", text: "alpha content" },
      { id: "b", text: "beta content" },
      { id: "c", text: "gamma content" },
    ];
    const provider = fakeProvider("[c]\n[a]\n[b]");

    const result = await rerankWithLlm("query", candidates, provider);

    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
    expect(result[1]!.score).toBeGreaterThan(result[2]!.score);
  });

  it("appends candidates the LLM never mentioned, in their original relative order", async () => {
    const candidates = [
      { id: "a", text: "alpha" },
      { id: "b", text: "beta" },
      { id: "c", text: "gamma" },
    ];
    const provider = fakeProvider("[b]");

    const result = await rerankWithLlm("query", candidates, provider);

    expect(result.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("sends the query and every candidate's id + text to the provider", async () => {
    const complete = vi.fn(async (_request: LlmTextRequest) => "[x]\n[y]");
    const provider: LlmTextProvider = { id: "spy", complete };
    const candidates = [
      { id: "x", text: "text x" },
      { id: "y", text: "text y" },
    ];

    await rerankWithLlm("my query", candidates, provider);

    const request = complete.mock.calls[0]![0]!;
    expect(request.user).toContain("my query");
    expect(request.user).toContain("[x] text x");
    expect(request.user).toContain("[y] text y");
  });

  it("returns an empty array for an empty candidate list without calling the provider", async () => {
    const complete = vi.fn(async () => "");
    const result = await rerankWithLlm("query", [], { id: "spy", complete });

    expect(result).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns the single candidate with score 1 without calling the provider", async () => {
    const complete = vi.fn(async () => "");
    const result = await rerankWithLlm("query", [{ id: "only", text: "t" }], { id: "spy", complete });

    expect(result).toEqual([{ id: "only", score: 1 }]);
    expect(complete).not.toHaveBeenCalled();
  });
});
