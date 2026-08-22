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
- `OllamaJudgeProvider` (`ollama-judge-provider.ts`) is the first real
  `JudgeProvider`: sends the rendered judge prompt to a local Ollama chat
  model and returns its raw JSON response for `parseJudgeOutput`. Use
  `StaticJudgeProvider` for tests or for wiring a custom/mocked judge
  resolver instead.

## Current limits

- Current evaluators (`FaithfulnessEvaluator`, `RelevanceEvaluator`,
  `RecallEvaluator`) are deterministic lexical/heuristic scorers, not LLM
  calls.
- `createJudgeRun`/`JudgeProvider` (the LLM-as-judge harness) has no
  production caller yet — it's invoked only from this package's own tests
  plus `OllamaJudgeProvider`/`StaticJudgeProvider`. Wiring it into an eval
  pipeline or API endpoint is separate future work.
- The Python RAGAS runner is integrated through adapters so the core remains
  TypeScript-first.
- Automated A/B prompt testing and statistical winner reporting are available
  via `@groundedos/experiment-toolkit`; this package keeps the evaluator
  primitives used by that workflow.
- See [`docs/evals-advanced-phase.md`](../../docs/evals-advanced-phase.md) for
  the proposed architecture, artifact layout and API payloads.
