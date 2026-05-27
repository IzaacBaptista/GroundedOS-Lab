import { RagasDatasetMapper, RagasMetricRunner } from "@groundedos/evals";

const mapper = new RagasDatasetMapper();
const runner = new RagasMetricRunner();
const request = runner.buildRequest(
  mapper.map([
    {
      sampleId: "ragas-sample-1",
      question: "How does semantic cache affect retrieval?",
      answer: "It reduces repeated retrieval work by reusing similar evidence.",
      referenceAnswer: "Semantic cache short-circuits repeated retrieval by reusing evidence.",
      retrievedContexts: [
        {
          chunkId: "chunk-semantic-cache",
          text: "Semantic cache reuses recent retrieval evidence for similar queries.",
          score: 1,
        },
      ],
    },
  ]),
  {
    metrics: ["faithfulness", "answer_correctness"],
    outputDir: "datasets/experiments/evals/ragas/sample",
  }
);

console.log(
  JSON.stringify(
    {
      request,
      command: runner.buildCommand(request),
    },
    null,
    2
  )
);
