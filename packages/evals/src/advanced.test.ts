import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { createTempDir } from "@groundedos/test-harness";
import {
  DEFAULT_JUDGE_PROMPT_TEMPLATE,
  EvalArtifactWriter,
  EvalOrchestrator,
  GoldenDatasetExporter,
  RagasDatasetMapper,
  StaticJudgeProvider,
  SyntheticDatasetGenerator,
  createJudgeRun,
  loadJudgeRubric,
  parseJudgeOutput,
} from "./advanced";

describe("advanced eval utilities", () => {
  it("parses fenced judge JSON output", () => {
    const result = parseJudgeOutput(`\`\`\`json
{"metric":"faithfulness","score":4,"reason":"Supported by chunk-1.","evidenceUsed":["chunk-1"],"issues":[],"confidence":0.8}
\`\`\``);

    expect(result[0]?.metric).toBe("faithfulness");
    expect(result[0]?.evidenceUsed).toContain("chunk-1");
  });

  it("loads rubric definitions and aggregates judge runs", async () => {
    const rubric = loadJudgeRubric("answer_correctness");
    const provider = new StaticJudgeProvider("mock", "judge-model", ({ metric, runIndex }) => ({
      rawResponse: JSON.stringify({
        metric,
        score: runIndex === 0 ? 5 : 4,
        reason: `Scored ${metric}`,
        evidenceUsed: ["chunk-1"],
        issues: [],
        confidence: 0.9,
      }),
      latencyMs: 12,
      costUsd: 0.002,
    }));

    const run = await createJudgeRun(
      {
        sampleId: "sample-1",
        question: "What is grounded retrieval?",
        answer: "It answers with retrieved evidence.",
        referenceAnswer: "Grounded retrieval uses evidence from retrieved chunks.",
        retrievedContexts: [{ chunkId: "chunk-1", text: "Grounded retrieval uses retrieved evidence." }],
        metrics: ["answer_correctness"],
      },
      provider,
      { promptVersion: DEFAULT_JUDGE_PROMPT_TEMPLATE.version, temperature: 0 },
      { runCount: 2, runId: "judge-run-test" }
    );

    expect(rubric.metric).toBe("answer_correctness");
    expect(run.aggregation[0]?.averageScore).toBe(4.5);
    expect(run.aggregation[0]?.majorityScore).toBe(5);
  });

  it("maps internal records into RAGAS rows", () => {
    const mapper = new RagasDatasetMapper();
    const records = mapper.map([
      {
        sampleId: "sample-1",
        question: "How does semantic cache help retrieval?",
        answer: "It avoids repeating similar retrieval work.",
        retrievedContexts: [
          { chunkId: "chunk-1", text: "Semantic cache reuses prior retrieval results.", score: 1 },
        ],
        referenceAnswer: "Semantic cache reduces repeated retrieval by reusing evidence.",
      },
    ]);

    expect(records[0]?.contexts[0]).toContain("reuses prior retrieval");
    expect(records[0]?.contextIds[0]).toBe("chunk-1");
  });

  it("generates and exports a synthetic dataset", async () => {
    const generator = new SyntheticDatasetGenerator();
    const dataset = generator.generate({
      datasetId: "synthetic-rag",
      version: "v1",
      generatorModel: "mock-generator",
      promptVersion: "synthetic-v1",
      documents: [
        {
          documentId: "doc-1",
          title: "Semantic Cache",
          chunks: [
            { chunkId: "chunk-1", text: "Semantic cache stores previous retrieval evidence for similar queries." },
            { chunkId: "chunk-2", text: "It reduces latency by avoiding repeated retrieval calls." },
          ],
        },
      ],
    });
    const outputRoot = await createTempDir("groundedos-synth-export-");
    const exporter = new GoldenDatasetExporter();
    const metadata = await exporter.exportVersionedDataset(outputRoot, dataset, {
      corpusVersion: "docs-v1",
    });

    expect(dataset.samples.length).toBeGreaterThan(0);
    expect(metadata.corpusVersion).toBe("docs-v1");
    const exported = await readFile(join(outputRoot, "v1", "metadata.json"), "utf8");
    expect(exported).toContain('"numberOfSamples"');
  });

  it("writes eval artifacts and orchestrates judge plus ragas results", async () => {
    const outputDir = await createTempDir("groundedos-advanced-evals-");
    const judgeProvider = new StaticJudgeProvider("mock", "judge-model", ({ metric }) => ({
      rawResponse: JSON.stringify({
        metric,
        score: 4,
        reason: "Grounded in the retrieved chunk.",
        evidenceUsed: ["chunk-1"],
        issues: [],
        confidence: 0.85,
      }),
    }));
    const orchestrator = new EvalOrchestrator({
      judgeProvider,
      artifactWriter: new EvalArtifactWriter(),
      ragasExecutor: {
        async evaluate(request) {
          return {
            runId: "ragas-run-1",
            metrics: Object.fromEntries(request.config.metrics.map((metric) => [metric, 0.8])),
            samples: request.records.map((record) => ({
              sampleId: record.sampleId,
              metrics: Object.fromEntries(request.config.metrics.map((metric) => [metric, 0.8])),
              warnings: [],
            })),
            artifacts: {
              resultsJson: "results.json",
              summaryMd: "summary.md",
              metricsCsv: "metrics.csv",
              configJson: "config.json",
              traceJson: "trace.json",
            },
          };
        },
      },
    });

    const run = await orchestrator.run({
      config: {
        evalSuite: "advanced-rag",
        mode: "experiment",
        outputDir,
        judgeConfig: {
          temperature: 0,
          promptVersion: "judge-v1",
        },
        ragasConfig: {
          metrics: ["faithfulness", "context_precision"],
          outputDir,
          scriptPath: "/tmp/fake-ragas.py",
        },
      },
      suite: {
        suiteId: "advanced-rag",
        metrics: ["faithfulness", "answer_correctness", "context_precision"],
        includes: {
          customScorers: true,
          judge: true,
          ragas: true,
          syntheticDataset: false,
        },
      },
      datasetId: "datasets/golden/rag/v1",
      datasetVersion: "v1",
      samples: [
        {
          sampleId: "sample-1",
          question: "What is grounded retrieval?",
          answer: "Grounded retrieval uses retrieved evidence to answer.",
          referenceAnswer: "Grounded retrieval uses retrieved evidence to answer.",
          retrievedContexts: [
            { chunkId: "chunk-1", text: "Grounded retrieval uses retrieved evidence to answer.", score: 1 },
          ],
        },
      ],
    });

    expect(run.summary.metrics.faithfulness).toBeGreaterThan(0);
    expect(run.artifacts?.files.resultsJson).toContain("results.json");
    const summary = await readFile(join(outputDir, "summary.md"), "utf8");
    expect(summary).toContain("advanced-rag");
  });
});
