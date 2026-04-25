import { loadLocalEnv } from "./load-env";
import { requireCliValue } from "./rag-cli-utils";

const DEFAULT_PROVIDERS = ["local-extractive", "ollama", "openai", "groq"];
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

type ProviderId = "local-extractive" | "ollama" | "openai" | "groq";

type CliOptions = {
  providers: ProviderId[];
  strict: boolean;
  help: boolean;
};

type CheckStatus = "pass" | "fail" | "warn";

type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
};

type ProviderPrecheckResult = {
  provider: ProviderId;
  ready: boolean;
  checks: Check[];
  blocker?: string;
};

type PrecheckReport = {
  timestamp: string;
  requestedProviders: ProviderId[];
  phase4Ready: boolean;
  strictMode: boolean;
  results: ProviderPrecheckResult[];
  nextAction: string;
};

loadLocalEnv();

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const results = await Promise.all(options.providers.map((provider) => runProviderChecks(provider)));
const ollamaReady = results.find((result) => result.provider === "ollama")?.ready ?? false;
const cloudReady =
  (results.find((result) => result.provider === "openai")?.ready ?? false) ||
  (results.find((result) => result.provider === "groq")?.ready ?? false);
const phase4Ready = ollamaReady && cloudReady;

const report: PrecheckReport = {
  timestamp: new Date().toISOString(),
  requestedProviders: options.providers,
  phase4Ready,
  strictMode: options.strict,
  results,
  nextAction: phase4Ready
    ? `Run benchmark: npm run benchmark:models -- --providers local-extractive,ollama,${cloudReady && (results.find((r) => r.provider === "groq")?.ready) ? "groq" : "openai"}`
    : "Resolve failed checks, then re-run precheck and benchmark.",
};

printHumanSummary(report);
console.log(JSON.stringify(report, null, 2));

if (options.strict && !phase4Ready) {
  process.exit(1);
}

async function runProviderChecks(provider: ProviderId): Promise<ProviderPrecheckResult> {
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
    return await runOllamaChecks();
  }

  if (provider === "openai") {
    return await runOpenAiChecks();
  }

  return await runGroqChecks();
}

async function runOllamaChecks(): Promise<ProviderPrecheckResult> {
  const checks: Check[] = [];
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
    const response = await fetchWithTimeout(`${baseUrl}/api/tags`, {
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

async function runOpenAiChecks(): Promise<ProviderPrecheckResult> {
  const checks: Check[] = [];
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const model = (process.env.OPENAI_MODEL ?? "gpt-5-mini").trim();

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
    const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
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
    const parsedError = parseOpenAiError(text);
    const insufficientQuota =
      response.status === 429 || parsedError.code === "insufficient_quota";
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

async function runGroqChecks(): Promise<ProviderPrecheckResult> {
  const checks: Check[] = [];
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
    const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
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

function parseOpenAiError(text: string): { code?: string; message?: string } {
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

async function fetchWithTimeout(
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

function parseArgs(args: string[]): CliOptions {
  let providers = DEFAULT_PROVIDERS as ProviderId[];
  let strict = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--strict") {
      strict = true;
      continue;
    }

    if (arg === "--providers" || arg === "-p") {
      providers = requireCliValue(args, index, arg, "[benchmark-models:precheck]")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => normalizeProvider(value));
      index += 1;
      continue;
    }

    throw new Error(
      `[benchmark-models:precheck] Unknown option "${arg}". Use --help for usage.`
    );
  }

  return {
    providers,
    strict,
    help,
  };
}

function normalizeProvider(value: string): ProviderId {
  if (value === "local-extractive" || value === "ollama" || value === "openai" || value === "groq") {
    return value;
  }

  throw new Error(
    `[benchmark-models:precheck] Unknown provider "${value}". Supported: local-extractive, ollama, openai, groq.`
  );
}

function printHumanSummary(report: PrecheckReport): void {
  console.log("[benchmark-models:precheck] Phase 4 provider readiness");

  for (const result of report.results) {
    const status = result.ready ? "READY" : "BLOCKED";
    console.log(`- ${result.provider}: ${status}`);

    for (const check of result.checks) {
      const marker = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "x";
      console.log(`  ${marker} ${check.name}: ${check.detail}`);
    }
  }

  console.log(
    report.phase4Ready
      ? "[benchmark-models:precheck] Phase 4 benchmark target can run."
      : "[benchmark-models:precheck] Phase 4 benchmark target is still blocked."
  );
}

function printHelp(): void {
  console.log(`Usage: npm run benchmark:models:precheck -- [options]

Options:
  --providers, -p <list>   Comma-separated providers: local-extractive,ollama,openai,groq
  --strict                 Exit with code 1 when Phase 4 target is blocked
  --help, -h               Show this help

Provider env vars:
  GROUNDEDOS_OLLAMA_GENERATE_MODEL   Required for provider "ollama"
  OPENAI_API_KEY                     Required for provider "openai"
  GROQ_API_KEY                       Required for provider "groq" (free tier at console.groq.com)
  GROQ_MODEL                         Defaults to llama-3.1-8b-instant

Examples:
  npm run benchmark:models:precheck
  npm run benchmark:models:precheck -- --providers local-extractive,ollama,groq --strict
`);
}
