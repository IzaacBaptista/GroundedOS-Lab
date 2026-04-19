# Synthetic Data

## What it is

**Synthetic data** is generated data used for training, evaluation, testing or simulation when real data is limited, sensitive or expensive to label.

## Why it matters

Synthetic data can bootstrap evals, fine-tuning and safety tests before enough real data exists. In a grounded AI lab, it should remain traceable and evaluated because generated examples can encode model errors.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/etl`](../../packages/etl/README.md) | Lists synthetic data generation as an ETL responsibility. |
| [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md) | Can use generated instruction data for adaptation. |
| [`packages/evals`](../../packages/evals/README.md) | Can create task suites and regression examples. |
| [`experiments/jailbreak-defense`](../../experiments/jailbreak-defense/README.md) | Can generate attack variants for guardrail testing. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Scale vs realism** | Synthetic data is cheap to scale but may not match real users or documents. |
| **Model bias** | Generated data can inherit the generator's assumptions and blind spots. |
| **Validation cost** | High-value synthetic datasets still need review or eval-based filtering. |
