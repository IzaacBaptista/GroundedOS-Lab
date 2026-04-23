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
--------------------------------
| Session / Request Manager    |  ← lifecycle owner for the entire request
--------------------------------
   ↓
User Input
   ↓
Prompt / Context Engineering
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
--------------------------------
| Semantic Cache (optional)    |  ← operates on (query + retrieved context)
--------------------------------
   ↓
Model Routing                      ← context-informed: considers retrieved content,
   ↓                                 context length, cost and reasoning requirements
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

> **Architecture notes**
> - **Session / Request Manager** owns the full request lifecycle. It is the component that will manage state across multiple tool calls in agent flows.
> - **RAG before Model Routing**: retrieved context (volume, domain, complexity) informs which model to use. Routing before retrieval loses this signal.
> - **Semantic Cache after RAG**: the cache key is `(query, retrieved_context)`, not the raw query alone. Caching the raw query produces false hits when different retrievals produce the same query string but different contexts.

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

* Want to understand *why* the system is built the way it is?
  → Read the [Architecture Decision Records](./docs/adr/README.md)

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

## 🔒 Security

### Authentication & Authorization

The project currently runs without authentication (local-first, development only). Before any public deployment or multi-user access, the following must be in place:

* **API authentication** — all API endpoints require a bearer token or session cookie. No anonymous access to indexes or agent state.
* **Index ownership** — persisted indexes are scoped to a user or session identifier; one user cannot read or delete another user's indexes.
* **Role boundaries** — Lab Mode features (Jailbreak Playground, prompt A/B tests) are restricted to authenticated users with explicit opt-in.

This strategy is tracked as a Phase 6 success criterion. Implementation decisions will be recorded in [`docs/adr/`](./docs/adr/).

### Jailbreak Playground security model

The Jailbreak Playground (`experiments/jailbreak-defense/`) is a red-teaming surface that deliberately tests adversarial inputs. Before it is exposed beyond local development:

* All playground inputs are logged with the authenticated user identifier — no anonymous red-teaming.
* Playground outputs (successful jailbreaks, bypass patterns) are never exposed publicly; results are stored in `datasets/` with access controls.
* External contributors must review the security policy in `experiments/jailbreak-defense/README.md` before submitting new attack patterns.

### Multimodality (image & audio)

Image and audio extractors are registered stubs. They will re-enter the roadmap when:

1. A concrete use case is identified (e.g. PDF-with-images ingestion, audio transcription for meeting notes).
2. The relevant privacy and content-moderation implications for user-uploaded media are documented.
3. A Phase milestone explicitly includes multimodal success criteria.

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
    adr/                ← Architecture Decision Records (why the system is built this way)
    study-tracks/       ← Guided learning routes by topic
  
  datasets/   ← Raw, processed and synthetic datasets registry
  infra/      ← Docker, Compose, K8s, environment configs
