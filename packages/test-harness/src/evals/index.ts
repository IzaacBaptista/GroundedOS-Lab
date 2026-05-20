import type {
  EvalReport,
  EvalRunComparisonReport,
  EvalRunSummary,
  EvaluatorOutput,
  GoldenDataset,
} from "@groundedos/core";
import { FaithfulnessEvaluator, RecallEvaluator, RelevanceEvaluator, type EvalInput } from "@groundedos/evals";

type RetrievedChunk = EvalInput["retrievedChunks"][number];

export function makeRetrievedChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: overrides.chunkId ?? "chunk-1",
    text: overrides.text ?? "Default retrieved chunk",
    score: overrides.score ?? 1,
  };
}

export function makeEvalInput(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    question: overrides.question ?? "What is grounded retrieval?",
    answer: overrides.answer ?? "Grounded retrieval uses retrieved evidence to answer.",
    retrievedChunks: overrides.retrievedChunks ?? [makeRetrievedChunk()],
    expectedChunkIds: overrides.expectedChunkIds ?? ["chunk-1"],
  };
}

export function chainWithAllEvaluators() {
  return [new FaithfulnessEvaluator(), new RelevanceEvaluator(), new RecallEvaluator(3)];
}

export interface EvalDatasetPipeline {
  retrieve(entry: GoldenDataset["entries"][number]): Promise<RetrievedChunk[]>;
  generate(entry: GoldenDataset["entries"][number], chunks: RetrievedChunk[]): Promise<string>;
  evaluators?: ReturnType<typeof chainWithAllEvaluators>;
}

export async function runEvalDataset(
  dataset: GoldenDataset,
  pipeline: EvalDatasetPipeline
): Promise<EvalReport> {
  const evaluators = pipeline.evaluators ?? chainWithAllEvaluators();
  const samples: EvalReport["samples"] = [];
  const metricTotals = new Map<string, number>();
  let passCount = 0;
  let totalScore = 0;
  let totalLatencyMs = 0;
  let totalCostUsd = 0;

  for (const entry of dataset.entries) {
    const start = Date.now();
    const chunks = await pipeline.retrieve(entry);
    const answer = await pipeline.generate(entry, chunks);
    const input = makeEvalInput({
      question: entry.question,
      answer,
      retrievedChunks: chunks,
      expectedChunkIds: entry.expectedChunkIds,
    });
    const evalResults = await Promise.all(evaluators.map((evaluator) => evaluator.evaluate(input)));
    const outputs: EvaluatorOutput[] = evalResults.map((result) => ({
      metric: result.label,
      score: result.score,
      passed: result.passed,
      reason: result.reason,
      frameworkMeta: result.details,
    }));
    const score = outputs.reduce((sum, item) => sum + item.score, 0) / outputs.length;
    const passed = outputs.every((item) => item.passed);
    const latencyMs = Date.now() - start;

    if (passed) {
      passCount += 1;
    }
    totalScore += score;
    totalLatencyMs += latencyMs;

    for (const output of outputs) {
      metricTotals.set(output.metric, (metricTotals.get(output.metric) ?? 0) + output.score);
    }

    samples.push({
      sampleId: entry.id,
      question: entry.question,
      answer,
      outputs,
      score,
      passed,
      latencyMs,
      costUsd: 0,
      metadata: entry.metadata,
    });
    totalCostUsd += 0;
  }

  const summary: EvalRunSummary = {
    runId: `eval-${Date.now()}`,
    datasetName: dataset.name,
    datasetVersion: dataset.version,
    createdAt: new Date().toISOString(),
    sampleCount: dataset.entries.length,
    passCount,
    passRate: dataset.entries.length === 0 ? 0 : passCount / dataset.entries.length,
    averageScore: dataset.entries.length === 0 ? 0 : totalScore / dataset.entries.length,
    totalCostUsd,
    totalLatencyMs,
    metrics: Object.fromEntries(
      [...metricTotals.entries()].map(([metric, score]) => [
        metric,
        dataset.entries.length === 0 ? 0 : score / dataset.entries.length,
      ])
    ),
  };

  return {
    version: "v1",
    summary,
    samples,
  };
}

export function compareEvalRuns(runA: EvalReport, runB: EvalReport): EvalRunComparisonReport {
  const metricKeys = new Set([
    ...Object.keys(runA.summary.metrics),
    ...Object.keys(runB.summary.metrics),
  ]);
  const metricDeltas = Object.fromEntries(
    [...metricKeys].map((metric) => [
      metric,
      (runB.summary.metrics[metric] ?? 0) - (runA.summary.metrics[metric] ?? 0),
    ])
  );

  return {
    version: "v1",
    baselineRunId: runA.summary.runId,
    candidateRunId: runB.summary.runId,
    comparedAt: new Date().toISOString(),
    deltas: {
      passRate: runB.summary.passRate - runA.summary.passRate,
      averageScore: runB.summary.averageScore - runA.summary.averageScore,
      totalCostUsd: runB.summary.totalCostUsd - runA.summary.totalCostUsd,
      totalLatencyMs: runB.summary.totalLatencyMs - runA.summary.totalLatencyMs,
      retrievalDriftRate:
        (runB.summary.retrievalDriftRate ?? 0) - (runA.summary.retrievalDriftRate ?? 0),
      hallucinationRate:
        (runB.summary.hallucinationRate ?? 0) - (runA.summary.hallucinationRate ?? 0),
    },
    metricDeltas,
  };
}
