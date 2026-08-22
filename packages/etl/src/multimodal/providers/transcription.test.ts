import { describe, expect, it, vi } from "vitest";

import { OpenAIWhisperProvider } from "./transcription";

describe("OpenAIWhisperProvider", () => {
  it("sends the audio file to the OpenAI transcription endpoint and maps segments", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "Hello world. This is a test.",
        segments: [
          { text: " Hello world.", start: 0, end: 1.5 },
          { text: " This is a test.", start: 1.5, end: 3.2 },
        ],
      }),
    });
    const readFileFn = vi.fn().mockResolvedValue(Buffer.from("fake-audio-bytes"));

    const provider = new OpenAIWhisperProvider({
      apiKey: "sk-test",
      fetchFn: fetchFn as unknown as typeof fetch,
      readFileFn,
    });

    const result = await provider.transcribe({
      assetId: "asset-1",
      sourceDocumentId: "doc-1",
      originalPath: "/tmp/clip.mp3",
      language: "en",
    });

    expect(result.fullText).toBe("Hello world. This is a test.");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ text: "Hello world.", startTimeMs: 0, endTimeMs: 1500 });
    expect(result.provider).toBe("openai-whisper");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
  });

  it("throws when no apiKey is configured", () => {
    expect(() => new OpenAIWhisperProvider({ apiKey: "" })).toThrow(/apiKey is required/);
  });

  it("throws a clear error when the OpenAI response is not ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "invalid key" });
    const readFileFn = vi.fn().mockResolvedValue(Buffer.from("bytes"));
    const provider = new OpenAIWhisperProvider({
      apiKey: "sk-test",
      fetchFn: fetchFn as unknown as typeof fetch,
      readFileFn,
    });

    await expect(
      provider.transcribe({ assetId: "a", sourceDocumentId: "d", originalPath: "/tmp/x.mp3" })
    ).rejects.toThrow(/openai whisper request failed with status 401/);
  });
});
