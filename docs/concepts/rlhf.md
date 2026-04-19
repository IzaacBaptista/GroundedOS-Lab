# RLHF

## What it is

**RLHF (Reinforcement Learning from Human Feedback)** is a model alignment approach that uses human preference data to train or optimize model behavior.

## Why it matters

RLHF explains how many modern assistant models become more helpful, instruction-following and policy-aware. In GroundedOS Lab it is primarily an advanced adaptation concept that informs evaluation, preference data design and safety thinking.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md) | Provides the closest adaptation workflow for supervised or preference-style datasets. |
| [`packages/evals`](../../packages/evals/README.md) | Supplies preference and quality signals needed before alignment work. |
| [`packages/safety`](../../packages/safety/README.md) | Defines the safety behaviors that alignment should preserve. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares aligned variants against base models. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Alignment vs complexity** | RLHF can improve behavior but requires specialized data and training infrastructure. |
| **Preference quality** | Noisy or inconsistent feedback can produce unstable behavior. |
| **Reward hacking** | Models can learn to satisfy the reward signal without improving true usefulness. |
