# Grounding

## What it is

**Grounding** means tying model outputs to specific evidence, such as retrieved chunks, source documents, tool results or structured data.

## Why it matters

GroundedOS Lab is explicitly focused on grounded AI systems. Grounding reduces unsupported answers, enables source attribution and gives evals and guardrails something concrete to verify.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Supplies evidence for answer generation. |
| [`packages/safety`](../../packages/safety/README.md) | Enforces output validation and hallucination detection. |
| [`packages/evals`](../../packages/evals/README.md) | Scores faithfulness against retrieved evidence. |
| [`packages/observability`](../../packages/observability/README.md) | Records grounding sources and hallucination signals. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Strictness vs usefulness** | Overly strict grounding can block reasonable synthesis. |
| **Citation quality** | A cited source can still be irrelevant if retrieval or attribution is weak. |
| **Context pressure** | Evidence consumes token budget that could otherwise hold instructions or memory. |
