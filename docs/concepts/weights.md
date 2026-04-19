# Weights

## What it is

**Weights** are the learned numerical parameters of a model. They encode patterns learned during training and determine how the model transforms input tokens into output probabilities.

## Why it matters

Weights are central to local model execution, quantization, LoRA, fine-tuning and distillation. In GroundedOS Lab they matter most when comparing base models, tuned variants, local deployments and compression strategies.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/model-routing`](../../packages/model-routing/README.md) | Routes between model variants with different cost, size and quality profiles. |
| [`experiments/quantization`](../../experiments/quantization/README.md) | Compresses weights to reduce memory and latency. |
| [`experiments/lora`](../../experiments/lora/README.md) | Adds trainable adapter weights without fully updating the base model. |
| [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md) | Updates model weights for domain-specific behavior. |
| [`experiments/distillation`](../../experiments/distillation/README.md) | Trains smaller model weights to approximate a larger teacher. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Access vs convenience** | Open weights enable local experimentation, but require more infrastructure. |
| **Size vs quality** | Smaller or compressed weights may run faster but can lose capability. |
| **Adaptation risk** | Changing weights can improve a domain task while degrading general behavior. |
