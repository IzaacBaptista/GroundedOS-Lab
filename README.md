# 🧠 Cortex Lab AI

**An open-source platform to build, study and evaluate modern AI systems using LLMs, RAG, Agents and advanced inference pipelines.**

---

## 🚀 Overview

Cortex Lab AI is not just another AI app.

It is a **complete laboratory for applied AI systems**, designed to:

* Build real AI-powered products
* Experiment with modern LLM architectures
* Evaluate quality, cost and performance
* Understand how AI behaves under real-world constraints

This project combines **product + engineering + research** in a single platform.

---

## 🎯 Goals

* Provide a **real, usable AI application**
* Expose **internal mechanics of LLM systems**
* Enable **experimentation and benchmarking**
* Serve as a **learning platform for developers**
* Demonstrate **production-ready AI architecture**

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
* Cost and performance analysis

---

## 🏗️ Architecture

```
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
```

---

## 🧠 Concepts Implemented

This project is designed to cover **the full modern AI stack**.

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

---

### 🧩 Chunk Visualizer

See exactly:

* which chunks were used
* relevance score
* document origin

---

### ⚡ Local vs Cloud Toggle

Compare:

* latency
* cost
* quality
  between local models and APIs

---

### 🧪 Prompt A/B Testing

Run:

* prompt A vs prompt B
* compare eval scores automatically

---

## 🗂️ Project Structure

```
cortex-lab-ai/
  apps/
    web/
    api/
    worker/

  packages/
    core/
    rag/
    agents/
    memory/
    model-routing/
    safety/
    observability/
    evals/
    etl/
    experiment-toolkit/
    benchmarks/
    viz/

  experiments/
    fine-tuning/
    lora/
    distillation/
    quantization/
    jailbreak-defense/
    bias-tests/

  docs/
    concepts/
    architecture/
    tutorials/

  datasets/
  infra/
```

---

## ⚙️ Tech Stack

* Frontend: Next.js + TypeScript
* Backend: Node.js (Fastify/Nest)
* Workers: Python (ML pipelines)
* Database: PostgreSQL
* Vector DB: pgvector / Qdrant
* Queue: Redis + BullMQ
* Observability: OpenTelemetry + Grafana
* AI: OpenAI / Anthropic / Local (Ollama)

---

## 🧪 Getting Started (MVP)

### Phase 1

* Document ingestion
* RAG pipeline
* Chat interface

### Phase 2

* Hybrid search + re-ranking
* Memory
* Observability

### Phase 3

* Agents + tool calling
* Guardrails
* Evals

### Phase 4

* Lab features
* Benchmarking
* Model routing

---

## 🤝 Contributing

This project is designed to be:

* modular
* extensible
* experiment-friendly

You can contribute by:

* adding new evals
* improving RAG quality
* implementing new models
* testing safety mechanisms
* improving documentation

---

## 📚 Purpose

Cortex Lab AI exists to help developers:

* move beyond "chatbots"
* understand AI systems deeply
* build production-ready AI architectures
* experiment safely with modern techniques

---

## ⭐ Final Thought

This is not a demo.

This is a **system to understand how AI actually works in production.**

---
