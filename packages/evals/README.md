# evals

Evaluation framework for measuring AI system quality, correctness and safety across all pipeline components.

## Responsibilities

- Define evaluation metrics (faithfulness, relevance, coherence, safety)
- Run automated eval suites against RAG, agent and model outputs
- Support prompt A/B testing with automatic scoring
- Integrate with the experiment-toolkit for batch evaluations
- Generate eval reports and trend comparisons

## Status

Implemented (Phase 3 baseline)

## Current implementation

- `FaithfulnessEvaluator` scores whether an answer stays grounded in retrieved
  chunks.
- `RelevanceEvaluator` scores whether an answer addresses the question.
- `RecallEvaluator` scores whether expected chunks were retrieved in the top-K
  results.
- `EvaluatorChain` runs multiple evaluators and returns per-metric results plus
  aggregate summary data.

## Current limits

- Current evaluators are deterministic lexical/heuristic scorers.
- Automated A/B prompt testing and statistical winner reporting are still Phase
  4 work.
- Trend reports and external eval dashboards are not implemented yet.
