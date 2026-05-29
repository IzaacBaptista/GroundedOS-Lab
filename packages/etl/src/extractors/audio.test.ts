import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { AudioExtractor } from "./audio";

describe("AudioExtractor", () => {
  it("transcribes audio and keeps segment timestamps in multimodal chunks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-audio-"));
    const filePath = join(dir, "sample.mp3");

    try {
      await writeFile(filePath, Buffer.from("fake-audio-binary"));

      const doc = await new AudioExtractor().extract({
        type: "audio",
        filePath,
        metadata: {
          documentId: "doc-audio-1",
          title: "Sample Audio",
          mimeType: "audio/mp3",
        },
      });

      expect(doc.documentId).toBe("doc-audio-1");
      expect(doc.modality).toBe("audio");
      expect(doc.lineage.extractor).toBe("audio-extractor");
      expect(doc.content.fullText).toContain("Transcribed content");
      expect(doc.content.sections).toHaveLength(1);

      const multimodal = (doc.metadata.multimodal ?? {}) as Record<string, unknown>;
      const chunks = multimodal.chunks as Array<Record<string, unknown>>;
      expect(chunks).toHaveLength(1);
      const refs = (chunks[0]?.assetReferences as Array<Record<string, unknown>>) ?? [];
      expect(refs[0]?.timestampStartMs).toBe(0);
      expect(refs[0]?.timestampEndMs).toBe(4000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
