# Tool Calling

## What it is

**Tool calling** is a pattern where a model or agent selects a structured function call instead of directly answering with free-form text. The application executes the tool, then feeds the result back into the model or workflow.

## Why it matters

Tool calling lets LLM systems act on external capabilities: retrieval, database lookup, file processing, calculators, APIs and safety checks. It also makes agent behavior more inspectable because tool names, arguments and outputs can be logged.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/agents`](../../packages/agents/README.md) | Defines agent execution loops and function-calling interfaces. |
| [`packages/safety`](../../packages/safety/README.md) | Can validate inputs, outputs and tool use against guardrails. |
| [`packages/observability`](../../packages/observability/README.md) | Traces tool calls, latency and errors across agent flows. |
| [`packages/rag`](../../packages/rag/README.md) | Retrieval can be exposed as a tool inside an agent workflow. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Power vs control** | Tools expand capability but require permissioning and validation. |
| **Schema design** | Poor argument schemas make tool use brittle and hard to evaluate. |
| **Latency** | Multi-step tool workflows can be slower than direct generation. |
