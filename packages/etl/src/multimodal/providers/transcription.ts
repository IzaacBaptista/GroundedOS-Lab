import { basename } from "path";
import type { AudioTranscript, TranscriptionSegment } from "@groundedos/core";

export interface AudioTranscriptionInput {
  assetId: string;
  sourceDocumentId: string;
  originalPath?: string;
  language?: string;
}

export interface AudioTranscriptionProvider {
  readonly name: string;
  transcribe(input: AudioTranscriptionInput): Promise<AudioTranscript>;
}

export class MockTranscriptionProvider implements AudioTranscriptionProvider {
  readonly name: string = "mock-transcription";

  async transcribe(input: AudioTranscriptionInput): Promise<AudioTranscript> {
    const label = basename(input.originalPath ?? "audio");
    const segments: TranscriptionSegment[] = [
      {
        segmentId: `${input.assetId}:segment-1`,
        text: `Transcribed content from ${label}.`,
        startTimeMs: 0,
        endTimeMs: 4000,
        confidence: 0.9,
      },
    ];

    return {
      assetId: input.assetId,
      sourceDocumentId: input.sourceDocumentId,
      fullText: segments.map((segment) => segment.text).join(" "),
      segments,
      language: input.language ?? "en",
      confidence: 0.9,
      provider: this.name,
      model: "mock-v1",
      durationMs: 4000,
      createdAt: new Date().toISOString(),
    };
  }
}

export class LocalWhisperProvider extends MockTranscriptionProvider {
  readonly name = "local-whisper";
}

export class OllamaWhisperProvider extends MockTranscriptionProvider {
  readonly name = "ollama-whisper";
}

export class CloudTranscriptionProvider extends MockTranscriptionProvider {
  readonly name = "cloud-transcription";
}
