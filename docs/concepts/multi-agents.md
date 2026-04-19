# Multi-agents

## What it is

**Multi-agent** systems coordinate multiple specialized agents or roles to solve tasks that benefit from decomposition, delegation, review or tool specialization.

## Why it matters

GroundedOS Lab models agents as part of an engineering system, not as magic autonomy. Multi-agent design must expose state, tool calls, memory, evaluation signals and guardrails so behavior can be inspected and improved.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/agents`](../../packages/agents/README.md) | Owns role definitions, delegation, communication and execution loops. |
| [`packages/memory`](../../packages/memory/README.md) | Stores state and context across agent runs. |
| [`packages/evals`](../../packages/evals/README.md) | Evaluates agent output quality, safety and task success. |
| [`packages/observability`](../../packages/observability/README.md) | Traces multi-step agent workflows. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Decomposition vs overhead** | More agents can clarify responsibilities but add latency and coordination cost. |
| **Autonomy vs auditability** | Agent decisions must remain traceable through logs and evals. |
| **State complexity** | Shared memory and intermediate results need clear ownership rules. |
