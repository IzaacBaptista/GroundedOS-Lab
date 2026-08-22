import { readFile } from "fs/promises";
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

const ERROR_PREFIX = "[etl/transcription]";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "whisper-1";
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export interface OpenAIWhisperProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  requestTimeoutMs?: number;
  fetchFn?: typeof fetch;
  readFileFn?: (path: string) => Promise<Buffer>;
}

/**
 * Real transcription provider using OpenAI's Whisper API. `MockTranscriptionProvider`
 * (and its `Local`/`Ollama`/`Cloud` aliases above) never transcribe anything —
 * this is the first implementation that does. Requires an OpenAI API key, so
 * it's opt-in the same way `OpenAIEmbeddingsProvider` is elsewhere in the repo.
 */
export class OpenAIWhisperProvider implements AudioTranscriptionProvider {
  readonly name = "openai-whisper";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly readFileFn: (path: string) => Promise<Buffer>;

  constructor(options: OpenAIWhisperProviderOptions = {}) {
    this.apiKey = (options.apiKey ?? "").trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = options.model ?? DEFAULT_MODEL;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
    this.readFileFn = options.readFileFn ?? ((path: string) => readFile(path));

    if (this.apiKey.length === 0) {
      throw new Error(`${ERROR_PREFIX} apiKey is required.`);
    }
  }

  async transcribe(input: AudioTranscriptionInput): Promise<AudioTranscript> {
    if (!input.originalPath) {
      throw new Error(`${ERROR_PREFIX} originalPath is required to read the audio file.`);
    }

    const bytes = await this.readFileFn(input.originalPath);
    const filename = basename(input.originalPath);
    const form = new FormData();
    form.append("file", new Blob([Uint8Array.from(bytes)]), filename);
    form.append("model", this.model);
    form.append("response_format", "verbose_json");
    if (input.language) {
      form.append("language", input.language);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await readResponseText(response);
        throw new Error(
          `${ERROR_PREFIX} openai whisper request failed with status ${response.status}${message ? `: ${message}` : "."}`
        );
      }

      const payload = (await response.json()) as {
        text?: unknown;
        segments?: Array<{ text?: unknown; start?: unknown; end?: unknown }>;
      };

      if (typeof payload.text !== "string") {
        throw new Error(`${ERROR_PREFIX} openai whisper response did not include text.`);
      }

      const segments: TranscriptionSegment[] = (payload.segments ?? []).map((segment, index) => ({
        segmentId: `${input.assetId}:segment-${index + 1}`,
        text: String(segment.text ?? "").trim(),
        startTimeMs: Math.round(Number(segment.start ?? 0) * 1000),
        endTimeMs: Math.round(Number(segment.end ?? 0) * 1000),
      }));

      return {
        assetId: input.assetId,
        sourceDocumentId: input.sourceDocumentId,
        fullText: payload.text,
        segments,
        language: input.language,
        provider: this.name,
        model: this.model,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${ERROR_PREFIX} openai whisper request timed out.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readResponseText(response: { text: () => Promise<string> }): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
