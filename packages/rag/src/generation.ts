/**
 * Grounded generation
 *
 * Builds a prompt that constrains the model to the retrieved chunks and
 * calls a chat/completion provider to produce the final answer text. This
 * is the piece that turns "Retrieval" into "Retrieval-Augmented
 * *Generation*" — everything upstream of this module only selects evidence.
 */

const ERROR_PREFIX = "[rag/generation]";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_CHAT_MODEL = "llama3.2";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_TOP_P = 0.9;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export interface GenerationChunk {
  chunkId: string;
  text: string;
}

export interface GenerationRequest {
  query: string;
  chunks: GenerationChunk[];
  temperature?: number;
  topP?: number;
}

export interface GenerationResult {
  text: string;
  model: string;
}

export interface GenerationProvider {
  readonly id: string;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export interface GroundedPrompt {
  system: string;
  user: string;
}

/**
 * Builds the system/user messages that ground the model in only the
 * supplied chunks. Chunk ids are surfaced so the model can cite them
 * (book cap. 27, "Answer -> evidence mapping").
 */
export function buildGroundedPrompt(request: GenerationRequest): GroundedPrompt {
  const system =
    "You are a grounded assistant. Answer only using the information in the " +
    "provided context chunks. Cite the chunk id(s) you relied on in square " +
    "brackets, e.g. [chunk-1]. If the context does not contain the answer, " +
    "say you don't know instead of guessing.";

  const contextBlock = request.chunks
    .map((chunk) => `[${chunk.chunkId}] ${chunk.text}`)
    .join("\n\n");

  const user = `Context:\n${contextBlock}\n\nQuestion: ${request.query}`;

  return { system, user };
}

export interface OllamaChatProviderOptions {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  requestTimeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class OllamaChatProvider implements GenerationProvider {
  readonly id = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly topP: number;
  private readonly requestTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: OllamaChatProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
    this.model = options.model ?? DEFAULT_OLLAMA_CHAT_MODEL;
    this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    this.topP = options.topP ?? DEFAULT_TOP_P;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const { system, user } = buildGroundedPrompt(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: false,
          options: {
            temperature: request.temperature ?? this.temperature,
            top_p: request.topP ?? this.topP,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await readResponseText(response);
        throw new Error(
          `${ERROR_PREFIX} ollama chat request failed with status ${response.status}${message ? `: ${message}` : "."}`
        );
      }

      const payload = (await response.json()) as { message?: { content?: unknown } };
      const text = payload.message?.content;

      if (typeof text !== "string" || text.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} ollama chat response did not include message content.`);
      }

      return { text: text.trim(), model: this.model };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${ERROR_PREFIX} ollama chat request timed out.`);
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
