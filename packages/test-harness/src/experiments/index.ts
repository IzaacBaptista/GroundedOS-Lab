import {
  EvalReportSchema,
  ExecutionSnapshotSchema,
  ExperimentRunMetadataSchema,
  type EvalReport,
  type ExecutionSnapshot,
  type ExperimentRunMetadata,
  type GoldenDataset,
} from "@groundedos/core";
import { runEvalDataset, type EvalDatasetPipeline } from "../evals";

export interface ExperimentConfig {
  dataset: GoldenDataset;
  provider?: string;
  modelName?: string;
  embeddingProvider?: string;
  reranker?: string;
  promptVersion?: string;
  retrievalStrategy?: string;
  evalSuite?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  experimentId?: string;
  schemaVersion?: string;
  pipelineName?: string;
  snapshots?: ExecutionSnapshot[];
  collectSnapshot?: (input: {
    entry: GoldenDataset["entries"][number];
    sample: EvalReport["samples"][number];
    index: number;
    report: EvalReport;
  }) => ExecutionSnapshot | undefined;
  evaluatorChain?: EvalDatasetPipeline["evaluators"];
  pipeline: EvalDatasetPipeline;
}

export interface ExperimentExecutionResult {
  report: EvalReport;
  snapshots: ExecutionSnapshot[];
  metadata: ExperimentRunMetadata;
}

export async function executeExperiment(config: ExperimentConfig): Promise<ExperimentExecutionResult> {
  const report = await runEvalDataset(config.dataset, {
    ...config.pipeline,
    evaluators: config.evaluatorChain ?? config.pipeline.evaluators,
  });

  const canonicalReport = EvalReportSchema.parse({
    ...report,
    summary: {
      ...report.summary,
      metrics: {
        ...report.summary.metrics,
        experimentRuns: (report.summary.metrics.experimentRuns ?? 0) + 1,
      },
    },
  });
  const snapshots = collectExecutionSnapshots(config, canonicalReport);
  const metadata = ExperimentRunMetadataSchema.parse({
    experimentId: config.experimentId ?? canonicalReport.summary.runId,
    schemaVersion: config.schemaVersion ?? "v1",
    createdAt: canonicalReport.summary.createdAt,
    datasetId: config.dataset.name,
    datasetVersion: config.dataset.version,
    pipelineName: config.pipelineName ?? config.retrievalStrategy ?? "default",
    modelProvider: config.provider,
    modelName: config.modelName,
    embeddingProvider: config.embeddingProvider,
    promptVersion: config.promptVersion,
    evalSuite: config.evalSuite,
    tags: config.tags,
    metadata: {
      ...config.metadata,
      reranker: config.reranker,
      retrievalStrategy: config.retrievalStrategy,
      snapshotCount: snapshots.length,
      runId: canonicalReport.summary.runId,
    },
  });

  return {
    report: canonicalReport,
    snapshots,
    metadata,
  };
}

function collectExecutionSnapshots(
  config: ExperimentConfig,
  report: EvalReport
): ExecutionSnapshot[] {
  const explicitSnapshots = (config.snapshots ?? []).map((snapshot) =>
    ExecutionSnapshotSchema.parse(snapshot)
  );

  const collectedSnapshots =
    config.collectSnapshot === undefined
      ? []
      : report.samples
          .map((sample, index) =>
            config.collectSnapshot?.({
              entry: config.dataset.entries[index]!,
              sample,
              index,
              report,
            })
          )
          .filter((snapshot): snapshot is ExecutionSnapshot => snapshot !== undefined)
          .map((snapshot) => ExecutionSnapshotSchema.parse(snapshot));

  const metadataSnapshots = report.samples
    .map((sample) => sample.metadata)
    .filter((metadata): metadata is Record<string, unknown> => metadata !== undefined)
    .map((metadata) => metadata.executionSnapshot)
    .filter((snapshot): snapshot is ExecutionSnapshot => snapshot !== undefined)
    .map((snapshot) => ExecutionSnapshotSchema.parse(snapshot));

  return [...explicitSnapshots, ...collectedSnapshots, ...metadataSnapshots];
}
