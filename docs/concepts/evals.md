# Evals

## What it is

**Evals** are structured tests used to measure AI system behavior. They can score faithfulness, relevance, coherence, safety, retrieval quality, task success and regression risk.

## Why it matters

GroundedOS Lab treats quality as something to measure continuously. Without evals, changes to prompts, models, chunking, reranking or guardrails can look good in a demo while silently degrading real behavior.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/evals`](../../packages/evals/README.md) | Owns metrics, suites, reports and trend comparisons. |
| [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | Runs batch experiments that can be scored automatically. |
| [`packages/rag`](../../packages/rag/README.md) | Uses evals to measure retrieval and grounded answer quality. |
| [`packages/safety`](../../packages/safety/README.md) | Uses safety evals for guardrail and jailbreak checks. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Combines quality scores with latency and cost comparisons. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Coverage vs effort** | Useful evals require representative datasets and maintenance. |
| **Automated vs human judgment** | Automated scores scale, but some failures still need review. |
| **Metric fit** | A generic metric may miss domain-specific quality requirements. |
