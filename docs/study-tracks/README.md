# Guided Study Tracks

Guided Study Tracks are learning routes across the existing GroundedOS Lab architecture. They do not introduce new runtime modules. Each track connects concepts to the documentation, packages, experiments, and roadmap phases that already frame the project.

## How to use this page

1. Pick the track that matches the topic you want to study.
2. Read the linked concept files first.
3. Open the related package or experiment README to see where the concept belongs in the system.
4. Use the roadmap phase as the implementation context for future work.

## Status

In progress (Phase 6 documentation rollout): tracks are aligned to implemented
phases through Phase 5 and updated as new roadmap slices land.

## Track Index

| Track | Focus | Roadmap alignment |
|---|---|---|
| [Track 1 - LLM Foundations](#track-1---llm-foundations) | Core model mechanics, inference and generation controls | Cross-cutting foundation, Phase 4 - Lab |
| [Track 2 - Multi-Modal & Agents](#track-2---multi-modal--agents) | Multimodal ingestion, tool use, agents and memory | Phase 0 - Data Foundation, Phase 2b - Persistent Memory, Phase 3 - Intelligence |
| [Track 3 - Open-Source Ecosystem](#track-3---open-source-ecosystem) | Hugging Face, local models, quantization and deployment trade-offs | Phase 4 - Lab, Phase 5 - Advanced ML |
| [Track 4 - Evaluation & Comparison](#track-4---evaluation--comparison) | Evals, observability, cost analysis, A/B testing and benchmarking | Phase 3 - Intelligence, Phase 4 - Lab |
| [Track 5 - Advanced RAG](#track-5---advanced-rag) | Retrieval, embeddings, search quality, grounding and lineage | Phase 0 - Data Foundation, Phase 1 - Core RAG, Phase 2 - Retrieval Quality |
| [Track 6 - Fine-tuning & Adaptation](#track-6---fine-tuning--adaptation) | Fine-tuning, LoRA, distillation and synthetic data | Phase 5 - Advanced ML |
| [Track 7 - Autonomous AI Systems](#track-7---autonomous-ai-systems) | Planning, memory, self-reflection and guardrails | Phase 3 - Intelligence |

## Track 1 - LLM Foundations

| Concepts | Repo map | Roadmap |
|---|---|---|
| [LLM](../concepts/llm.md), [Transformer](../concepts/transformer.md), [Inference](../concepts/inference.md), [Context Window](../concepts/context-window.md), [Weights](../concepts/weights.md), [Temperature / Top-P / Top-K](../concepts/temperature-top-p-top-k.md) | [`packages/core`](../../packages/core/README.md), [`packages/model-routing`](../../packages/model-routing/README.md), [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md), [`packages/benchmarks`](../../packages/benchmarks/README.md) | Cross-cutting foundation, [Phase 4 - Lab](../../README.md#phase-4--lab) |

## Track 2 - Multi-Modal & Agents

| Concepts | Repo map | Roadmap |
|---|---|---|
| [Multimodality](../concepts/multimodality.md), [Tool Calling](../concepts/tool-calling.md), [Multi-agents](../concepts/multi-agents.md), [Memory](../concepts/memory.md) | [`packages/etl`](../../packages/etl/README.md), [`packages/agents`](../../packages/agents/README.md), [`packages/memory`](../../packages/memory/README.md), [`packages/core`](../../packages/core/README.md) | [Phase 0 - Data Foundation](../../README.md#phase-0--data-foundation), [Phase 2b - Persistent Memory](../../README.md#phase-2b--persistent-memory), [Phase 3 - Intelligence](../../README.md#phase-3--intelligence) |

## Track 3 - Open-Source Ecosystem

| Concepts | Repo map | Roadmap |
|---|---|---|
| [Hugging Face](../concepts/hugging-face.md), [Local Models](../concepts/local-models.md), [Quantization](../concepts/quantization.md), [Weights](../concepts/weights.md), [Inference Trade-offs](../concepts/inference-trade-offs.md) | [`experiments/quantization`](../../experiments/quantization/README.md), [`packages/model-routing`](../../packages/model-routing/README.md), [`packages/benchmarks`](../../packages/benchmarks/README.md), [`experiments/lora`](../../experiments/lora/README.md) | [Phase 4 - Lab](../../README.md#phase-4--lab), [Phase 5 - Advanced ML](../../README.md#phase-5--advanced-ml) |

## Track 4 - Evaluation & Comparison

| Concepts | Repo map | Roadmap |
|---|---|---|
| [Evals](../concepts/evals.md), [Observability](../concepts/observability.md), [Cost Analysis](../concepts/cost-analysis.md), [A/B Testing](../concepts/ab-testing.md), [Benchmarking](../concepts/benchmarking.md) | [`packages/evals`](../../packages/evals/README.md), [`packages/observability`](../../packages/observability/README.md), [`packages/benchmarks`](../../packages/benchmarks/README.md), [`packages/experiment-toolkit`](../../packages/experiment-toolkit/README.md) | [Phase 3 - Intelligence](../../README.md#phase-3--intelligence), [Phase 4 - Lab](../../README.md#phase-4--lab) |

## Track 5 - Advanced RAG

| Concepts | Repo map | Roadmap |
|---|---|---|
| [RAG](../concepts/rag.md), [Embeddings](../concepts/embeddings.md), [Chunking](../concepts/chunking.md), [Vector Database](../concepts/vector-database.md), [Hybrid Search](../concepts/hybrid-search.md), [Re-ranking](../concepts/re-ranking.md), [Grounding](../concepts/grounding.md), [Semantic Caching](../concepts/semantic-caching.md), [Data Lineage](../concepts/data-lineage.md) | [`packages/rag`](../../packages/rag/README.md), [`packages/etl`](../../packages/etl/README.md), [`packages/core`](../../packages/core/README.md), [`packages/observability`](../../packages/observability/README.md) | [Phase 0 - Data Foundation](../../README.md#phase-0--data-foundation), [Phase 1 - Core RAG](../../README.md#phase-1--core-rag), [Phase 2 - Retrieval Quality](../../README.md#phase-2--retrieval-quality) |

## Track 6 - Fine-tuning & Adaptation

| Concepts | Repo map | Roadmap |
|---|---|---|
| [Fine-tuning](../concepts/fine-tuning.md), [LoRA](../concepts/lora.md), [Distillation](../concepts/distillation.md), [Data Augmentation](../concepts/data-augmentation.md), [Synthetic Data](../concepts/synthetic-data.md), [RLHF](../concepts/rlhf.md) | [`experiments/fine-tuning`](../../experiments/fine-tuning/README.md), [`experiments/lora`](../../experiments/lora/README.md), [`experiments/distillation`](../../experiments/distillation/README.md), [`packages/evals`](../../packages/evals/README.md), [`packages/benchmarks`](../../packages/benchmarks/README.md) | [Phase 5 - Advanced ML](../../README.md#phase-5--advanced-ml) |

## Track 7 - Autonomous AI Systems

| Concepts | Repo map | Roadmap |
|---|---|---|
| [Multi-agents](../concepts/multi-agents.md), [Planning](../concepts/planning.md), [Memory](../concepts/memory.md), [Self-reflection](../concepts/self-reflection.md), [Guardrails](../concepts/guardrails.md) | [`packages/agents`](../../packages/agents/README.md), [`packages/memory`](../../packages/memory/README.md), [`packages/safety`](../../packages/safety/README.md), [`packages/evals`](../../packages/evals/README.md) | [Phase 3 - Intelligence](../../README.md#phase-3--intelligence) |
