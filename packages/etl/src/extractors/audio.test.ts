import { describe, expect, it } from "vitest";

import { AudioExtractor } from "./audio";

describe("AudioExtractor", () => {
  it("declares the audio modality", () => {
    const extractor = new AudioExtractor();

    expect(extractor.supportedModalities).toEqual(["audio"]);
  });

  it("throws a NOT_IMPLEMENTED error when extract is called", async () => {
    const extractor = new AudioExtractor();

    await expect(
      extractor.extract({ type: "audio", filePath: "/fake/recording.mp3" })
    ).rejects.toThrow(
      "[audio-extractor] NOT_IMPLEMENTED — Audio extraction (ASR / Whisper) is planned for Phase 1."
    );
  });

  it("throws for any kind of input since the stub is not yet implemented", async () => {
    const extractor = new AudioExtractor();

    await expect(
      extractor.extract({ type: "audio", url: "https://example.com/podcast.mp3" })
    ).rejects.toThrow("[audio-extractor] NOT_IMPLEMENTED");
  });
});
