# LLM

## What it is

A **Large Language Model (LLM)** is a model trained to predict, generate and transform language-like token sequences. In an application architecture, the LLM is the reasoning and generation engine that receives prompts, retrieved context, tool results and instructions, then produces an output.

## Why it matters

GroundedOS Lab is built around the idea that LLMs should be observable, grounded and evaluated instead of treated as opaque APIs. Understanding the LLM boundary makes it easier to reason about prompt design, context assembly, model routing, cost, latency and failure modes.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/model-routing`](../../packages/model-routing/README.md) | Chooses which LLM or provider should serve a request. |
| [`packages/rag`](../../packages/rag/README.md) | Assembles grounded context before the LLM generates an answer. |
| [`packages/agents`](../../packages/agents/README.md) | Uses LLM calls inside agent execution loops and tool decisions. |
| [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | Runs controlled prompt and model experiments. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares LLM latency, cost and quality. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Capability vs cost** | Larger models often improve reasoning quality but increase latency and spend. |
| **General knowledge vs grounding** | An LLM can answer from pretraining, but GroundedOS Lab favors retrieved evidence for auditable answers. |
| **Flexibility vs determinism** | Generation is powerful but probabilistic, so evals and guardrails are required around important flows. |
