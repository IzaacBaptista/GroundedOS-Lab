/**
 * A minimal, single-purpose text-completion provider — distinct from
 * `GenerationProvider` (generation.ts), which is specifically shaped for
 * grounded question-answering (chunks + citation instructions). HyDE
 * (cap. 20), step-back prompting (cap. 20), and LLM re-ranking (cap. 19)
 * all need a plain "given this system/user prompt, return text" call with
 * no grounding/citation framing — this is that primitive, reused by all
 * three instead of three separate provider shapes.
 */

const ERROR_PREFIX = "[rag/llm-text-provider]";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.2";
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface LlmTextRequest {
  system: string;
  user: string;
}

export interface LlmTextProvider {
  readonly id: string;
  complete(request: LlmTextRequest): Promise<string>;
}

export interface OllamaTextProviderOptions {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  requestTimeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class OllamaTextProvider implements LlmTextProvider {
  readonly id = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly requestTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: OllamaTextProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
    this.model = options.model ?? DEFAULT_OLLAMA_MODEL;
    this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async complete(request: LlmTextRequest): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          stream: false,
          options: { temperature: this.temperature },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(
          `${ERROR_PREFIX} ollama request failed with status ${response.status}${message ? `: ${message}` : "."}`
        );
      }

      const payload = (await response.json()) as { message?: { content?: unknown } };
      const text = payload.message?.content;

      if (typeof text !== "string" || text.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} ollama response did not include message content.`);
      }

      return text.trim();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${ERROR_PREFIX} ollama request timed out.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
