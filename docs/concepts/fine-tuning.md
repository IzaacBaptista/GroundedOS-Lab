# Fine-tuning

## What it is

**Fine-tuning** updates a pretrained model on additional task or domain-specific data so the model better follows desired behavior.

## Why it matters

Fine-tuning can improve style, task format or domain performance when prompting and RAG are not enough. GroundedOS Lab keeps fine-tuning as an advanced ML experiment layer so it can be compared against retrieval, prompt and routing alternatives.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md) | Owns supervised fine-tuning workflows and findings. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares tuned models against base models. |
| [`packages/evals`](../../packages/evals/README.md) | Measures quality, safety and regression risk. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Can route to tuned variants when appropriate. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Specialization vs generality** | Fine-tuning can improve target behavior while hurting broader capability. |
| **Data quality** | Bad training data can encode errors or unsafe behavior. |
| **Cost** | Training, evaluation and hosting tuned variants add operational overhead. |
