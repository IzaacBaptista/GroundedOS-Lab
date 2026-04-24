import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";
import type { CostBudget, CostEvent, CostStage, RequestCostSummary } from "./types";

const DEFAULT_DATA_DIR = ".groundedos/cost";
const DEFAULT_LEDGER_FILE = "ledger.jsonl";

export class BudgetExceededError extends Error {
  readonly requestId: string;

  constructor(requestId: string, message: string) {
    super(message);
    this.name = "BudgetExceededError";
    this.requestId = requestId;
  }
}

export class CostTracker {
  private readonly requestId: string;
  private readonly events: CostEvent[] = [];

  constructor(requestId: string) {
    this.requestId = requestId;
  }

  trackEvent(
    stage: CostStage,
    provider: string,
    units: number,
    unitCost: number,
    metadata?: Record<string, unknown>
  ): CostEvent {
    const safeUnits = Number.isFinite(units) && units > 0 ? units : 0;
    const safeUnitCost = Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : 0;

    const event: CostEvent = {
      requestId: this.requestId,
      stage,
      provider,
      units: safeUnits,
      unitCost: safeUnitCost,
      totalCost: roundUsd(safeUnits * safeUnitCost),
      metadata,
    };

    this.events.push(event);
    return event;
  }

  getEvents(): CostEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  getTotalCostUsd(): number {
    return roundUsd(this.events.reduce((sum, event) => sum + event.totalCost, 0));
  }

  summarize(withinBudget = true, budgetRemainingUsd?: number): RequestCostSummary {
    return {
      requestId: this.requestId,
      totalCostUsd: this.getTotalCostUsd(),
      breakdown: this.getEvents(),
      withinBudget,
      budgetRemainingUsd,
    };
  }
}

export class CostLedger {
  private readonly ledgerPath: string;

  constructor(baseDir = DEFAULT_DATA_DIR, ledgerFile = DEFAULT_LEDGER_FILE) {
    this.ledgerPath = join(baseDir, ledgerFile);
  }

  get path(): string {
    return this.ledgerPath;
  }

  async appendSummary(summary: RequestCostSummary): Promise<void> {
    await ensureDir(dirname(this.ledgerPath));
    await appendFile(this.ledgerPath, `${JSON.stringify(summary)}\n`, "utf-8");
  }

  async readSummaries(): Promise<RequestCostSummary[]> {
    const lines = await readJsonl(this.ledgerPath);

    return lines.filter(isRequestCostSummary);
  }

  async getDailyTotalUsd(targetDate = new Date()): Promise<number> {
    const summaries = await this.readSummaries();
    const yyyyMmDd = formatDate(targetDate);

    let total = 0;

    for (const summary of summaries) {
      const lastStageTimestamp = summary.breakdown
        .map((event) => event.metadata?.timestamp)
        .find((value): value is number => typeof value === "number");

      const date = new Date(lastStageTimestamp ?? Date.now());

      if (formatDate(date) === yyyyMmDd) {
        total += summary.totalCostUsd;
      }
    }

    return roundUsd(total);
  }
}

export class CostBudgetEnforcer {
  private readonly budget: CostBudget;

  constructor(budget: CostBudget) {
    this.budget = budget;
  }

  validateBudget(requestId: string, projectedRequestCostUsd: number, dailySpentUsd: number): void {
    if (this.budget.perRequestLimitUsd > 0 && projectedRequestCostUsd > this.budget.perRequestLimitUsd) {
      throw new BudgetExceededError(
        requestId,
        `Per-request budget exceeded: projected $${projectedRequestCostUsd.toFixed(6)} > limit $${this.budget.perRequestLimitUsd.toFixed(6)}.`
      );
    }

    if (this.budget.dailyLimitUsd > 0 && dailySpentUsd + projectedRequestCostUsd > this.budget.dailyLimitUsd) {
      throw new BudgetExceededError(
        requestId,
        `Daily budget exceeded: spent+projected $${(dailySpentUsd + projectedRequestCostUsd).toFixed(6)} > limit $${this.budget.dailyLimitUsd.toFixed(6)}.`
      );
    }
  }

  computeBudgetRemaining(projectedRequestCostUsd: number, dailySpentUsd: number): number | undefined {
    if (this.budget.dailyLimitUsd <= 0) {
      return undefined;
    }

    return roundUsd(Math.max(0, this.budget.dailyLimitUsd - (dailySpentUsd + projectedRequestCostUsd)));
  }
}

export function resolveUnitCostUsd(provider: string, stage: CostStage): number {
  const key = provider.toLowerCase();

  if (key === "api-lexical" || key === "local-hash" || key === "ollama") {
    return 0;
  }

  if (key === "openai") {
    if (stage === "embedding-index" || stage === "embedding-query") {
      return parseUsdEnv("GROUNDEDOS_OPENAI_EMBED_COST_PER_UNIT") ?? 0;
    }

    return parseUsdEnv("GROUNDEDOS_OPENAI_LLM_COST_PER_UNIT") ?? 0;
  }

  if (key === "anthropic") {
    return parseUsdEnv("GROUNDEDOS_ANTHROPIC_LLM_COST_PER_UNIT") ?? 0;
  }

  return 0;
}

export function resolveCostBudgetFromEnv(): CostBudget {
  return {
    perRequestLimitUsd: parseUsdEnv("GROUNDEDOS_COST_PER_REQUEST_LIMIT_USD") ?? 0,
    dailyLimitUsd: parseUsdEnv("GROUNDEDOS_COST_DAILY_LIMIT_USD") ?? 0,
    alertThresholdPct: parsePercentEnv("GROUNDEDOS_COST_ALERT_THRESHOLD_PCT") ?? 80,
  };
}

function parseUsdEnv(name: string): number | undefined {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function parsePercentEnv(name: string): number | undefined {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return undefined;
  }

  return parsed;
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

function isRequestCostSummary(value: unknown): value is RequestCostSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<RequestCostSummary>;

  return (
    typeof maybe.requestId === "string" &&
    typeof maybe.totalCostUsd === "number" &&
    Array.isArray(maybe.breakdown) &&
    typeof maybe.withinBudget === "boolean"
  );
}
