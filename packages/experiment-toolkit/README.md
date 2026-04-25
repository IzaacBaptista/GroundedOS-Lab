# experiment-toolkit

Toolkit for designing and running structured AI experiments. Enables systematic testing of prompts, models and hyperparameters.

## Responsibilities

- Batch-test prompts across multiple models and configurations
- Sweep hyperparameters (temperature, top-p, top-k)
- Record experiment inputs, outputs and scores in a structured format
- Integrate with evals for automatic quality scoring
- Provide utilities for experiment versioning and reproducibility

## Status

Implemented baseline (Phase 4 prompt A/B test)

## Current implementation

- `npm run experiment:prompts` runs deterministic prompt variants over the
  golden dataset.
- The experiment evaluates each variant with faithfulness, relevance and recall
  scorers from `@groundedos/evals`.
- The report includes sample size, winner, runner-up, quality difference and a
  95% confidence interval for paired quality differences.
- The current artifact is written to
  `datasets/golden/baselines/phase-4-ab-prompt-test.json`.

## Current limits

- The current golden dataset has one query, so the report is useful as an
  automated workflow check but is not statistically conclusive.
- Prompt variants are deterministic local answer templates; provider-backed
  prompt experiments are future work.

## Usage

```bash
npm run experiment:prompts
```
