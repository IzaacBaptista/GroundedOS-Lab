import { describe, expect, it, vi } from "vitest";

import { buildGroundedPrompt, OllamaChatProvider } from "./generation";

describe("buildGroundedPrompt", () => {
  it("instructs the model to answer only from the given chunks and cite chunk ids", () => {
    const { system, user } = buildGroundedPrompt({
      query: "What is grounding?",
      chunks: [
        { chunkId: "chunk-1", text: "Grounding ties answers to retrieved evidence." },
        { chunkId: "chunk-2", text: "Citations point back to source chunks." },
      ],
    });

    expect(system).toMatch(/only.*context/i);
    expect(system).toMatch(/don't know|do not know/i);
    expect(user).toContain("[chunk-1]");
    expect(user).toContain("Grounding ties answers to retrieved evidence.");
    expect(user).toContain("[chunk-2]");
    expect(user).toContain("What is grounding?");
  });
});

describe("OllamaChatProvider", () => {
  it("sends a chat request with the grounded prompt and decoding options", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "Grounding ties answers to evidence [chunk-1]." } }),
    });

    const provider = new OllamaChatProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    const result = await provider.generate({
      query: "What is grounding?",
      chunks: [{ chunkId: "chunk-1", text: "Grounding ties answers to retrieved evidence." }],
      temperature: 0.1,
      topP: 0.8,
    });

    expect(result.text).toBe("Grounding ties answers to evidence [chunk-1].");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0.1);
    expect(body.options.top_p).toBe(0.8);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
  });

  it("throws a clear error when the ollama response is not ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "model not found",
    });

    const provider = new OllamaChatProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    await expect(
      provider.generate({ query: "q", chunks: [{ chunkId: "c1", text: "t" }] })
    ).rejects.toThrow(/ollama chat request failed with status 500/);
  });
});
