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
| [`packages/<name>`](../../packages/) | <One-line description of the usage.> |

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

In progress (Phase 6 documentation rollout): concept index covers implemented
phases through Phase 5, with Phase 6 topics (infra/deploy/auth) referenced in
roadmap-aligned docs.

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
| [memory.md](./memory.md) | Memory | Track 2 - Multi-Modal & Agents, Track 7 - Autonomous AI Systems | Phase 2b - Persistent Memory |
| [hugging-face.md](./hugging-face.md) | Hugging Face | Track 3 - Open-Source Ecosystem | Phase 5 - Advanced ML |
| [local-models.md](./local-models.md) | Local Models | Track 3 - Open-Source Ecosystem | Phase 4 - Lab |
| [quantization.md](./quantization.md) | Quantization | Track 3 - Open-Source Ecosystem | Phase 5 - Advanced ML |
| [inference-trade-offs.md](./inference-trade-offs.md) | Inference Trade-offs | Track 3 - Open-Source Ecosystem | Phase 4 - Lab |
| [evals.md](./evals.md) | Evals | Track 4 - Evaluation & Comparison | Phase 3 - Intelligence |
| [observability.md](./observability.md) | Observability | Track 4 - Evaluation & Comparison | Phase 2 - Retrieval Quality |
| [cost-analysis.md](./cost-analysis.md) | Cost Analysis | Track 4 - Evaluation & Comparison | Phase 4 - Lab |
| [cost-governance.md](./cost-governance.md) | Cost Governance | Track 4 - Evaluation & Comparison | Phase 2 - Retrieval Quality |
| [trade-offs-dashboard.md](./trade-offs-dashboard.md) | Trade-offs Dashboard | Track 4 - Evaluation & Comparison | Phase 2 - Retrieval Quality |
| [ab-testing.md](./ab-testing.md) | A/B Testing | Track 4 - Evaluation & Comparison | Phase 4 - Lab |
| [benchmarking.md](./benchmarking.md) | Benchmarking | Track 4 - Evaluation & Comparison | Phase 4 - Lab |
| [rag.md](./rag.md) | RAG | Track 5 - Advanced RAG | Phase 1 - Core RAG |
| [embeddings.md](./embeddings.md) | Embeddings | Track 5 - Advanced RAG | Phase 1 - Core RAG |
| [chunking.md](./chunking.md) | Chunking | Track 5 - Advanced RAG | Phase 1 - Core RAG |
| [vector-database.md](./vector-database.md) | Vector Database | Track 5 - Advanced RAG | Phase 1 - Core RAG |
| [hybrid-search.md](./hybrid-search.md) | Hybrid Search | Track 5 - Advanced RAG | Phase 2 - Retrieval Quality |
| [graphrag.md](./graphrag.md) | GraphRAG | Track 5 - Advanced RAG | Advanced retrieval phase |
| [adaptive-rag.md](./adaptive-rag.md) | Adaptive RAG | Track 5 - Advanced RAG | Advanced retrieval phase |
| [hyde.md](./hyde.md) | HyDE | Track 5 - Advanced RAG | Advanced retrieval phase |
| [raptor.md](./raptor.md) | RAPTOR | Track 5 - Advanced RAG | Advanced retrieval phase |
| [re-ranking.md](./re-ranking.md) | Re-ranking | Track 5 - Advanced RAG | Phase 2 - Retrieval Quality |
| [grounding.md](./grounding.md) | Grounding | Track 5 - Advanced RAG | Phase 3 - Intelligence |
| [semantic-caching.md](./semantic-caching.md) | Semantic Caching | Track 5 - Advanced RAG | Phase 4 - Lab |
| [data-lineage.md](./data-lineage.md) | Data Lineage | Track 5 - Advanced RAG | Phase 0 - Data Foundation |
| [uniform-document-schema.md](./uniform-document-schema.md) | Uniform Document Schema | Track 5 - Advanced RAG | Phase 0 - Data Foundation |
| [data-contracts.md](./data-contracts.md) | Data Contracts & Schemas | Track 5 - Advanced RAG | Phase 2 - Retrieval Quality |
| [query-understanding.md](./query-understanding.md) | Query Understanding | Track 5 - Advanced RAG | Phase 2 - Retrieval Quality |
| [workflow-orchestration.md](./workflow-orchestration.md) | Workflow Orchestration | Track 7 - Autonomous AI Systems | Phase 2 - Retrieval Quality |
| [long-term-memory.md](./long-term-memory.md) | Long-Term Memory | Track 7 - Autonomous AI Systems | Phase 2b - Persistent Memory |
| [fine-tuning.md](./fine-tuning.md) | Fine-tuning | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [lora.md](./lora.md) | LoRA | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [distillation.md](./distillation.md) | Distillation | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [data-augmentation.md](./data-augmentation.md) | Data Augmentation | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [synthetic-data.md](./synthetic-data.md) | Synthetic Data | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [rlhf.md](./rlhf.md) | RLHF | Track 6 - Fine-tuning & Adaptation | Phase 5 - Advanced ML |
| [planning.md](./planning.md) | Planning | Track 7 - Autonomous AI Systems | Phase 3 - Intelligence |
| [self-reflection.md](./self-reflection.md) | Self-reflection | Track 7 - Autonomous AI Systems | Phase 3 - Intelligence |
| [guardrails.md](./guardrails.md) | Guardrails | Track 7 - Autonomous AI Systems | Phase 3 - Intelligence |
