import {
  GuardrailChain,
  HallucinationGuardrail,
  IndirectInjectionGuardrail,
  JailbreakGuardrail,
  PIILeakageGuardrail,
  PromptInjectionGuardrail,
  PromptLeakageGuardrail,
  type GuardrailResult,
  type GuardrailInput,
} from "@groundedos/safety";
import { BadRequestException, Injectable } from "@nestjs/common";
import { readFile } from "fs/promises";
import { join } from "path";

type ExperimentStatus = "scaffold" | "measured" | "missing";

interface Phase5ArtifactVariant {
  name: string;
  role: string;
  metrics?: Record<string, number>;
  hyperparameters?: Record<string, unknown>;
  perQuery?: Array<{ id: string; hit?: boolean }>;
}

interface Phase5Artifact {
  version: number;
  phase: string;
  track: string;
  mode: string;
  generatedAt: string;
  inputDataset?: {
    path: string;
    entryCount: number;
    documentRef?: string;
  };
  method?: {
    chunkCount?: number;
    searchPaths?: string[];
  };
  variants?: Phase5ArtifactVariant[];
  comparison?: {
    passed?: boolean;
    notes?: string;
    directCandidateVsBaseline?: Record<string, number>;
    candidateVsBaseline?: Record<string, number>;
  };
}

export interface LabExperimentMetric {
  label: string;
  value: string;
  numericValue?: number;
  tone?: "good" | "neutral" | "warn";
}

export interface LabExperimentVariant {
  name: string;
  role: string;
  metrics: LabExperimentMetric[];
}

export interface LabExperiment {
  id: string;
  concept: string;
  domain: string;
  status: ExperimentStatus;
  goal: string;
  artifactPath: string;
  generatedAt?: string;
  dataset?: {
    path: string;
    entryCount: number;
    documentRef?: string;
  };
  method?: {
    mode: string;
    chunkCount?: number;
    searchPaths?: string[];
  };
  variants: LabExperimentVariant[];
  keyMetrics: LabExperimentMetric[];
  passed?: boolean;
  notes?: string;
  reproduceCommand: string;
}

export interface LabExperimentsResponse {
  generatedAt: string;
  domains: Array<{
    id: string;
    name: string;
    summary: string;
    experiments: LabExperiment[];
  }>;
}

export interface GuardrailCheckRequest {
  text?: unknown;
  role?: unknown;
  context?: unknown;
  source?: unknown;
}

export interface GuardrailCheckItem {
  id: string;
  label: string;
  concept: string;
  status: "passed" | "sanitized" | "blocked" | "warned";
  riskLevel: "low" | "medium" | "high" | "none";
  reason?: string;
  detectedPatterns: string[];
  sanitizedChanged: boolean;
}

export interface GuardrailCheckResponse {
  generatedAt: string;
  decision: "allow" | "sanitize" | "block" | "review";
  blockedBy?: string;
  summary: {
    checked: number;
    blocked: number;
    sanitized: number;
    warnings: number;
  };
  input: {
    role: "user" | "assistant";
    source: "user-input" | "document" | "assistant-output";
    length: number;
  };
  sanitizedText: string;
  checks: GuardrailCheckItem[];
}

const REPO_ROOT = process.cwd();
const PHASE_5_ROOT = join(REPO_ROOT, "datasets", "experiments", "phase-5");

const EXPERIMENTS = [
  {
    id: "quantization",
    concept: "Quantization",
    goal: "Reduce memory and retrieval cost while preserving golden-set recall.",
    command: "npm run experiment:quantization",
  },
  {
    id: "lora",
    concept: "LoRA",
    goal: "Adapt model behavior with a small trainable adapter instead of full fine-tuning.",
    command: "npm run experiment:lora",
  },
  {
    id: "fine-tuning",
    concept: "Fine-tuning",
    goal: "Compare a base instruction model against task-adapted supervised training.",
    command: "npm run experiment:fine-tuning",
  },
  {
    id: "distillation",
    concept: "Distillation",
    goal: "Compare teacher and student variants for quality, latency and compression.",
    command: "npm run experiment:distillation",
  },
];

