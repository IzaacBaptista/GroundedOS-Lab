# 🧠 GroundedOS Lab

> Build, evaluate and understand grounded AI systems — from RAG pipelines to multi-agent orchestration.

**An open-source platform to build, study and evaluate grounded AI systems using LLMs, RAG, Agents and advanced inference pipelines.**

> ⚠️ This project is a learning and experimentation platform for modern AI systems.
> It intentionally exposes internal mechanics such as RAG pipelines, agent orchestration, evaluation, observability and safety layers.

---

![alt text](image-1.png)

---

## 🚀 Overview

GroundedOS Lab is a **product + laboratory + engineering platform** designed to help developers:

* Build real AI-powered applications
* Understand how modern AI systems work internally
* Evaluate quality, cost and performance
* Experiment safely with cutting-edge techniques

This is not just a chatbot.
This is a **complete system for grounded AI**.

---

## 🎯 Goals

* Deliver a **usable AI assistant**
* Expose **internal mechanics of LLM systems**
* Enable **experimentation and benchmarking**
* Serve as a **learning platform**
* Demonstrate **production-ready architecture**

---

## ⚡ Local-First Philosophy

GroundedOS Lab is designed to run **locally first**, with optional cloud integration as the project evolves.

Goals:

* Enable local model execution for experimentation
* Compare local vs cloud performance
* Reduce or eliminate dependency on paid APIs during experimentation

Planned / target integrations:

* Local Transformers (quantized models)
* Ollama-based local execution
* OpenAI / Anthropic APIs (optional, planned)

---

## 🧩 Core Features

### 💬 AI Assistant (User Mode)

* Chat with documents, images and audio
* Grounded responses with source attribution
* Memory-aware conversations

### 🧠 Dev Mode

* Inspect:

  * retrieved chunks
  * token usage
  * latency
  * model routing decisions
  * grounding sources

### 🧪 Lab Mode

* Prompt A/B testing
* Jailbreak playground
* Model benchmarking
* Embedding visualization
* Cost analysis

---

## 🏗️ Architecture

```text
User Input
   ↓
Prompt / Context Engineering
   ↓
Model Routing
   ↓
--------------------------------
| Semantic Cache (optional)     |
--------------------------------
   ↓
(Adaptive RAG Decision)
   ↓
--------------------------------
| RAG Pipeline                 |
| - ETL                        |
| - Chunking                   |
| - Embeddings                 |
| - Hybrid Search              |
| - Re-ranking                 |
--------------------------------
   ↓
Multi-Agent Orchestration
   ↓
Tool Calling Layer
   ↓
LLM Inference
   ↓
Self-Reflection / Validation
   ↓
Guardrails & Safety Layer
   ↓
Response + Data Lineage
   ↓
--------------------------------
| Feedback Loop                |
| → Evaluation (Evals)         |
| → Observability              |
| → Memory Update              |
--------------------------------
```

---

## 🧠 Concepts Implemented

### 🔹 Core AI

* LLM
* Transformer
* Weights
* Context Window
* Inference

### 🔹 Retrieval & Data

* RAG
* Embeddings
* Vector Database
* Chunking
* Hybrid Search
* Re-ranking
* Knowledge Graphs (GraphRAG)
* Data Lineage

### 🔹 Context & Reasoning

* Prompt Engineering
* Context Engineering
* System Prompt
* Few-shot / Zero-shot Learning
* Chain-of-Thought (CoT)
* Self-Reflection / Self-Correction
* Grounding
* Context Pruning / Trimming
* Adaptive RAG

### 🔹 Agents & Execution

* Multi-agents
* Tool Calling / Function Calling
* Memory

### 🔹 Optimization

* Model Routing
* Quantization
* LoRA
* Distillation
* Fine-tuning

### 🔹 Generation Control

* Temperature
* Top-P / Top-K
* Tokenization

### 🔹 Data Engineering

* ETL for LLM
* Data Augmentation
* Synthetic Data Generation
* Uniform Document Schema

### 🔹 Performance

* Latency / Throughput
* Semantic Caching

### 🔹 Evaluation & Observability

* Evaluation (Evals)
* Observability
* Cost Analysis (Showback/Chargeback)
* A/B Testing of Prompts

### 🔹 Safety & Reliability

