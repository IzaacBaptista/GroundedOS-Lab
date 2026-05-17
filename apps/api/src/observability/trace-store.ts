import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";

export interface CorrelationIds {
  requestId?: string;
  traceId?: string;
  sessionId?: string;
  jobId?: string;
  tenantId?: string;
  userId?: string;
  indexId?: string;
  agentExecutionId?: string;
}

export interface StructuredTraceRecord {
  version: "v1";
  timestamp: string;
  component: "request" | "retrieval" | "agent" | "job" | "vector" | "eval" | "observability";
  operation: string;
  status: "started" | "success" | "error";
  durationMs?: number;
  provider?: string;
  model?: string;
  correlation: CorrelationIds;
  metadata?: Record<string, unknown>;
  error?: {
    message: string;
  };
}

export interface ObservabilityMetricsSample {
  version: "v1";
  timestamp: string;
  component: string;
  operation: string;
  status: string;
  latencyMs: number;
  groundedness?: number;
  costUsd?: number;
  retries?: number;
  cacheHit?: boolean;
  retrievalHitQuality?: number;
  confidenceScore?: number;
  failureCategory?: string;
  correlation: CorrelationIds;
}

export interface ObservabilityMetricsSummary {
  generatedAt: string;
  totals: {
    requests: number;
    failures: number;
    retries: number;
    avgLatencyMs: number;
    avgGroundedness: number;
    avgCostUsd: number;
    cacheHitRate: number;
  };
  byComponent: Array<{
    component: string;
    requests: number;
    failures: number;
    avgLatencyMs: number;
  }>;
  recent: ObservabilityMetricsSample[];
}

const DEFAULT_DIR = process.env.GROUNDEDOS_OBSERVABILITY_DIR ?? ".groundedos/observability";
const DEFAULT_TRACE_FILE = "traces.jsonl";
const DEFAULT_METRICS_FILE = "metrics-history.jsonl";

export class TraceStore {
  private readonly tracePath: string;
  private readonly metricsPath: string;

  constructor(baseDir = DEFAULT_DIR) {
    this.tracePath = join(baseDir, DEFAULT_TRACE_FILE);
    this.metricsPath = join(baseDir, DEFAULT_METRICS_FILE);
  }

  async append(record: StructuredTraceRecord): Promise<void> {
    try {
      await ensureDir(dirname(this.tracePath));
      await appendFile(this.tracePath, `${JSON.stringify(record)}\n`, "utf-8");
      const sample = toMetricSample(record);
      await appendFile(this.metricsPath, `${JSON.stringify(sample)}\n`, "utf-8");
    } catch (error) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          component: "observability",
          operation: "trace-retention",
          status: "error",
          message: "failed_to_persist_trace",
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  async readRecent(limit = 100): Promise<StructuredTraceRecord[]> {
    const entries = await readJsonl(this.tracePath);
    const traces = entries.filter(isTraceRecord);
    return traces.slice(-Math.max(1, Math.floor(limit))).reverse();
  }

  async getMetricsSummary(limit = 500): Promise<ObservabilityMetricsSummary> {
    const entries = await readJsonl(this.metricsPath);
    const samples = entries.filter(isMetricSample).slice(-Math.max(1, Math.floor(limit)));

    const requests = samples.length;
    const failures = samples.filter((sample) => sample.status === "error").length;
    const retries = samples.reduce((sum, sample) => sum + (sample.retries ?? 0), 0);
    const avgLatencyMs = requests === 0 ? 0 : round(samples.reduce((sum, sample) => sum + sample.latencyMs, 0) / requests, 2);
    const groundedSamples = samples.filter((sample) => typeof sample.groundedness === "number");
    const avgGroundedness = groundedSamples.length === 0 ? 0 : round(
      groundedSamples.reduce((sum, sample) => sum + (sample.groundedness ?? 0), 0) / groundedSamples.length,
      4
    );
    const costSamples = samples.filter((sample) => typeof sample.costUsd === "number");
    const avgCostUsd = costSamples.length === 0 ? 0 : round(
      costSamples.reduce((sum, sample) => sum + (sample.costUsd ?? 0), 0) / costSamples.length,
      6
    );
    const cacheSamples = samples.filter((sample) => typeof sample.cacheHit === "boolean");
    const cacheHitRate =
      cacheSamples.length === 0
        ? 0
        : round(cacheSamples.filter((sample) => sample.cacheHit).length / cacheSamples.length, 4);

    const byComponentMap = new Map<string, ObservabilityMetricsSample[]>();
    for (const sample of samples) {
      const bucket = byComponentMap.get(sample.component) ?? [];
      bucket.push(sample);
      byComponentMap.set(sample.component, bucket);
    }

    const byComponent = [...byComponentMap.entries()].map(([component, bucket]) => ({
      component,
      requests: bucket.length,
      failures: bucket.filter((sample) => sample.status === "error").length,
      avgLatencyMs: bucket.length === 0 ? 0 : round(bucket.reduce((sum, sample) => sum + sample.latencyMs, 0) / bucket.length, 2),
    }));

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        requests,
        failures,
        retries,
        avgLatencyMs,
        avgGroundedness,
        avgCostUsd,
        cacheHitRate,
      },
      byComponent: byComponent.sort((a, b) => b.requests - a.requests || a.component.localeCompare(b.component)),
      recent: samples.slice(-20).reverse(),
    };
  }
}

function toMetricSample(record: StructuredTraceRecord): ObservabilityMetricsSample {
  const metadata = record.metadata ?? {};
  return {
    version: "v1",
    timestamp: record.timestamp,
    component: record.component,
    operation: record.operation,
    status: record.status,
    latencyMs: sanitizeNumber(record.durationMs),
    groundedness: sanitizeOptionalNumber(metadata.groundedness),
    costUsd: sanitizeOptionalNumber(metadata.costUsd),
    retries: sanitizeOptionalNumber(metadata.retries),
    cacheHit: typeof metadata.cacheHit === "boolean" ? metadata.cacheHit : undefined,
    retrievalHitQuality: sanitizeOptionalNumber(metadata.retrievalHitQuality),
    confidenceScore: sanitizeOptionalNumber(metadata.confidenceScore),
    failureCategory: typeof metadata.failureCategory === "string" ? metadata.failureCategory : undefined,
    correlation: record.correlation,
  };
}

function sanitizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function sanitizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function readJsonl(path: string): Promise<unknown[]> {
  try {
    const raw = await readFile(path, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return undefined;
        }
      })
      .filter((value): value is unknown => value !== undefined);
  } catch {
    return [];
  }
}

function isCorrelationIds(value: unknown): value is CorrelationIds {
  return Boolean(value) && typeof value === "object";
}

function isTraceRecord(value: unknown): value is StructuredTraceRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<StructuredTraceRecord>;
  return (
    record.version === "v1" &&
    typeof record.timestamp === "string" &&
    typeof record.component === "string" &&
    typeof record.operation === "string" &&
    typeof record.status === "string" &&
    isCorrelationIds(record.correlation)
  );
}

function isMetricSample(value: unknown): value is ObservabilityMetricsSample {
  if (!value || typeof value !== "object") {
    return false;
  }
  const sample = value as Partial<ObservabilityMetricsSample>;
  return (
    sample.version === "v1" &&
    typeof sample.timestamp === "string" &&
    typeof sample.component === "string" &&
    typeof sample.operation === "string" &&
    typeof sample.status === "string" &&
    typeof sample.latencyMs === "number" &&
    isCorrelationIds(sample.correlation)
  );
}