@Injectable()
export class LabService {
  private readonly guardrailLabels = new Map([
    [
      "prompt-injection-detector",
      {
        label: "Prompt Injection",
        concept: "Detects attempts to override system or developer instructions.",
      },
    ],
    [
      "pii-leakage-sanitizer",
      {
        label: "PII Leakage",
        concept: "Finds personal data and returns a redacted version instead of leaking it.",
      },
    ],
    [
      "jailbreak-detector",
      {
        label: "Jailbreak",
        concept: "Detects role override and capability-claiming prompts.",
      },
    ],
    [
      "prompt-leakage-detector",
      {
        label: "Prompt Leakage",
        concept: "Blocks requests for hidden prompts and internal instructions.",
      },
    ],
    [
      "indirect-injection-detector",
      {
        label: "Indirect Injection",
        concept: "Finds instructions embedded inside documents or retrieved chunks.",
      },
    ],
    [
      "hallucination-detector",
      {
        label: "Grounding Check",
        concept: "Flags assistant output that is weakly supported by retrieved context.",
      },
    ],
  ]);

  async getExperiments(): Promise<LabExperimentsResponse> {
    const experiments = await Promise.all(
      EXPERIMENTS.map((experiment) => this.loadExperiment(experiment))
    );

    return {
      generatedAt: new Date().toISOString(),
      domains: [
        {
          id: "model-optimization",
          name: "Model Optimization",
          summary:
            "Experiments that trade quality, memory, latency and adaptation cost across model and retrieval variants.",
          experiments,
        },
      ],
    };
  }

  async checkGuardrails(request: GuardrailCheckRequest): Promise<GuardrailCheckResponse> {
    const text = normalizeNonEmptyString(request.text, "text");
    const role = request.role === "assistant" ? "assistant" : "user";
    const context =
      typeof request.context === "string" && request.context.trim().length > 0
        ? request.context.trim()
        : undefined;
    const source =
      request.source === "document" || request.source === "assistant-output"
        ? request.source
        : "user-input";

    const chain = new GuardrailChain();
    chain.register(new PromptInjectionGuardrail());
    chain.register(new PIILeakageGuardrail());
    chain.register(new JailbreakGuardrail());
    chain.register(new PromptLeakageGuardrail());
    chain.register(new IndirectInjectionGuardrail());
    chain.register(new HallucinationGuardrail());

    const guardrailInput: GuardrailInput & {
      retrievedChunks?: Array<{ text: string; score: number }>;
    } = {
      text,
      role,
      metadata: {
        source: source === "document" ? "document" : "playground",
        type: source === "document" ? "chunk" : "input",
      },
      ...(context && role === "assistant"
        ? { retrievedChunks: [{ text: context, score: 1 }] }
        : {}),
    };

    const result = await chain.check(guardrailInput, false);

    const checks = Array.from(result.allResults.entries()).map(([id, check]) =>
      this.toGuardrailCheckItem(id, check)
    );
    const blocked = checks.filter((check) => check.status === "blocked").length;
    const sanitized = checks.filter((check) => check.status === "sanitized").length;
    const warnings = checks.filter((check) => check.status === "warned").length;

    return {
      generatedAt: new Date().toISOString(),
      decision:
        blocked > 0 ? "block" : sanitized > 0 ? "sanitize" : warnings > 0 ? "review" : "allow",
      blockedBy: result.blockedBy,
      summary: {
        checked: checks.length,
        blocked,
        sanitized,
        warnings,
      },
      input: {
        role,
        source,
        length: text.length,
      },
      sanitizedText: result.sanitized,
      checks,
    };
  }

