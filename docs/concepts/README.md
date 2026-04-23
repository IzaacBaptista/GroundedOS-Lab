# concepts

Each file in this folder represents one AI concept relevant to the GroundedOS Lab project.

## Structure

Every concept file must describe:

- **What it is** — a clear definition of the concept
- **Why it matters** — its relevance to modern AI systems
- **Where it is used** — the specific packages or experiments in this project that apply it
- **Trade-offs** — known limitations, costs or design tensions

## Concept file template

Copy the block below when creating a new concept file. Every heading is required.

```markdown
# <Concept Name>

## What it is

<One- or two-sentence definition. Be precise — avoid jargon where possible.>

## Why it matters

<Explain the role this concept plays in real AI systems and why a builder needs to understand it.>

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/<name>`](../../packages/<name>/README.md) | <One-line description of the usage.> |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **<Trade-off label>** | <Concrete explanation of the cost, limitation or design tension.> |
```

Rules:
- Keep each file self-contained. A reader should not need to open other files to understand the concept.
- Link packages and experiments using relative paths from `docs/concepts/`.
- List at least one trade-off. "No trade-offs" is almost never true.
- Do not duplicate another concept's content — cross-link instead.

## Responsibilities

- Document foundational AI concepts (LLM, RAG, Agents, Embeddings, etc.)
- Explain optimization techniques (LoRA, Quantization, Distillation)
- Cover safety and evaluation concepts (Guardrails, Hallucination, Bias)
- Keep each concept file self-contained and accessible to new contributors

## Status

🟡 In Progress

## Concept Index

Some concepts appear in more than one track. The table below lists the primary learning route for each concept.

| File | Concept | Study Track | Phase |
|---|---|---|---|
| [llm.md](./llm.md) | LLM | Track 1 - LLM Foundations | Cross-cutting foundation |
| [transformer.md](./transformer.md) | Transformer | Track 1 - LLM Foundations | Cross-cutting foundation, Phase 5 - Advanced ML |
| [inference.md](./inference.md) | Inference | Track 1 - LLM Foundations | Phase 4 - Lab |
| [context-window.md](./context-window.md) | Context Window | Track 1 - LLM Foundations | Phase 1 - Core RAG |
| [weights.md](./weights.md) | Weights | Track 1 - LLM Foundations, Track 3 - Open-Source Ecosystem | Phase 5 - Advanced ML |
| [temperature-top-p-top-k.md](./temperature-top-p-top-k.md) | Temperature / Top-P / Top-K | Track 1 - LLM Foundations | Phase 4 - Lab |
| [multimodality.md](./multimodality.md) | Multimodality | Track 2 - Multi-Modal & Agents | Phase 0 - Data Foundation |
| [tool-calling.md](./tool-calling.md) | Tool Calling | Track 2 - Multi-Modal & Agents | Phase 3 - Intelligence |
| [multi-agents.md](./multi-agents.md) | Multi-agents | Track 2 - Multi-Modal & Agents, Track 7 - Autonomous AI Systems | Phase 3 - Intelligence |
| [memory.md](./memory.md) | Memory | Track 2 - Multi-Modal & Agents, Track 7 - Autonomous AI Systems | Phase 2 - Quality |
| [hugging-face.md](./hugging-face.md) | Hugging Face | Track 3 - Open-Source Ecosystem | Phase 5 - Advanced ML |
| [local-models.md](./local-models.md) | Local Models | Track 3 - Open-Source Ecosystem | Phase 4 - Lab |
| [quantization.md](./quantization.md) | Quantization | Track 3 - Open-Source Ecosystem | Phase 5 - Advanced ML |
| [inference-trade-offs.md](./inference-trade-offs.md) | Inference Trade-offs | Track 3 - Open-Source Ecosystem | Phase 4 - Lab |
| [evals.md](./evals.md) | Evals | Track 4 - Evaluation & Comparison | Phase 3 - Intelligence |
| [observability.md](./observability.md) | Observability | Track 4 - Evaluation & Comparison | Phase 2 - Quality |
| [cost-analysis.md](./cost-analysis.md) | Cost Analysis | Track 4 - Evaluation & Comparison | Phase 4 - Lab |
| [ab-testing.md](./ab-testing.md) | A/B Testing | Track 4 - Evaluation & Comparison | Phase 4 - Lab |
| [benchmarking.md](./benchmarking.md) | Benchmarking | Track 4 - Evaluation & Comparison | Phase 4 - Lab |
| [rag.md](./rag.md) | RAG | Track 5 - Advanced RAG | Phase 1 - Core RAG |
| [embeddings.md](./embeddings.md) | Embeddings | Track 5 - Advanced RAG | Phase 1 - Core RAG |
| [chunking.md](./chunking.md) | Chunking | Track 5 - Advanced RAG | Phase 1 - Core RAG |
| [vector-database.md](./vector-database.md) | Vector Database | Track 5 - Advanced RAG | Phase 1 - Core RAG |
| [hybrid-search.md](./hybrid-search.md) | Hybrid Search | Track 5 - Advanced RAG | Phase 2 - Quality |
| [re-ranking.md](./re-ranking.md) | Re-ranking | Track 5 - Advanced RAG | Phase 2 - Quality |
| [grounding.md](./grounding.md) | Grounding | Track 5 - Advanced RAG | Phase 3 - Intelligence |
| [semantic-caching.md](./semantic-caching.md) | Semantic Caching | Track 5 - Advanced RAG | Phase 4 - Lab |
| [data-lineage.md](./data-lineage.md) | Data Lineage | Track 5 - Advanced RAG | Phase 0 - Data Foundation |
| [uniform-document-schema.md](./uniform-document-schema.md) | Uniform Document Schema | Track 5 - Advanced RAG | Phase 0 - Data Foundation |
| [fine-tuning.md](./fine-tuning.md) | Fine-tuning | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [lora.md](./lora.md) | LoRA | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [distillation.md](./distillation.md) | Distillation | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [data-augmentation.md](./data-augmentation.md) | Data Augmentation | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [synthetic-data.md](./synthetic-data.md) | Synthetic Data | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [rlhf.md](./rlhf.md) | RLHF | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [planning.md](./planning.md) | Planning | Track 7 - Autonomous AI Systems | Phase 3 - Intelligence |
| [self-reflection.md](./self-reflection.md) | Self-reflection | Track 7 - Autonomous AI Systems | Phase 3 - Intelligence |
| [guardrails.md](./guardrails.md) | Guardrails | Track 7 - Autonomous AI Systems | Phase 3 - Intelligence |
