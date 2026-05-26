# evals

Evaluation framework for measuring AI system quality, correctness and safety across all pipeline components.

## Responsibilities

- Define evaluation metrics (faithfulness, relevance, coherence, safety)
- Run automated eval suites against RAG, agent and model outputs
- Support prompt A/B testing with automatic scoring
- Integrate with the experiment-toolkit for batch evaluations
- Generate eval reports and trend comparisons

## Status

In progress (Advanced Evals phase)

## Current implementation

- `FaithfulnessEvaluator` scores whether an answer stays grounded in retrieved
  chunks.
- `RelevanceEvaluator` scores whether an answer addresses the question.
- `RecallEvaluator` scores whether expected chunks were retrieved in the top-K
  results.
- `EvaluatorChain` runs multiple evaluators and returns per-metric results plus
  aggregate summary data.
- `advanced.ts` adds typed building blocks for LLM-as-judge, RAGAS mapping,
  synthetic dataset generation, artifact writing and eval orchestration.

## Current limits

- Current evaluators are deterministic lexical/heuristic scorers.
- Judge providers and the Python RAGAS runner are integrated through adapters so
  the core remains TypeScript-first.
- Automated A/B prompt testing and statistical winner reporting are available
  via `@groundedos/experiment-toolkit`; this package keeps the evaluator
  primitives used by that workflow.
- See [`docs/evals-advanced-phase.md`](../../docs/evals-advanced-phase.md) for
  the proposed architecture, artifact layout and API payloads.
