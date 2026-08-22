/**
 * OllamaJudgeProvider
 *
 * Real LLM-as-judge implementation of the `JudgeProvider` contract
 * (see `advanced.ts`). `StaticJudgeProvider` requires the caller to supply
 * a resolver function — it never talks to a model. This provider sends the
 * already-rendered judge prompt (built by `renderJudgePrompt`) to a local
 * Ollama chat model and returns its raw text response for `parseJudgeOutput`
 * to parse.
 */

import type { JudgeProvider, JudgeProviderResponse } from "./advanced.js";

const ERROR_PREFIX = "[evals/ollama-judge-provider]";
const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const JUDGE_SYSTEM_MESSAGE =
  "You are an evaluator. Follow the instructions in the user message exactly and respond with valid JSON only.";

export interface OllamaJudgeProviderOptions {
  baseUrl?: string;
  model?: string;
  requestTimeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class OllamaJudgeProvider implements JudgeProvider {
  readonly provider = "ollama";
  readonly model: string;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: OllamaJudgeProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = options.model ?? DEFAULT_MODEL;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async evaluate(input: {
    prompt: string;
    metric: string;
    runIndex: number;
    temperature: number;
    seed?: number;
  }): Promise<JudgeProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const startedAt = Date.now();

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: JUDGE_SYSTEM_MESSAGE },
            { role: "user", content: input.prompt },
          ],
          stream: false,
          options: {
            temperature: input.temperature,
            seed: input.seed,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await readResponseText(response);
        throw new Error(
          `${ERROR_PREFIX} ollama judge request failed with status ${response.status}${message ? `: ${message}` : "."}`
        );
      }

      const payload = (await response.json()) as { message?: { content?: unknown } };
      const content = payload.message?.content;

      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} ollama judge response did not include message content.`);
      }

      return { rawResponse: content.trim(), latencyMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${ERROR_PREFIX} ollama judge request timed out.`);
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
