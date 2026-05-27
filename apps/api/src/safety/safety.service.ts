import {
  ConstitutionalCritic,
  DEFAULT_CONSTITUTION_POLICY,
  DEFAULT_SAFETY_POLICY,
  SafetyAnalyzer,
  evaluateSafetyStrategies,
  type ConstitutionPolicy,
  type DetectionMode,
  type RetrievedChunk,
  type SafetyAnalyzerResult,
  type SafetyPolicy,
  type SanitizerMode,
} from "@groundedos/safety";
import { BadRequestException, Injectable } from "@nestjs/common";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

interface SafetyRunRecord {
  runId: string;
  generatedAt: string;
  kind: "analyze" | "critique" | "constitutional" | "evaluate";
  summary: string;
}

export interface SafetyAnalyzeRequest {
  chunks?: unknown;
  enabledPolicies?: unknown;
  injectionDetectionMode?: unknown;
  sanitizerMode?: unknown;
  trustLevels?: unknown;
  debug?: unknown;
  devMode?: unknown;
}

export interface SafetyEvaluateRequest {
  fixtures?: unknown;
  strategies?: unknown;
  injectionDetectionMode?: unknown;
}

export interface SafetyCritiqueRequest {
  draft?: unknown;
  context?: unknown;
  maxCritiqueIterations?: unknown;
  critiqueMode?: unknown;
  constitutionalPrinciples?: unknown;
}

export interface SafetyConstitutionalRequest extends SafetyCritiqueRequest {}

@Injectable()
export class SafetyService {
  private readonly analyzer = new SafetyAnalyzer();
  private readonly runs: SafetyRunRecord[] = [];

  analyze(request: SafetyAnalyzeRequest): SafetyAnalyzerResult {
    const chunks = this.normalizeChunks(request.chunks);
    const policy = this.resolvePolicy(request);
    const result = this.analyzer.analyze(chunks, policy);

    this.runs.unshift({
      runId: result.trace.runId,
      generatedAt: result.trace.generatedAt,
      kind: "analyze",
      summary: result.decision.reason,
    });

    return result;
  }

  evaluate(request: SafetyEvaluateRequest) {
    const fixtures = this.normalizeFixtures(request.fixtures);
    const strategies = this.normalizeStrategies(request.strategies);

    const report = evaluateSafetyStrategies({
      fixtures,
      strategies,
      policy: {
        detectionMode: this.normalizeDetectionMode(request.injectionDetectionMode),
      },
    });

    this.runs.unshift({
      runId: `eval-${Date.now()}`,
      generatedAt: report.comparedAt,
      kind: "evaluate",
      summary: `Compared ${report.strategies.length} safety strategy variants.`,
    });

    return report;
  }

  critique(request: SafetyCritiqueRequest) {
    const draft = normalizeNonEmptyString(request.draft, "draft");
    const context = typeof request.context === "string" ? request.context : "";
    const policy = this.resolveConstitutionPolicy(request);
    const critic = new ConstitutionalCritic(policy);
    const critique = critic.critique(draft, context);

    this.runs.unshift({
      runId: `critique-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      kind: "critique",
      summary: critique.summary,
    });

    return critique;
  }

  constitutional(request: SafetyConstitutionalRequest) {
    const draft = normalizeNonEmptyString(request.draft, "draft");
    const context = typeof request.context === "string" ? request.context : "";
    const policy = this.resolveConstitutionPolicy(request);
    const critic = new ConstitutionalCritic(policy);
    const reflection = critic.runSelfCritique(draft, context, {
      maxCritiqueIterations: policy.maxCritiqueIterations,
    });

    this.runs.unshift({
      runId: `constitutional-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      kind: "constitutional",
      summary: `Self-critique completed in ${reflection.iterations} iteration(s).`,
    });

    return reflection;
  }

  listRuns(): SafetyRunRecord[] {
    return this.runs.slice(0, 100);
  }

