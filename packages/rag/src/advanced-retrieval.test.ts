import { describe, expect, it, vi } from "vitest";
import { buildHypotheticalDocument, buildStepBackQuery } from "./advanced-retrieval";
import type { LlmTextProvider, LlmTextRequest } from "./llm-text-provider";

function fakeProvider(response: string | (() => Promise<string>)): LlmTextProvider {
  return {
    id: "fake",
    async complete() {
      return typeof response === "string" ? response : response();
    },
  };
}

describe("buildHypotheticalDocument (book cap. 20, HyDE)", () => {
  it("uses the LLM's real answer when a provider is given", async () => {
    const provider = fakeProvider("Rate limiting uses a token bucket, capped per IP per minute.");
    const document = await buildHypotheticalDocument("how does rate limiting work?", {
      llmProvider: provider,
    });

    expect(document).toBe("Rate limiting uses a token bucket, capped per IP per minute.");
  });

  it("passes the query (and rewritten intent, if given) to the provider", async () => {
    const complete = vi.fn(async (_request: LlmTextRequest) => "answer");
    const provider: LlmTextProvider = { id: "spy", complete };

    await buildHypotheticalDocument("rate limit?", { llmProvider: provider, rewrittenQuery: "rate limiting" });

    const request = complete.mock.calls[0]![0]!;
    expect(request.user).toContain("rate limit?");
    expect(request.user).toContain("rate limiting");
  });

  it("falls back to the fixed template when the LLM provider throws", async () => {
    const provider = fakeProvider(() => Promise.reject(new Error("boom")));
    const document = await buildHypotheticalDocument("how does rate limiting work?", {
      llmProvider: provider,
    });

    expect(document).toContain("Hypothetical grounded answer for retrieval");
  });

  it("uses the fixed template when no provider is given (disclosed heuristic fallback)", async () => {
    const document = await buildHypotheticalDocument("how does rate limiting work?");
    expect(document).toContain("Hypothetical grounded answer for retrieval: how does rate limiting work?");
  });
});

describe("buildStepBackQuery (book cap. 20, step-back prompting)", () => {
  it("uses the LLM's real generalization when a provider is given", async () => {
    const provider = fakeProvider("How do Kubernetes jobs fail?");
    const generalized = await buildStepBackQuery(
      "why did my kubernetes job crash at 3am on tuesday",
      { llmProvider: provider }
    );

    expect(generalized).toBe("How do Kubernetes jobs fail?");
  });

  it("falls back to a keyword heuristic when the LLM provider throws", async () => {
    const provider = fakeProvider(() => Promise.reject(new Error("boom")));
    const generalized = await buildStepBackQuery("job failed at 3am on tuesday", { llmProvider: provider });

    // "at" is filtered out along with the number ("3am" -> "am") by the >2-char keyword heuristic.
    expect(generalized).toBe("overview of job failed tuesday");
  });

  it("uses the keyword heuristic when no provider is given, stripping numbers", async () => {
    const generalized = await buildStepBackQuery("why did job 42 crash at 3am");
    expect(generalized).toBe("overview of why did job crash");
  });
});
