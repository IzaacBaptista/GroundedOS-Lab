import { EvalReportSchema, type GoldenDataset } from "@groundedos/core";
import { executeExperiment } from "../packages/test-harness/src/experiments/index";

const dataset: GoldenDataset = {
  name: "ci-eval-harness",
  version: "1.0.0",
  entries: [
    {
      id: "ci-eval-1",
      question: "What is grounded retrieval?",
      expectedAnswer: "Grounded retrieval uses retrieved evidence to support the generated answer.",
      expectedChunkIds: ["grounded-retrieval:chunk-1"],
      metadata: { stage: "ci" },
    },
  ],
};

const result = await executeExperiment({
  dataset,
  provider: "local",
  retrievalStrategy: "hybrid",
  pipelineName: "ci-eval-harness",
  evalSuite: "default",
  tags: ["ci", "harness"],
  pipeline: {
    async retrieve(entry) {
      return [
        {
          chunkId: entry.expectedChunkIds[0] ?? `${entry.id}:chunk-1`,
          text: entry.expectedAnswer ?? "Grounded retrieval uses retrieved evidence.",
          score: 1,
        },
      ];
    },
    async generate(entry) {
      return entry.expectedAnswer ?? "Grounded retrieval uses retrieved evidence.";
    },
  },
});

const report = EvalReportSchema.parse(result.report);
if (report.summary.sampleCount !== dataset.entries.length) {
  throw new Error(
    `[eval:harness] Unexpected sample count ${report.summary.sampleCount}; expected ${dataset.entries.length}.`
  );
}

console.log(
  JSON.stringify(
    {
      runId: report.summary.runId,
      sampleCount: report.summary.sampleCount,
      passRate: report.summary.passRate,
      experimentRuns: report.summary.metrics.experimentRuns ?? 0,
      snapshotCount: result.snapshots.length,
      metadata: {
        experimentId: result.metadata.experimentId,
        datasetId: result.metadata.datasetId,
        pipelineName: result.metadata.pipelineName,
      },
    },
    null,
    2
  )
);