```

---

## ⚙️ Tech Stack (Planned)

> ⚠️ The tech stack below describes the **intended target architecture**. Tooling configuration (package.json, turbo.json, etc.) will be added before Phase 0 coding begins.

* Frontend: Next.js + TypeScript
* Backend: Node.js (**Fastify**) — chosen for its low-overhead, plugin-first model that fits an experimental platform where flexibility matters more than an opinionated full-stack framework. See [ADR-001](./docs/adr/ADR-001-backend-framework.md).
* Workers: Python (ML pipelines)
* Database: PostgreSQL
* Vector DB: **pgvector** for local development (no extra service required); migrate to **Qdrant** when vector search becomes a performance bottleneck or when approximate-nearest-neighbour index tuning is needed. See [ADR-002](./docs/adr/ADR-002-vector-database.md) for the full decision criteria.
* Queue: Redis + BullMQ — the defined **API → Worker communication boundary**. The Node.js API publishes jobs to BullMQ queues; Python workers consume them via the `bullmq` Python client or a thin HTTP adapter. See [ADR-003](./docs/adr/ADR-003-api-worker-communication.md).
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
- [x] `packages/etl` ingests text and PDF files into `NormalizedDocument`
- [ ] Image and audio ingestion remain registered stubs for a later multimodal slice
- [x] At least one sample dataset registered in [`datasets/`](./datasets/)
- [x] ETL pipeline is runnable locally with a single smoke command

### Phase 1 — Core RAG

* Chunking
* Embeddings
* Vector DB
* Chat

**✅ Success Criteria:**
- [x] User can upload a document and ask a question grounded in its content
- [x] Local RAG smoke command can ask a question against a registered dataset
- [x] Retrieved chunks have a documented [Dev Mode output contract](./docs/phase-1-dev-mode-output.md) with relevance scores
- [x] `packages/rag` has integration tests covering the full retrieval flow

### Phase 2 — Retrieval Quality

* Hybrid search (dense + sparse)
* Re-ranking
* Observability

**✅ Success Criteria:**
- [ ] Hybrid search (dense + sparse) demonstrably improves retrieval vs dense-only baseline on the Phase 0 smoke dataset (measure: top-3 recall)
- [ ] Re-ranking is applied and token usage / latency per stage is logged per request
- [ ] Retrieval observability spans (chunk count, scores, latency) appear in the Dev Mode output

> **Note:** Persistent memory between sessions is a separate product and infrastructure concern (storage, user identity, privacy) and is tracked in Phase 3, not here. Mixing it with retrieval quality improvements would cause one to delay the other.

### Phase 2b — Persistent Memory

* Conversation memory across sessions
* Storage backend for memory entries
* Memory read/write contracts

**✅ Success Criteria:**
- [ ] Conversation memory persists and is retrievable across independent API restarts using a documented storage contract
- [ ] Memory entries are associated with a session identifier; no cross-session leakage
- [ ] Memory scope, retention policy and privacy implications are documented in [`packages/memory/README.md`](./packages/memory/README.md)

### Phase 3 — Intelligence

* Agents
* Tool calling
* Guardrails
* Evals
* Self-reflection / validation layer

**✅ Success Criteria:**
- [ ] At least one end-to-end agent flow is runnable: a `document-qa` agent that retrieves from a persisted index, calls a summarization tool, and returns a grounded answer with source attribution
- [ ] Guardrails block prompt injection (tested against ≥ 5 injection patterns) and strip PII before logging
- [ ] Evals report automated faithfulness and answer-relevance scores for the Phase 0 smoke dataset using a documented scoring rubric

### Phase 4 — Lab

* Benchmarking
* A/B testing
* Visualization
* Model routing

**✅ Success Criteria:**
- [ ] A/B prompt test runs automatically and reports winner with statistical summary (sample size, confidence interval)
- [ ] Benchmark compares at least two models (local Ollama + one cloud provider) on latency, cost and quality using the Phase 0 smoke dataset as the shared baseline
- [ ] Embedding visualization renders in the web app with cluster labels for at least one indexed dataset

### Phase 5 — Advanced ML

* LoRA
* Quantization
* Fine-tuning
* Distillation

**✅ Success Criteria:**
- [ ] Each `experiments/` folder contains a reproducible notebook or script with a documented environment setup (Python version, dependencies)
- [ ] Benchmark scores compare base model vs tuned or quantized variant on at least one task-specific metric (e.g. BLEU, F1, or faithfulness)
- [ ] Results are logged and stored in `datasets/` with the input dataset, hyperparameters and output metrics recorded

### Phase 6 — Infrastructure & Deploy

* Docker and docker-compose for local full-stack environment
* CI pipeline (lint, typecheck, test on every PR)
* Environment configuration and secrets management
* Staging deployment (optional cloud target)

**✅ Success Criteria:**
- [ ] `docker-compose up` starts the full local stack (API, web, worker, Redis, Postgres) with one command
- [ ] GitHub Actions CI runs lint, typecheck and tests on every PR and blocks merge on failure
- [ ] `.env.example` files for all apps are complete and document every required variable
- [ ] Authentication strategy is documented (who can access which endpoints) even if not yet implemented — see [Security](#-security)

---

## 🧭 Execution Plan (Current)

To move from architecture scaffold to runnable foundation, the active plan is documented in:

- [`docs/phase-0-mvp-plan.md`](./docs/phase-0-mvp-plan.md)
- [`docs/phase-1-handoff.md`](./docs/phase-1-handoff.md)

### Current focus

- Phase 1 local RAG foundation is executable through `npm run rag:smoke` and `npm run rag:ask`
- A local API is available through `npm run api:dev` with `POST /rag/index`
  `POST /rag/ask`, `GET /rag/indexes`, and `DELETE /rag/indexes/:documentId`
  for inline JSON text, multipart text/PDF uploads, persisted local indexes and
  basic index management. Inline/upload requests can use `api-lexical`
  (default), `local-hash` or opt-in `ollama` embedding providers
- A first local web surface is available through `npm run web:dev`, including
  saved-index management and provider selection for new local requests
- Next focus: harden the provider/API contract or add a cloud semantic provider
  for local-vs-cloud comparison
- Keep roadmap checkboxes and package READMEs synchronized with implementation status

The local RAG usage guide is documented in
[`docs/phase-1-local-rag.md`](./docs/phase-1-local-rag.md).
The Ollama installation and integration guide is documented in
[`docs/ollama-setup.md`](./docs/ollama-setup.md).
Reference environment files live in
[`apps/api/.env.example`](./apps/api/.env.example) and
[`apps/web/.env.example`](./apps/web/.env.example).

### Local RAG commands

Run a registered dataset through ETL, chunking, embeddings, in-memory vector
search and Dev Mode retrieval output:

```bash
npm run rag:smoke -- --dataset phase-0-smoke-text --query "What does this command verify?"
```

Ask a grounded question against a local text or PDF file:

```bash
npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text --query "What does this command verify?"
```

Both commands print JSON containing the query, a simple grounded answer,
retrieved chunk IDs, scores, source metadata and offsets.

Run the local API:

```bash
npm run api:dev
```

The first API slice exposes `GET /health`, `POST /rag/index`, `POST /rag/ask`,
`GET /rag/indexes`, and `DELETE /rag/indexes/:documentId` for inline JSON text,
multipart text/PDF uploads, selectable local embedding providers and persisted
local indexes under `.groundedos/indexes/`.
`ollama` requires a running local Ollama server and an embedding model such as
`embeddinggemma`.

Run the local web surface in another terminal:

```bash
npm run web:dev
```

The web server listens on `http://localhost:3000` and proxies requests to the
local API. Use the embedding provider select for new inline/upload requests,
`Index` to persist the current source, select saved indexes from the list, then
`Ask` to query that saved local index by `documentId`.

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
| AI concept documentation | `docs/concepts/` | Follow the template in [`docs/concepts/README.md`](./docs/concepts/README.md) |
| Architecture decision | `docs/adr/` | Write an ADR before implementing a hard-to-reverse decision |
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
