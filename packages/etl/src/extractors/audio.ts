/**
 * AudioExtractor
 *
 * Handles the `"audio"` modality via provider-based transcription.
 */

import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { basename } from "path";
import type {
  AudioAsset,
  DocumentModality,
  Extractor,
  IngestionInput,
  NormalizedDocument,
} from "@groundedos/core";
import { buildMultimodalChunks } from "../multimodal/chunking";
import {
  MockTranscriptionProvider,
  type AudioTranscriptionProvider,
} from "../multimodal/providers/transcription";

export class AudioExtractor implements Extractor {
  readonly supportedModalities: DocumentModality[] = ["audio"];

  constructor(
    private readonly transcriptionProvider: AudioTranscriptionProvider = new MockTranscriptionProvider()
  ) {}

  async extract(input: IngestionInput): Promise<NormalizedDocument> {
    if (input.type !== "audio") {
      throw new Error(
        `[audio-extractor] Unsupported modality "${input.type}". AudioExtractor only handles "audio".`
      );
    }

    const now = new Date().toISOString();
    const documentId = this._resolveDocumentId(input);
    const assetId = randomUUID();
    const transcript = await this.transcriptionProvider.transcribe({
      assetId,
      sourceDocumentId: documentId,
      originalPath: input.filePath ?? input.url,
      language: input.multimodal?.language ?? (input.metadata?.language as string | undefined),
    });
    const asset: AudioAsset = {
      id: assetId,
      sourceDocumentId: documentId,
      modality: "audio",
      mimeType: this._resolveMimeType(input),
      originalPath: input.filePath ?? input.url,
      extractedPath: input.filePath ?? input.url,
      checksum: await this._resolveChecksum(input),
      extractionMethod: "transcription",
      providerMetadata: {
        provider: transcript.provider,
        model: transcript.model,
      },
      confidence: transcript.confidence,
      durationMs: transcript.durationMs,
      createdAt: now,
    };
    const chunks = buildMultimodalChunks({
      documentId,
      audioTranscript: transcript,
    });

    return {
      documentId,
      title: this._resolveTitle(input),
      modality: "audio",
      language: transcript.language,
      content: {
        fullText: transcript.fullText,
        sections: transcript.segments.map((segment, index) => ({
          id: `audio-segment-${index + 1}`,
          heading: `${this._toSeconds(segment.startTimeMs)}s-${this._toSeconds(segment.endTimeMs)}s`,
          text: segment.text,
          startOffset: segment.startTimeMs,
          endOffset: segment.endTimeMs,
        })),
      },
      lineage: {
        sourceType: input.url ? "url" : input.filePath ? "upload" : "manual",
        originalFilename: input.filePath ? basename(input.filePath) : undefined,
        mimeType: asset.mimeType,
        checksum: asset.checksum,
        extractedAt: now,
        extractor: "audio-extractor",
        extractorVersion: "0.1.0",
      },
      metadata: {
        ...(input.metadata ?? {}),
        multimodal: {
          assets: [asset],
          audioTranscript: transcript,
          chunks,
          traces: {
            audioTranscriptionTrace: {
              provider: transcript.provider,
              model: transcript.model,
              numberOfSegments: transcript.segments.length,
              confidence: transcript.confidence,
            },
          },
        },
      },
    };
  }

  private _resolveTitle(input: IngestionInput): string {
    if (typeof input.metadata?.title === "string") {
      return input.metadata.title;
    }
    if (input.filePath) {
      return basename(input.filePath);
    }
    return "Untitled audio";
  }

  private _resolveDocumentId(input: IngestionInput): string {
    if (typeof input.metadata?.documentId === "string") {
      return input.metadata.documentId;
    }
    return randomUUID();
  }

  private _resolveMimeType(input: IngestionInput): string {
    if (typeof input.metadata?.mimeType === "string") {
      return input.metadata.mimeType;
    }
    return "audio/*";
  }

  private async _resolveChecksum(input: IngestionInput): Promise<string | undefined> {
    if (!input.filePath) {
      return undefined;
    }
    const buffer = await readFile(input.filePath);
    return createHash("sha256").update(buffer).digest("hex");
  }

  private _toSeconds(valueMs: number): string {
    return (valueMs / 1000).toFixed(2);
  }
}
