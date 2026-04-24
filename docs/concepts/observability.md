# Observability

## What it is

**Observability** is the ability to inspect system behavior through traces, metrics, logs and structured events. In AI systems, this includes model usage, token counts, retrieval steps, latency, cost, errors and quality signals.

## Why it matters

Grounded AI systems involve many stages. Observability makes it possible to understand why an answer was slow, expensive, unsupported, blocked or different from a previous run.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/observability`](../../packages/observability/README.md) | Owns tracing, metrics, cost tracking and telemetry hooks. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Uses cost and latency data to inform routing policies. |
| [`packages/rag`](../../packages/rag/README.md) | Exposes retrieval, reranking and context assembly stages. |
| [`apps/api/src/rag-service.ts`](../../apps/api/src/rag-service.ts) | Emits Dev Mode retrieval spans (chunk count, score stats, latency) and per-stage token/latency metrics. |
| [`packages/agents`](../../packages/agents/README.md) | Traces tool calls and multi-step execution. |
| [`packages/safety`](../../packages/safety/README.md) | Logs guardrail decisions for auditing. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Visibility vs overhead** | Detailed telemetry can add storage, latency and instrumentation cost. |
| **Debugging vs privacy** | Logs must avoid storing sensitive prompts or documents unnecessarily. |
| **Signal vs noise** | Too many metrics can hide the few that matter for reliability. |
