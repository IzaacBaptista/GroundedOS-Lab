import { readFile } from "fs/promises";
import { basename } from "path";
import type { ExtractedImage, ImageDescription } from "@groundedos/core";

export interface ImageDescriptionProvider {
  readonly name: string;
  describe(image: ExtractedImage): Promise<ImageDescription>;
}

export interface VisionModelProvider extends ImageDescriptionProvider {}

export class MockVisionProvider implements VisionModelProvider {
  readonly name: string = "mock-vision";

  async describe(image: ExtractedImage): Promise<ImageDescription> {
    const filename = basename(image.extractedPath);
    return {
      assetId: image.assetId,
      sourceDocumentId: image.sourceDocumentId,
      shortCaption: `Image extracted from page ${image.pageNumber}`,
      detailedDescription: `Visual summary generated for ${filename}.`,
      detectedObjects: ["diagram"],
      detectedTextSummary: `Potential text detected in ${filename}.`,
      diagramType: "unknown",
      tableLikeStructure: false,
      semanticTags: ["pdf", "image", "extracted"],
      confidence: 0.86,
      provider: this.name,
      model: "mock-v1",
      createdAt: new Date().toISOString(),
    };
  }
}

const ERROR_PREFIX = "[etl/vision]";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_VISION_MODEL = "llava";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DESCRIBE_SYSTEM_MESSAGE =
  "You describe images extracted from documents. Respond with JSON only: " +
  '{"shortCaption": string, "detailedDescription": string, "detectedObjects": string[], ' +
  '"detectedTextSummary": string, "diagramType": string, "tableLikeStructure": boolean}.';

export interface OllamaVisionProviderOptions {
  baseUrl?: string;
  model?: string;
  requestTimeoutMs?: number;
  fetchFn?: typeof fetch;
  readFileFn?: (path: string) => Promise<Buffer>;
}

/**
 * Real image-description provider using a local Ollama vision model
 * (e.g. llava, llama3.2-vision) via `/api/chat`'s `images` field.
 * `MockVisionProvider` (and its `Local`/`Cloud` aliases above) never call a
 * model at all — this is the first implementation that does.
 */
export class OllamaVisionProvider implements VisionModelProvider {
  readonly name = "ollama-vision";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly readFileFn: (path: string) => Promise<Buffer>;

  constructor(options: OllamaVisionProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
    this.model = options.model ?? DEFAULT_OLLAMA_VISION_MODEL;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
    this.readFileFn = options.readFileFn ?? ((path: string) => readFile(path));
  }

  async describe(image: ExtractedImage): Promise<ImageDescription> {
    const bytes = await this.readFileFn(image.extractedPath);
    const base64 = bytes.toString("base64");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: DESCRIBE_SYSTEM_MESSAGE,
              images: [base64],
            },
          ],
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await readResponseText(response);
        throw new Error(
          `${ERROR_PREFIX} ollama vision request failed with status ${response.status}${message ? `: ${message}` : "."}`
        );
      }

      const payload = (await response.json()) as { message?: { content?: unknown } };
      const content = payload.message?.content;

      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} ollama vision response did not include message content.`);
      }

      return this._toImageDescription(image, content.trim());
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${ERROR_PREFIX} ollama vision request timed out.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private _toImageDescription(image: ExtractedImage, content: string): ImageDescription {
    const now = new Date().toISOString();
    const parsed = tryParseJson(content);

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        assetId: image.assetId,
        sourceDocumentId: image.sourceDocumentId,
        shortCaption:
          typeof record.shortCaption === "string" && record.shortCaption.length > 0
            ? record.shortCaption
            : content.slice(0, 120),
        detailedDescription:
          typeof record.detailedDescription === "string" ? record.detailedDescription : content,
        detectedObjects: Array.isArray(record.detectedObjects)
          ? (record.detectedObjects as unknown[]).filter((v): v is string => typeof v === "string")
          : [],
        detectedTextSummary:
          typeof record.detectedTextSummary === "string" ? record.detectedTextSummary : undefined,
        diagramType: typeof record.diagramType === "string" ? record.diagramType : "unknown",
        tableLikeStructure:
          typeof record.tableLikeStructure === "boolean" ? record.tableLikeStructure : false,
        semanticTags: ["pdf", "image", "extracted"],
        provider: this.name,
        model: this.model,
        createdAt: now,
      };
    }

    return {
      assetId: image.assetId,
      sourceDocumentId: image.sourceDocumentId,
      shortCaption: content.slice(0, 120),
      detailedDescription: content,
      detectedObjects: [],
      diagramType: "unknown",
      tableLikeStructure: false,
      semanticTags: ["pdf", "image", "extracted"],
      provider: this.name,
      model: this.model,
      createdAt: now,
    };
  }
}

function tryParseJson(text: string): unknown {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(normalized);
  } catch {
    return undefined;
  }
}

async function readResponseText(response: { text: () => Promise<string> }): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
