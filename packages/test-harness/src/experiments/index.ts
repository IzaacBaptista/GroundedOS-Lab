import type { EvalReport, GoldenDataset } from "@groundedos/core";
import { runEvalDataset, type EvalDatasetPipeline } from "../evals";

export interface ExperimentConfig {
  dataset: GoldenDataset;
  provider?: string;
  reranker?: string;
  promptVersion?: string;
  retrievalStrategy?: string;
  evaluatorChain?: EvalDatasetPipeline["evaluators"];
  pipeline: EvalDatasetPipeline;
}

export async function executeExperiment(config: ExperimentConfig): Promise<EvalReport> {
  const report = await runEvalDataset(config.dataset, {
    ...config.pipeline,
    evaluators: config.evaluatorChain ?? config.pipeline.evaluators,
  });

  return {
    ...report,
    summary: {
      ...report.summary,
      metrics: {
        ...report.summary.metrics,
        experimentRuns: (report.summary.metrics.experimentRuns ?? 0) + 1,
      },
    },
  };
}
