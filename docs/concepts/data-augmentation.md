# Data Augmentation

## What it is

**Data augmentation** creates additional training or evaluation examples by transforming existing data while preserving the target task meaning.

## Why it matters

AI experiments often lack enough high-quality examples. Augmentation can expand coverage for evals, fine-tuning and robustness tests, especially around edge cases that are underrepresented in the source data.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/etl`](../../packages/etl/README.md) | Lists data augmentation as part of preprocessing responsibilities. |
| [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md) | Can use augmented datasets for supervised adaptation. |
| [`packages/evals`](../../packages/evals/README.md) | Can expand regression and robustness suites. |
| [`experiments/bias-tests`](../../experiments/bias-tests/README.md) | Can broaden demographic and topical test coverage. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Coverage vs noise** | Poor augmentation can create unrealistic or mislabeled examples. |
| **Bias amplification** | Transformations can preserve or increase dataset bias. |
| **Traceability** | Augmented data needs metadata linking it to source examples and generation rules. |
