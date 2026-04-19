# Context Window

## What it is

A **context window** is the maximum amount of input and generated output a model can consider in one inference call, usually measured in tokens.

## Why it matters

Grounded systems must choose what evidence, memory, instructions and tool results fit into a limited context. Poor context assembly can hide relevant facts, waste tokens, increase latency or cause the model to answer from incomplete evidence.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Selects and assembles retrieved chunks into the prompt. |
| [`packages/memory`](../../packages/memory/README.md) | Summarizes or prunes memory before it enters the context. |
| [`packages/agents`](../../packages/agents/README.md) | Manages intermediate reasoning steps, tool outputs and task state. |
| [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | Tests prompt variants and token budget effects. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Recall vs token budget** | Adding more context may include the answer, but can dilute relevance and increase cost. |
| **Fresh evidence vs memory** | Retrieved documents and conversation memory compete for the same window. |
| **Long-window models** | Larger windows reduce truncation pressure but do not remove the need for ranking and pruning. |
