import { describe, expect, it, vi } from "vitest";

import { OllamaJudgeProvider } from "./ollama-judge-provider";

describe("OllamaJudgeProvider", () => {
  it("sends the rendered judge prompt to Ollama chat and returns the raw response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: '{"metric":"faithfulness","score":5,"reason":"ok","evidenceUsed":["chunk-1"],"issues":[],"confidence":0.9}',
        },
      }),
    });

    const provider = new OllamaJudgeProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    const result = await provider.evaluate({
      prompt: "Judge this answer against the rubric.",
      metric: "faithfulness",
      runIndex: 0,
      temperature: 0,
    });

    expect(result.rawResponse).toContain('"metric":"faithfulness"');
    expect(typeof result.latencyMs).toBe("number");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0);
    expect(body.messages.some((m: { content: string }) => m.content.includes("Judge this answer"))).toBe(true);
  });

  it("throws a clear error when the ollama response is not ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const provider = new OllamaJudgeProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    await expect(
      provider.evaluate({ prompt: "p", metric: "faithfulness", runIndex: 0, temperature: 0 })
    ).rejects.toThrow(/ollama judge request failed with status 500/);
  });

  it("exposes provider and model identifiers", () => {
    const provider = new OllamaJudgeProvider({ model: "llama3.2" });
    expect(provider.provider).toBe("ollama");
    expect(provider.model).toBe("llama3.2");
  });
});
