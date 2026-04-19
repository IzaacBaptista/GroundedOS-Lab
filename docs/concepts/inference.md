# Inference

## What it is

**Inference** is the process of running a trained model to produce outputs from inputs. For LLM systems, inference includes prompt assembly, token generation, decoding parameters, provider selection and response handling.

## Why it matters

Most user-visible quality and cost decisions happen during inference. The same model can behave differently depending on retrieved context, temperature, token budget, local or cloud execution, and guardrails around the response.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/model-routing`](../../packages/model-routing/README.md) | Selects local or cloud inference paths based on policy. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Measures inference latency, throughput, cost and quality. |
| [`packages/observability`](../../packages/observability/README.md) | Records token usage, latency and model usage per request. |
| [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | Runs repeated inference calls under controlled prompt and parameter settings. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Latency vs quality** | More tokens, larger models and retrieval steps can improve quality but slow responses. |
| **Local vs cloud** | Local inference improves control and cost predictability, while cloud inference can provide stronger models. |
| **Determinism vs creativity** | Lower randomness improves reproducibility; higher randomness can improve exploration. |
