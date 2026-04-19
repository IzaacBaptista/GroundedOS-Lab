# Self-reflection

## What it is

**Self-reflection** is a pattern where a model or agent reviews its own intermediate work, output or plan before finalizing or continuing.

## Why it matters

Self-reflection can catch missing evidence, weak reasoning, unsafe output or poor tool choices. In GroundedOS Lab it belongs inside observable validation flows, not as an invisible claim that the system is correct.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/agents`](../../packages/agents/README.md) | Supports self-correction and review steps in agent flows. |
| [`packages/evals`](../../packages/evals/README.md) | Measures whether reflection improves task outcomes. |
| [`packages/safety`](../../packages/safety/README.md) | Uses validation checks before unsafe or unsupported output is returned. |
| [`packages/observability`](../../packages/observability/README.md) | Records validation stages and correction attempts. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Quality vs latency** | Reflection adds another model or validation step. |
| **False confidence** | A model can approve its own flawed answer without external evidence. |
| **Token cost** | Review prompts and intermediate outputs consume context and budget. |