  async listFixtures() {
    const root = join(process.cwd(), "datasets", "security");

    const categories = await readdir(root, { withFileTypes: true });
    const fixtures = [] as Array<{
      category: string;
      file: string;
      attackType: string;
      expectedSafetyDecision: string;
      riskLevel?: string;
    }>;

    for (const category of categories) {
      if (!category.isDirectory()) {
        continue;
      }

      const categoryDir = join(root, category.name);
      const files = await readdir(categoryDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".json")) {
          continue;
        }

        const data = JSON.parse(await readFile(join(categoryDir, file.name), "utf8")) as {
          attackType?: string;
          expectedSafetyDecision?: string;
          riskLevel?: string;
        };

        fixtures.push({
          category: category.name,
          file: file.name,
          attackType: data.attackType ?? "unknown",
          expectedSafetyDecision: data.expectedSafetyDecision ?? "quarantine",
          riskLevel: data.riskLevel,
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      count: fixtures.length,
      fixtures,
    };
  }

  private normalizeChunks(raw: unknown): RetrievedChunk[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException("chunks must be a non-empty array.");
    }

    return raw.map((chunk, index) => {
      if (!chunk || typeof chunk !== "object") {
        throw new BadRequestException("each chunk must be an object.");
      }

      const record = chunk as Record<string, unknown>;
      const text = normalizeNonEmptyString(record.text, `chunks[${index}].text`);
      const chunkId =
        typeof record.chunkId === "string" && record.chunkId.trim().length > 0
          ? record.chunkId.trim()
          : `chunk-${index + 1}`;

      const metadata =
        record.metadata && typeof record.metadata === "object"
          ? (record.metadata as Record<string, unknown>)
          : {};

      return {
        chunkId,
        text,
        score: typeof record.score === "number" ? record.score : undefined,
        metadata: {
          trustLevel:
            metadata.trustLevel === "trusted" ||
            metadata.trustLevel === "untrusted" ||
            metadata.trustLevel === "unknown"
              ? metadata.trustLevel
              : "unknown",
          sourceType:
            typeof metadata.sourceType === "string" && metadata.sourceType.trim().length > 0
              ? metadata.sourceType
              : "unknown",
          sourceOrigin:
            typeof metadata.sourceOrigin === "string" && metadata.sourceOrigin.trim().length > 0
              ? metadata.sourceOrigin
              : "unknown",
          ingestionMethod:
            typeof metadata.ingestionMethod === "string" && metadata.ingestionMethod.trim().length > 0
              ? metadata.ingestionMethod
              : "unknown",
          securityFlags: Array.isArray(metadata.securityFlags)
            ? metadata.securityFlags.filter((item): item is string => typeof item === "string")
            : [],
        },
      };
    });
  }

  private normalizeFixtures(raw: unknown): Array<{
    attackType: string;
    maliciousChunk: string;
    expectedSafetyDecision: "allow" | "sanitize" | "quarantine" | "block";
  }> {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException("fixtures must be a non-empty array.");
    }

    return raw.map((fixture, index) => {
      if (!fixture || typeof fixture !== "object") {
        throw new BadRequestException("each fixture must be an object.");
      }

      const record = fixture as Record<string, unknown>;
      const decision =
        record.expectedSafetyDecision === "allow" ||
        record.expectedSafetyDecision === "sanitize" ||
        record.expectedSafetyDecision === "quarantine" ||
        record.expectedSafetyDecision === "block"
          ? record.expectedSafetyDecision
          : "quarantine";

      return {
        attackType:
          typeof record.attackType === "string" && record.attackType.trim().length > 0
            ? record.attackType
            : `fixture-${index + 1}`,
        maliciousChunk: normalizeNonEmptyString(record.maliciousChunk, `fixtures[${index}].maliciousChunk`),
        expectedSafetyDecision: decision,
      };
    });
  }

  private normalizeStrategies(raw: unknown): DetectionMode[] | undefined {
    if (!Array.isArray(raw) || raw.length === 0) {
      return undefined;
    }

    const normalized = raw.filter(
      (item): item is DetectionMode =>
        item === "none" || item === "regex" || item === "classifier" || item === "hybrid"
    );

    return normalized.length > 0 ? normalized : undefined;
  }

  private resolvePolicy(request: SafetyAnalyzeRequest): Partial<SafetyPolicy> {
    const enabledPolicies =
      request.enabledPolicies && typeof request.enabledPolicies === "object"
        ? (request.enabledPolicies as Record<string, unknown>)
        : {};

    const trustLevels = Array.isArray(request.trustLevels)
      ? request.trustLevels.filter(
          (item): item is "trusted" | "unknown" | "untrusted" =>
            item === "trusted" || item === "unknown" || item === "untrusted"
        )
      : undefined;

    return {
      ...enabledPolicies,
      detectionMode: this.normalizeDetectionMode(request.injectionDetectionMode),
      sanitizerMode: this.normalizeSanitizerMode(request.sanitizerMode),
      allowedTrustLevels: trustLevels,
    };
  }

  private resolveConstitutionPolicy(request: SafetyCritiqueRequest): ConstitutionPolicy {
    const principles = Array.isArray(request.constitutionalPrinciples)
      ? DEFAULT_CONSTITUTION_POLICY.principles.map((principle) => ({
          ...principle,
          enabled: request.constitutionalPrinciples?.includes(principle.id) ?? principle.enabled,
        }))
      : DEFAULT_CONSTITUTION_POLICY.principles;

    const maxCritiqueIterations =
      typeof request.maxCritiqueIterations === "number" && request.maxCritiqueIterations > 0
        ? Math.min(5, Math.floor(request.maxCritiqueIterations))
        : DEFAULT_CONSTITUTION_POLICY.maxCritiqueIterations;

    return {
      ...DEFAULT_CONSTITUTION_POLICY,
      principles,
      maxCritiqueIterations,
    };
  }

  private normalizeDetectionMode(value: unknown): DetectionMode {
    if (value === "none" || value === "regex" || value === "classifier" || value === "hybrid") {
      return value;
    }

    return DEFAULT_SAFETY_POLICY.detectionMode;
  }

  private normalizeSanitizerMode(value: unknown): SanitizerMode {
    if (value === "none" || value === "basic" || value === "strict") {
      return value;
    }

    return DEFAULT_SAFETY_POLICY.sanitizerMode;
  }
}

function normalizeNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string.`);
  }

  return value.trim();
}
