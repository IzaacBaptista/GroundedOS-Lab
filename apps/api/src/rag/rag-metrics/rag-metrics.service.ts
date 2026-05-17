import { Injectable } from "@nestjs/common";
import { execFile } from "child_process";
import { readFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import {
  getRagTradeoffMetrics,
  type RagModelBenchmarkPrecheckProvider,
  type RagModelBenchmarkPrecheckProviderResult,
  type RagModelBenchmarkPrecheckResponse,
  type RagModelBenchmarkResponse,
  type RagModelBenchmarkRunResponse,
  type RagTradeoffMetricsResponse,
} from "../../rag-service";
import {
  TraceStore,
  type ObservabilityMetricsSummary,
  type StructuredTraceRecord,
} from "../../observability/trace-store";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_PROVIDERS: RagModelBenchmarkPrecheckProvider[] = [
  "local-extractive",
  "ollama",
  "openai",
  "groq",
];
const DEFAULT_RUN_PROVIDERS = ["local-extractive", "ollama", "openai", "groq"];
const execFileAsync = promisify(execFile);

@Injectable()
export class RagMetricsService {
  private readonly traceStore = new TraceStore();

  getTradeoffs(): RagTradeoffMetricsResponse {
    return getRagTradeoffMetrics();
  }

  getObservabilitySummary(limit?: number): Promise<ObservabilityMetricsSummary> {
    return this.traceStore.getMetricsSummary(limit);
  }

  getRecentTraces(limit?: number): Promise<StructuredTraceRecord[]> {
    return this.traceStore.readRecent(limit);
  }

  async getModelBenchmark(): Promise<RagModelBenchmarkResponse> {
    const benchmarkPath = join(
      process.cwd(),
      "datasets/golden/baselines/phase-4-model-benchmark.json"
    );
    const content = await readFile(benchmarkPath, "utf8");
    return JSON.parse(content) as RagModelBenchmarkResponse;
  }

  async getModelBenchmarkPrecheck(query: {
    providers?: string;
    strict?: string;
  }): Promise<RagModelBenchmarkPrecheckResponse> {
    const requestedProviders = this.parseProviders(query.providers);
    const strictMode = query.strict === "true" || query.strict === "1";
    const results = await Promise.all(
      requestedProviders.map((provider) => this.runProviderChecks(provider))
    );
    const ollamaReady = results.find((item) => item.provider === "ollama")?.ready ?? false;
    const cloudReady =
      (results.find((item) => item.provider === "openai")?.ready ?? false) ||
      (results.find((item) => item.provider === "groq")?.ready ?? false);
    const phase4Ready = ollamaReady && cloudReady;

    return {
      timestamp: new Date().toISOString(),
      requestedProviders,
      phase4Ready,
      strictMode,
      results,
      nextAction: phase4Ready
        ? "Run benchmark: npm run benchmark:models -- --providers local-extractive,ollama,openai"
        : "Resolve failed checks, then run benchmark:models.",
    };
  }

  async runModelBenchmark(options: {
    providers?: string[];
  }): Promise<RagModelBenchmarkRunResponse> {
    const providers = this.parseRunProviders(options.providers);
    const startedAt = new Date().toISOString();
    const command = `npm run benchmark:models -- --providers ${providers.join(",")}`;

    try {
      const { stdout, stderr } = await execFileAsync(
        "npm",
        ["run", "benchmark:models", "--", "--providers", providers.join(",")],
        {
          cwd: process.cwd(),
          maxBuffer: 5 * 1024 * 1024,
          env: process.env,
        }
      );

      return {
        startedAt,
        finishedAt: new Date().toISOString(),
        command,
        providers,
        success: true,
        output: [stdout, stderr].filter(Boolean).join("\n"),
      };
    } catch (error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };

      return {
        startedAt,
        finishedAt: new Date().toISOString(),
        command,
        providers,
        success: false,
        output: [execError.stdout, execError.stderr, execError.message]
          .filter(Boolean)
          .join("\n"),
      };
    }
  }

  private parseProviders(value?: string): RagModelBenchmarkPrecheckProvider[] {
    if (!value || !value.trim()) {
      return DEFAULT_PROVIDERS;
    }

    return [...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => this.normalizeProvider(item))
    )];
  }

  private normalizeProvider(value: string): RagModelBenchmarkPrecheckProvider {
    if (value === "local-extractive" || value === "ollama" || value === "openai" || value === "groq") {
      return value;
    }

    return "local-extractive";
  }

  private parseRunProviders(providers?: string[]): string[] {
    const safe = (providers ?? DEFAULT_RUN_PROVIDERS)
      .map((item) => item.trim())
      .filter((item) => item === "local-extractive" || item === "ollama" || item === "openai" || item === "groq");

    return safe.length > 0 ? [...new Set(safe)] : DEFAULT_RUN_PROVIDERS;
  }

  private async runProviderChecks(
    provider: RagModelBenchmarkPrecheckProvider
  ): Promise<RagModelBenchmarkPrecheckProviderResult> {
    if (provider === "local-extractive") {
      return {
        provider,
        ready: true,
        checks: [
          {
            name: "baseline",
            status: "pass",
            detail: "Local extractive provider requires no external dependency.",
          },
        ],
      };
    }

    if (provider === "ollama") {
      return await this.runOllamaChecks();
    }

    if (provider === "openai") {
      return await this.runOpenAiChecks();
    }

    return await this.runGroqChecks();
  }

  private async runOllamaChecks(): Promise<RagModelBenchmarkPrecheckProviderResult> {
    const checks: RagModelBenchmarkPrecheckProviderResult["checks"] = [];
    const model = (process.env.GROUNDEDOS_OLLAMA_GENERATE_MODEL ?? "").trim();

    if (!model) {
      checks.push({
        name: "env",
        status: "fail",
        detail: "Set GROUNDEDOS_OLLAMA_GENERATE_MODEL (example: qwen2.5:0.5b).",
      });

      return {
        provider: "ollama",
        ready: false,
        checks,
        blocker: "Missing GROUNDEDOS_OLLAMA_GENERATE_MODEL",
      };
    }

    checks.push({
      name: "env",
      status: "pass",
      detail: `Configured model: ${model}`,
    });

    const baseUrl = process.env.GROUNDEDOS_OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;

    try {
      const response = await this.fetchWithTimeout(`${baseUrl}/api/tags`, {
        method: "GET",
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        checks.push({
          name: "api",
          status: "fail",
          detail: `Ollama API returned ${response.status}. Base URL: ${baseUrl}`,
        });

        return {
          provider: "ollama",
          ready: false,
          checks,
          blocker: `Ollama API is unavailable at ${baseUrl}`,
        };
      }

      checks.push({
        name: "api",
        status: "pass",
        detail: `Ollama API reachable at ${baseUrl}`,
      });

      const body = (await response.json()) as { models?: Array<{ name?: string }> };
      const names = (body.models ?? []).map((item) => item.name ?? "").filter(Boolean);
      const hasModel = names.includes(model);

      checks.push({
        name: "model",
        status: hasModel ? "pass" : "fail",
        detail: hasModel
          ? `Model ${model} is available in local Ollama.`
          : `Model ${model} not found locally. Run: ollama pull ${model}`,
      });

      return {
        provider: "ollama",
        ready: hasModel,
        checks,
        blocker: hasModel ? undefined : `Model ${model} is not available in Ollama.`,
      };
    } catch (error) {
      checks.push({
        name: "api",
        status: "fail",
        detail: `Could not connect to Ollama API at ${baseUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });

      return {
        provider: "ollama",
        ready: false,
        checks,
        blocker: `Cannot reach Ollama API at ${baseUrl}`,
      };
    }
  }

  private async runOpenAiChecks(): Promise<RagModelBenchmarkPrecheckProviderResult> {
    const checks: RagModelBenchmarkPrecheckProviderResult["checks"] = [];
    const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    const model = (process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL).trim();

    if (!apiKey) {
      checks.push({
        name: "env",
        status: "fail",
        detail: "Set OPENAI_API_KEY to enable cloud benchmark checks.",
      });

      return {
        provider: "openai",
        ready: false,
        checks,
        blocker: "Missing OPENAI_API_KEY",
      };
    }

    checks.push({
      name: "env",
      status: "pass",
      detail: `OPENAI_MODEL=${model}`,
    });

    try {
      const response = await this.fetchWithTimeout("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: "Respond with the single word: ok",
          max_output_tokens: 16,
          store: false,
        }),
      });

      if (response.ok) {
        checks.push({
          name: "quota",
          status: "pass",
          detail: `OpenAI Responses API accepted a probe request for model ${model}.`,
        });

        return {
          provider: "openai",
          ready: true,
          checks,
        };
      }

      const text = await response.text();
      const parsedError = this.parseOpenAiError(text);
      const insufficientQuota = response.status === 429 || parsedError.code === "insufficient_quota";
      const invalidModel =
        parsedError.code === "model_not_found" || (response.status === 400 && /model/i.test(text));
      const diagnostic = parsedError.message
        ? `${parsedError.code ? `${parsedError.code}: ` : ""}${parsedError.message}`
        : `status ${response.status}`;

      checks.push({
        name: "quota",
        status: "fail",
        detail: insufficientQuota
          ? "OpenAI key is valid but quota/billing is insufficient (429 insufficient_quota)."
          : invalidModel
            ? `Model ${model} may be unavailable for this account.`
            : `OpenAI probe failed (${diagnostic}).`,
      });

      return {
        provider: "openai",
        ready: false,
        checks,
        blocker: insufficientQuota
          ? "OpenAI quota/billing is insufficient."
          : `OpenAI probe failed (${diagnostic}).`,
      };
    } catch (error) {
      checks.push({
        name: "network",
        status: "fail",
        detail: `Could not reach OpenAI API: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        provider: "openai",
        ready: false,
        checks,
        blocker: "OpenAI API is unreachable from this environment.",
      };
    }
  }

  private async runGroqChecks(): Promise<RagModelBenchmarkPrecheckProviderResult> {
    const checks: RagModelBenchmarkPrecheckProviderResult["checks"] = [];
    const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
    const model = (process.env.GROQ_MODEL ?? "llama-3.1-8b-instant").trim();

    if (!apiKey) {
      checks.push({
        name: "env",
        status: "fail",
        detail: "Set GROQ_API_KEY to enable Groq cloud benchmark (free tier at console.groq.com).",
      });

      return {
        provider: "groq",
        ready: false,
        checks,
        blocker: "Missing GROQ_API_KEY",
      };
    }

    checks.push({
      name: "env",
      status: "pass",
      detail: `GROQ_MODEL=${model}`,
    });

    try {
      const response = await this.fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Respond with the single word: ok" }],
          max_tokens: 8,
          temperature: 0,
        }),
      });

      if (response.ok) {
        checks.push({
          name: "quota",
          status: "pass",
          detail: `Groq API accepted a probe request for model ${model}.`,
        });

        return {
          provider: "groq",
          ready: true,
          checks,
        };
      }

      const text = await response.text();
      checks.push({
        name: "quota",
        status: "fail",
        detail: `Groq probe failed with status ${response.status}: ${text.slice(0, 120)}`,
      });

      return {
        provider: "groq",
        ready: false,
        checks,
        blocker: `Groq API probe failed (status ${response.status}).`,
      };
    } catch (error) {
      checks.push({
        name: "network",
        status: "fail",
        detail: `Could not reach Groq API: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        provider: "groq",
        ready: false,
        checks,
        blocker: "Groq API is unreachable from this environment.",
      };
    }
  }

  private parseOpenAiError(text: string): { code?: string; message?: string } {
    try {
      const parsed = JSON.parse(text) as {
        error?: {
          code?: string;
          message?: string;
        };
      };

      return {
        code: parsed.error?.code,
        message: parsed.error?.message,
      };
    } catch {
      return {};
    }
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}