  private async loadExperiment(meta: (typeof EXPERIMENTS)[number]): Promise<LabExperiment> {
    const artifactPath = `datasets/experiments/phase-5/${meta.id}/scaffold-result.json`;
    const fullPath = join(REPO_ROOT, artifactPath);

    try {
      const artifact = JSON.parse(await readFile(fullPath, "utf-8")) as Phase5Artifact;
      const measured = isMeasuredArtifact(artifact);

      return {
        id: meta.id,
        concept: meta.concept,
        domain: "Model Optimization",
        status: measured ? "measured" : "scaffold",
        goal: meta.goal,
        artifactPath,
        generatedAt: artifact.generatedAt,
        dataset: artifact.inputDataset,
        method: {
          mode: artifact.mode,
          chunkCount: artifact.method?.chunkCount,
          searchPaths: artifact.method?.searchPaths,
        },
        variants: (artifact.variants ?? []).map((variant) => ({
          name: variant.name,
          role: variant.role,
          metrics: metricEntries(variant.metrics ?? {}),
        })),
        keyMetrics: keyMetricsFor(artifact),
        passed: artifact.comparison?.passed,
        notes: artifact.comparison?.notes,
        reproduceCommand: meta.command,
      };
    } catch {
      return {
        id: meta.id,
        concept: meta.concept,
        domain: "Model Optimization",
        status: "missing",
        goal: meta.goal,
        artifactPath,
        variants: [],
        keyMetrics: [],
        reproduceCommand: meta.command,
      };
    }
  }

  private toGuardrailCheckItem(id: string, result: GuardrailResult): GuardrailCheckItem {
    const meta = this.guardrailLabels.get(id) ?? {
      label: humanize(id),
      concept: "Safety rule executed by the guardrail chain.",
    };
    const detectedPatterns = result.detectedPatterns ?? [];
    const hasSignal = detectedPatterns.length > 0 || Boolean(result.reason);

    let status: GuardrailCheckItem["status"] = "passed";
    if (result.blocked) {
      status = "blocked";
    } else if (result.sanitized && detectedPatterns.length > 0) {
      status = "sanitized";
    } else if (hasSignal) {
      status = "warned";
    }

    return {
      id,
      label: meta.label,
      concept: meta.concept,
      status,
      riskLevel: result.riskLevel ?? "none",
      reason: result.reason,
      detectedPatterns,
      sanitizedChanged: status === "sanitized",
    };
  }
}

function normalizeNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function isMeasuredArtifact(artifact: Phase5Artifact): boolean {
  return artifact.mode !== "deterministic-scaffold";
}

function keyMetricsFor(artifact: Phase5Artifact): LabExperimentMetric[] {
  if (artifact.track === "quantization") {
    const fp32 = artifact.variants?.find((variant) => variant.name === "lexical-fp32");
    const direct = artifact.variants?.find(
      (variant) => variant.name === "lexical-int8-symmetric-direct"
    );

    return [
      formatMetric("FP32 Recall@1", fp32?.metrics?.recallAt1),
      formatMetric("INT8 Direct Recall@1", direct?.metrics?.recallAt1),
      formatMetric("Memory Reduction", direct?.metrics?.memoryReductionRate, "rate"),
      formatMetric("Golden Rows", artifact.inputDataset?.entryCount),
      formatMetric("Chunks", artifact.method?.chunkCount),
    ].filter(Boolean) as LabExperimentMetric[];
  }

  const candidateComparison =
    artifact.comparison?.candidateVsBaseline ??
    artifact.comparison?.directCandidateVsBaseline ??
    {};

  return Object.entries(candidateComparison)
    .slice(0, 4)
    .map(([label, value]) => formatMetric(humanize(label), value))
    .filter(Boolean) as LabExperimentMetric[];
}

function metricEntries(metrics: Record<string, number>): LabExperimentMetric[] {
  return Object.entries(metrics)
    .map(([label, value]) =>
      formatMetric(humanize(label), value, label.toLowerCase().includes("rate") ? "rate" : undefined)
    )
    .filter(isMetric);
}

function formatMetric(
  label: string,
  value: number | undefined,
  kind?: "rate"
): LabExperimentMetric | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  const isRate =
    kind === "rate" || label.toLowerCase().includes("recall") || label.toLowerCase().includes("rate");
  const display = isRate ? `${(value * 100).toFixed(1)}%` : value.toFixed(value % 1 === 0 ? 0 : 3);

  return {
    label,
    value: display,
    numericValue: value,
    tone: value < 0 ? "warn" : "neutral",
  };
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMetric(metric: LabExperimentMetric | undefined): metric is LabExperimentMetric {
  return metric !== undefined;
}
