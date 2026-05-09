# bias-tests

Experiments to surface, measure and document bias in model outputs across demographic and topical dimensions.

## Responsibilities

- Design bias probing datasets and evaluation criteria
- Run bias tests across multiple models and configurations
- Measure and compare bias signals using standard metrics
- Document findings and propose mitigation strategies

## Status

Backlog (not implemented yet). Directory exists as a Phase 6+ placeholder for
future fairness/bias evaluation fixtures and reports.

## Current scope

- No runnable benchmark pipeline is committed yet.
- No fairness dataset bundle is versioned under this directory yet.
- This area is reserved for reproducible experiment assets (fixtures, scripts,
  report templates) once fairness evaluation enters active implementation.

## Entry criteria for implementation

1. Define target tasks and protected attributes for evaluation.
2. Add dataset provenance and licensing metadata in `datasets/`.
3. Establish baseline metrics and acceptance thresholds in `packages/evals`.

## Next milestones

1. Add first fixture set for bias probes and expected output schema.
2. Add a reproducible runner script and artifact output path under `datasets/experiments/`.
3. Integrate summary metrics into the lab/evals reporting flow.