* Guardrails
* Hallucination Detection
* Bias Evaluation
* PII Stripping
* Jailbreaking Defense

### 🔹 Multimodality

* Text
* PDF
* Image
* Audio

### 🔹 Structured Systems

* Structured Outputs (planned via Pydantic / schema validation)

---

## 👥 Target Audience

GroundedOS Lab is built for:

| Audience | What you get |
|---|---|
| **AI/ML Engineers** | A structured monorepo to experiment with RAG, agents, evals, and safety in a real-world architecture |
| **Backend Engineers** | Hands-on exposure to LLM-powered pipelines, model routing, observability, and async workers |
| **Students & Researchers** | A documented learning map that connects concepts (embeddings, CoT, guardrails) directly to working code |
| **Technical Leaders** | A reference architecture for grounded AI systems, including cost tracking, evaluation and safety layers |

> ⚠️ This project assumes basic Python and TypeScript knowledge. No prior AI/ML experience is required — the goal is to build it as you learn.

---

## 🗺️ How to Learn With This Repo

Use this repository as a structured learning path:

* Want the big-picture introduction?
  → Start with [🚀 Overview](#-overview)

* Want to understand the platform goals and learning focus?
  → Review the introduction at the top of this document

* Interested in the hands-on module concepts?
  → Jump to [🔬 Laboratory Modules](#-laboratory-modules)

* Looking for evals, agents, guardrails, routing, or prompt experimentation?
  → Browse the [`packages/`](./packages/) and [`experiments/`](./experiments/) folders — each has its own `README.md`

* Want to understand AI concepts behind the system?
  → Start at [`docs/concepts/`](./docs/concepts/)

* Want a guided learning path by topic?
  → Explore the [📘 Guided Study Tracks](./docs/study-tracks/README.md)

As the project evolves, this section will map each concept directly to code implementations.

---

## 📘 Guided Study Tracks

Guided Study Tracks are topic-based routes through the existing GroundedOS Lab documentation, packages, experiments and roadmap phases.

Start here:

* [Track 1 - LLM Foundations](./docs/study-tracks/README.md#track-1---llm-foundations): model basics, Transformer concepts, inference, context windows and generation controls
* [Track 2 - Multi-Modal & Agents](./docs/study-tracks/README.md#track-2---multi-modal--agents): multimodal ingestion, tool calling, multi-agent flows and memory
* [Track 3 - Open-Source Ecosystem](./docs/study-tracks/README.md#track-3---open-source-ecosystem): Hugging Face, local models, quantization and inference trade-offs
* [Track 4 - Evaluation & Comparison](./docs/study-tracks/README.md#track-4---evaluation--comparison): evals, observability, cost analysis, A/B testing and benchmarking
* [Track 5 - Advanced RAG](./docs/study-tracks/README.md#track-5---advanced-rag): embeddings, chunking, vector databases, hybrid search, reranking, grounding and lineage
* [Track 6 - Fine-tuning & Adaptation](./docs/study-tracks/README.md#track-6---fine-tuning--adaptation): fine-tuning, LoRA, distillation, data augmentation, synthetic data and RLHF
* [Track 7 - Autonomous AI Systems](./docs/study-tracks/README.md#track-7---autonomous-ai-systems): planning, self-reflection, memory, multi-agent collaboration and guardrails

---

## 🔬 Laboratory Modules

### 🧪 experiment-toolkit

* Batch testing:

  * prompts
  * temperature
  * top-p
  * models

### ⚡ benchmarks

* Compare:

  * local vs cloud models
  * latency
  * cost
  * quality

### 📊 viz

* Embedding visualization (t-SNE / UMAP)
* similarity maps
* clustering

---

## 🔐 Safety Layer

* Prompt injection detection
* Jailbreak protection
* PII sanitization
* Output validation
* Grounding enforcement

---

## 📊 Observability

* Token usage
* Cost per request
* Latency per stage
* Model usage
* Error rates
* Hallucination signals
* Cache hit rate

---

## 💡 Unique Features

### 🚨 Guardrails Playground

Try to break the system and see:

* why it was blocked
* which rule triggered

### 🧩 Chunk Visualizer

See:

* which chunks were used
* relevance score
* document origin

### ⚡ Local vs Cloud Toggle

Compare:

* latency
* cost
* quality

### 🧪 Prompt A/B Testing

Compare prompts with automatic eval scoring

---

## 🗂️ Project Structure

> The monorepo scaffold below is **already created**. Each folder contains a `README.md` describing its responsibilities. Code implementation follows the roadmap phases.

```text
groundedos-lab/
  apps/
    api/        ← Backend API server (REST + GraphQL, auth, pipeline orchestration)
    web/        ← Frontend application (Next.js)
    worker/     ← Async workers for ML pipelines and background tasks

  packages/
    core/               ← Shared types, utilities, and base abstractions
    rag/                ← Full RAG pipeline (chunking, embeddings, hybrid search, re-ranking)
    agents/             ← Multi-agent orchestration and tool calling layer
    memory/             ← Conversation and long-term memory management
    model-routing/      ← LLM routing logic (local vs cloud, cost-aware)
    safety/             ← Guardrails, PII stripping, jailbreak defense
    observability/      ← OpenTelemetry tracing, cost tracking, latency metrics
    evals/              ← Evaluation framework (RAGAS, custom scorers)
    etl/                ← Document ingestion and preprocessing pipelines
    experiment-toolkit/ ← Batch prompt testing, parameter sweeps
    benchmarks/         ← Local vs cloud model benchmarking
    viz/                ← Embedding visualization (t-SNE / UMAP)

  experiments/
    fine-tuning/        ← Full fine-tuning experiments
    lora/               ← LoRA adapter training
    distillation/       ← Knowledge distillation
    quantization/       ← Model quantization experiments
    jailbreak-defense/  ← Red-teaming and prompt injection defense
    bias-tests/         ← Bias evaluation across models and prompts

  docs/
    concepts/           ← One file per AI concept, linked to code
  
  datasets/   ← Raw, processed and synthetic datasets registry
  infra/      ← Docker, Compose, K8s, environment configs
```

---

## ⚙️ Tech Stack (Planned)

> ⚠️ The tech stack below describes the **intended target architecture**. Tooling configuration (package.json, turbo.json, etc.) will be added before Phase 0 coding begins.

* Frontend: Next.js + TypeScript
* Backend: Node.js (Fastify/Nest)
* Workers: Python (ML pipelines)
* Database: PostgreSQL
* Vector DB: pgvector / Qdrant
* Queue: Redis + BullMQ
* Observability: OpenTelemetry + Grafana
* AI: Local (Ollama, planned) + OpenAI / Anthropic (optional, planned)

---

## 🧪 Roadmap

### Phase 0 — Data Foundation

* Uniform Document Schema
* Multimodal ingestion standardization
* ETL pipeline

**✅ Success Criteria:**
- [x] `packages/core` defines `SourceDocument` and `NormalizedDocument` — the [Uniform Document Schema](./docs/concepts/uniform-document-schema.md)
- [ ] `packages/etl` ingests PDF, image and audio files into a uniform schema
- [ ] At least one sample dataset registered in `datasets/`
- [ ] ETL pipeline is runnable locally with a single command

### Phase 1 — Core RAG

* Chunking
* Embeddings
* Vector DB
* Chat

**✅ Success Criteria:**
- [ ] User can upload a document and ask a question grounded in its content
- [ ] Retrieved chunks are visible in Dev Mode with relevance scores
- [ ] `packages/rag` has integration tests covering the full retrieval flow

### Phase 2 — Quality

* Hybrid search
* Re-ranking
* Memory
* Observability

**✅ Success Criteria:**
- [ ] Hybrid search (dense + sparse) demonstrably improves retrieval vs dense-only baseline
- [ ] Re-ranking is applied and token usage / latency per stage is logged
- [ ] Conversation memory persists across sessions

### Phase 3 — Intelligence

* Agents
* Tool calling
* Guardrails
* Evals
* Self-reflection / validation layer

**✅ Success Criteria:**
- [ ] At least one end-to-end agent flow is runnable (tool call → LLM → response)
- [ ] Guardrails block at least prompt injection and PII leakage
- [ ] Evals report automated scores (faithfulness, relevance) for a baseline dataset

### Phase 4 — Lab

* Benchmarking
* A/B testing
* Visualization
* Model routing

**✅ Success Criteria:**
- [ ] A/B prompt test runs automatically and reports winner with statistical summary
- [ ] Benchmark compares at least two models (local + cloud) on latency, cost and quality
- [ ] Embedding visualization renders in the web app

### Phase 5 — Advanced ML

* LoRA
* Quantization
* Fine-tuning
* Distillation

**✅ Success Criteria:**
- [ ] Each `experiments/` folder contains a reproducible notebook or script
- [ ] Benchmark scores compare base model vs tuned variant
- [ ] Results are logged and stored in `datasets/`

---

## 🧭 Execution Plan (Current)

To move from architecture scaffold to runnable foundation, the active plan is documented in:

- [`docs/phase-0-mvp-plan.md`](./docs/phase-0-mvp-plan.md)

### Current focus

- Extend the minimal monorepo tooling baseline as packages become runnable
- Add one sample dataset registry entry
- Keep roadmap checkboxes and package READMEs synchronized with implementation

---

## ⚙️ Monorepo Tooling

Initial TypeScript workspace tooling is configured so Phase 0 packages can be validated locally.

**Current stack:**

| Layer | Tool | Purpose |
|---|---|---|
| Package manager | `npm` workspaces | Manage JS/TS packages |
| Type checking | `TypeScript` strict mode | Static analysis across JS/TS packages |
| Testing (JS/TS) | `Vitest` | Unit and integration tests |

**Planned additions:**

| Layer | Tool | Purpose |
|---|---|---|
| Build orchestration | `Turborepo` | Incremental builds, task pipelines |
| Python environment | `Poetry` (per package) | Isolate ML package dependencies |
| Linting (JS/TS) | `ESLint` + `Prettier` | Code style and formatting |
| Linting (Python) | `Ruff` | Fast Python linter |
| Testing (Python) | `pytest` | Unit and integration tests |
| Containers | `Docker` + `docker-compose` | Local environment |
| CI | GitHub Actions | Test, lint and build on every PR |

**Repo conventions:**

* All packages declare their dependencies explicitly — no implicit sharing
* Active TypeScript packages are validated through root build and test scripts
* The root package scripts define the current validation pipeline
* Python packages pin dependencies via `pyproject.toml` and `poetry.lock`

---

## 🤝 Contributing

### Who can contribute?

Anyone — from students exploring AI to engineers building production systems.
Contributions at all levels are welcome: documentation, experiments, package implementations, bug reports, and feature ideas.

### Getting started

1. **Fork** the repository and create a new branch from `main`
2. **Pick a phase** from the [Roadmap](#-roadmap) and check the success criteria
3. **Find or open an issue** describing what you want to work on before starting large changes
4. **Follow the folder conventions**: each package or experiment has its own `README.md` — keep it updated

### Contribution types

| Type | Where | Notes |
|---|---|---|
| AI concept documentation | `docs/concepts/` | Follow the template in the folder's `README.md` |
| Package implementation | `packages/<name>/` | Start with the `README.md` in that package |
| Experiment | `experiments/<name>/` | Include a reproducible notebook or script |
| Dataset | `datasets/` | Include metadata (source, license, size) |
| Bug report / feature request | GitHub Issues | Use the issue templates |

### Code standards

* Write clear, self-contained code with inline comments for non-obvious logic
* Every package must have at least one test before being merged
* Use the tooling defined in [⚙️ Monorepo Tooling](#️-monorepo-tooling)
* All Python code must include type hints
* All TypeScript code must pass strict type checking

### Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] Code follows the style guide for the language (see Monorepo Tooling)
- [ ] Tests pass locally
- [ ] The relevant `README.md` is updated
- [ ] The PR description explains *what* changed and *why*

### Need help?

Open a GitHub Discussion or comment on an existing issue.
No question is too basic.

---

## 📚 Purpose

GroundedOS Lab exists to help developers:

* move beyond basic AI usage
* understand real-world AI systems
* build reliable and observable pipelines
* experiment safely and systematically

---

## 🧠 What This Project Is NOT

* Not a wrapper around an LLM API
* Not just a chatbot interface
* Not a toy project

This project focuses on system design, reliability, and real-world AI engineering.

---

## ⭐ Final Thought

This is not a demo.

This is a **laboratory for understanding grounded AI systems in production.**
