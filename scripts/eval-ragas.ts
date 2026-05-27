import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { RagasDatasetMapper, RagasMetricRunner } from "@groundedos/evals";

const execFileAsync = promisify(execFile);

const outputDir = resolve(
  process.cwd(),
  process.argv.includes("--output-dir")
    ? process.argv[process.argv.indexOf("--output-dir") + 1] ?? "datasets/experiments/evals/ragas/latest"
    : "datasets/experiments/evals/ragas/latest"
);
const execute = process.argv.includes("--execute");

const mapper = new RagasDatasetMapper();
const records = mapper.map([
  {
    sampleId: "ragas-smoke-1",
    question: "What is grounded retrieval?",
    answer: "Grounded retrieval answers using retrieved evidence.",
    referenceAnswer: "Grounded retrieval answers using retrieved evidence.",
    retrievedContexts: [
      {
        chunkId: "chunk-1",
        text: "Grounded retrieval uses retrieved evidence to support generation.",
        score: 1,
      },
    ],
  },
]);
const runner = new RagasMetricRunner();
const request = runner.buildRequest(records, {
  metrics: [
    "faithfulness",
    "answer_relevancy",
    "context_precision",
    "context_recall",
    "answer_correctness",
  ],
  outputDir,
});

await mkdir(outputDir, { recursive: true });
const requestPath = resolve(outputDir, "request.json");
await writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");

if (!execute) {
  console.log(
    JSON.stringify(
      {
        requestPath,
        command: [...runner.buildCommand(request), "--request", requestPath].join(" "),
        mode: "prepared",
      },
      null,
      2
    )
  );
  process.exit(0);
}

const command = runner.buildCommand(request);
const { stdout, stderr } = await execFileAsync(command[0]!, [...command.slice(1), "--request", requestPath], {
  cwd: process.cwd(),
  maxBuffer: 5 * 1024 * 1024,
  env: process.env,
});

console.log([stdout, stderr].filter(Boolean).join("\n"));
