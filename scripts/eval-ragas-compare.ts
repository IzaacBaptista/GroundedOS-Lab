import { readFile } from "fs/promises";
import { resolve } from "path";

const [baselinePath, candidatePath] = process.argv.slice(2);

if (!baselinePath || !candidatePath) {
  throw new Error("Usage: npm run eval:ragas:compare -- <baseline-results.json> <candidate-results.json>");
}

const baseline = JSON.parse(await readFile(resolve(process.cwd(), baselinePath), "utf8")) as {
  metrics?: Record<string, number>;
};
const candidate = JSON.parse(await readFile(resolve(process.cwd(), candidatePath), "utf8")) as {
  metrics?: Record<string, number>;
};

const metrics = new Set([
  ...Object.keys(baseline.metrics ?? {}),
  ...Object.keys(candidate.metrics ?? {}),
]);

const deltas = Object.fromEntries(
  [...metrics].map((metric) => [
    metric,
    (candidate.metrics?.[metric] ?? 0) - (baseline.metrics?.[metric] ?? 0),
  ])
);

console.log(
  JSON.stringify(
    {
      baseline: baselinePath,
      candidate: candidatePath,
      deltas,
    },
    null,
    2
  )
);
