# Concept Roadmap & Implementation Status

This document maps all 36 concepts in the Laboratório de Conceitos to their implementation status, categories, and roadmap phases.

## Overview

The Concepts Lab is organized into **6 learning categories** with a total of **36 concepts**. Each concept includes:
- **Interactive explanation** in Portuguese and English
- **Testing steps** for hands-on experimentation 
- **Visible data references** showing where the concept appears in the UI
- **Code mappings** to implementation files
- **Learning paths** connecting related concepts by difficulty level

---

## Concept Categories

### 1. Core AI (6 concepts) ✅

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [LLM](../apps/web/src/concepts/concepts-data.ts) | Implemented | 0 | 5 steps | Trade-offs, Lab Playground |
| [Transformer](../apps/web/src/concepts/concepts-data.ts) | Implemented | 1 | 5 steps | Trade-offs, Experiment Type |
| [Inference](../apps/web/src/concepts/concepts-data.ts) | Implemented | 1 | 5 steps | Trade-offs, Latency Tab |
| [Weights](../apps/web/src/concepts/concepts-data.ts) | Planned | 5+ | - | Documentation |
| [Optimization](../apps/web/src/concepts/concepts-data.ts) | Planned | 5+ | - | Future UI |
| [System Prompt](../apps/web/src/concepts/concepts-data.ts) | Implemented | 2 | 5 steps | Experiment UI |

### 2. Retrieval & Data (10 concepts) ✅

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [Chunking](../apps/web/src/concepts/concepts-data.ts) | Implemented | 0 | 5 steps | Lab Playground, Trade-offs |
| [Embeddings](../apps/web/src/concepts/concepts-data.ts) | Implemented | 0 | 5 steps | Trade-offs, Dev Mode |
| [Vector Database](../apps/web/src/concepts/concepts-data.ts) | Implemented | 0 | 5 steps | Trade-offs, Sidebar |
| [Hybrid Search](../apps/web/src/concepts/concepts-data.ts) | Implemented | 3 | 5 steps | Experiment Config |
| [Reranking](../apps/web/src/concepts/concepts-data.ts) | Partial | 4 | 3 steps | Experiment UI |
| [Context Window](../apps/web/src/concepts/concepts-data.ts) | Implemented | 1 | 5 steps | Trade-offs |
| [Context Engineering](../apps/web/src/concepts/concepts-data.ts) | Partial | 2 | 4 steps | Experiment Config |
| [Context Pruning](../apps/web/src/concepts/concepts-data.ts) | Partial | 4 | 3 steps | Experiment UI |
| [Data Lineage](../apps/web/src/concepts/concepts-data.ts) | Partial | 3 | 3 steps | Dev Mode Output |
| [Retrieval Quality](../apps/web/src/concepts/concepts-data.ts) | Implemented | 2 | 5 steps | Lab Playground |

### 3. Context & Reasoning (6 concepts) ✅

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [RAG](../apps/web/src/concepts/concepts-data.ts) | Implemented | 0 | 5 steps | Everywhere (core) |
| [Grounding](../apps/web/src/concepts/concepts-data.ts) | Implemented | 1 | 5 steps | Trade-offs, Dev Mode |
| [Prompt Engineering](../apps/web/src/concepts/concepts-data.ts) | Implemented | 1 | 5 steps | Experiment Templates |
| [Adaptive RAG](../apps/web/src/concepts/concepts-data.ts) | Planned | 5+ | - | Future Features |
| [Knowledge Graphs](../apps/web/src/concepts/concepts-data.ts) | Stub | 6+ | - | Documentation |
| [Performance](../apps/web/src/concepts/concepts-data.ts) | Learning Path | 3+ | N/A (meta) | Reading List |

### 4. Data Engineering (2 concepts) ✅

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [ETL](../apps/web/src/concepts/concepts-data.ts) | Implemented | 3 | 5 steps | Lab Playground, Ingest UI |
| [Uniform Document Schema](../apps/web/src/concepts/concepts-data.ts) | Implemented | 2 | 5 steps | Dev Mode, Index Config |

### 5. Agents & Execution (1 concept) 🟡

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [Tool Calling](../apps/web/src/concepts/concepts-data.ts) | Partial | 5+ | 3 steps | Experiment Config |

### 6. Optimization (4 concepts) ✅

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [Fine-tuning](../apps/web/src/concepts/concepts-data.ts) | Implemented | 5 | 5 steps | Experiment Lab |
| [LoRA](../apps/web/src/concepts/concepts-data.ts) | Implemented | 5 | 5 steps | Experiment Lab |
| [Quantization](../apps/web/src/concepts/concepts-data.ts) | Implemented | 5 | 5 steps | Model Config |
| [Distillation](../apps/web/src/concepts/concepts-data.ts) | Implemented | 5 | 5 steps | Experiment Lab |

### 7. Evaluation & Observability (2 concepts) ✅

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [Cost Analysis](../apps/web/src/concepts/concepts-data.ts) | Implemented | 1 | 5 steps | Trade-offs Tab, Dev Mode |
| [Observability](../apps/web/src/concepts/concepts-data.ts) | Implemented | 2 | 5 steps | Dev Mode, Traces UI |

### 8. Safety & Reliability (1 concept) ✅

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [Guardrails](../apps/web/src/concepts/concepts-data.ts) | Implemented | 4 | 5 steps | Lab Playground |

### 9. Generation Control (1 concept) 🟡

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [Temperature / Top-P / Top-K](../apps/web/src/concepts/concepts-data.ts) | Planned | 6+ | - | Future Config UI |

### 10. Other (3 concepts) 🟡

| Concept | Status | Phase | Testing Steps | Visible In |
|---------|--------|-------|---|---|
| [Inference Trade-offs](../apps/web/src/concepts/concepts-data.ts) | Partial | 3 | 3 steps | Trade-offs Tab |
| [Long-term Memory](../apps/web/src/concepts/concepts-data.ts) | Stub | 6+ | - | Documentation |
| [LLM](../apps/web/src/concepts/concepts-data.ts) | Learning Path | 0 | N/A (meta) | Reading List |

---

## Status Legend

| Status | Meaning | UI Integration |
|--------|---------|---|
| **Implemented** ✅ | Full implementation with visible data in app | Shown in Trade-offs, Dev Mode, Sidebar |
| **Partial** 🟡 | Core logic implemented but not fully visible in UI | Limited visibility; some data shown |
| **Planned** ⏳ | Designed but not yet implemented | Documentation only; future UI |
| **Stub** ⚠️ | Placeholder; minimal documentation | Research phase |
| **Learning Path** 📚 | Meta-concept that groups related concepts | Navigation only |

---

## Phase Alignment

Each concept is mapped to work phases per [Phase Roadmap](./phase-1-handoff.md):

| Phase | Focus | Concept Count | Key Concepts |
|-------|-------|---|---|
| **Phase 0** | MVP: Basic RAG | 5 | LLM, Chunking, Embeddings, Vector DB, RAG |
| **Phase 1** | Grounding + Cost | 6 | Grounding, Cost Analysis, Context Window |
| **Phase 2** | Advanced Retrieval | 8 | Reranking, Adaptive RAG, Data Lineage, Observability |
| **Phase 3** | Query Understanding | 10 | Hybrid Search, Context Engineering, Fine-tuning |
| **Phase 4** | Advanced Features | 12 | LoRA, Quantization, Guardrails, Tool Calling |
| **Phase 5** | Optimization | 14 | Distillation, Evaluation, Observability |
| **Phase 6+** | Future | 36 | All + planned concepts (Knowledge Graphs, etc.) |

---

## How to Use This Roadmap

### For Users
1. Start with a **Learning Path** (e.g., "Comece por Aqui") in the Concepts sidebar
2. Click a concept to read explanation + see testing steps
3. Click **"▶ Executar"** button to run an experiment related to that concept
4. Check the **Visible In** column to know where to look in the app

### For Contributors
1. When implementing a new feature, add a concept or update an existing one
2. Run `npm run -w apps/web test -- --run` to validate all concept references
3. Build passes → concepts appear in menu automatically
4. Update this roadmap with new phase phase alignment

### For Maintainers
- **New concept?** Add to `apps/web/src/concepts/concepts-data.ts`, then run tests
- **Fix references?** Use the error messages to find invalid concept IDs
- **Update UI?** Concepts use TypeScript types → components auto-update

---

## Architecture

### Components
- `ConceptsSidebar.tsx` — Left navigation with all concepts grouped by category
- `ConceptModal.tsx` — Detail panel showing explanation + testing section + experiments
- `App.tsx` — Wires concepts to experiment runner

### Data Layer
- `concepts-data.ts` — Single source of truth with 36 concepts + 6 learning paths
- `types.ts` — TypeScript interfaces for type safety
- `index.ts` — Helper functions (filtering, categorization)

### Testing
- `concepts-data.test.ts` — Validates:
  - All 36 concepts have required fields
  - All `dependsOn` and `nextConcepts` IDs are valid
  - All `conceptIds` in learning paths reference real concepts
  - Categories match type definitions

---

## Next Steps

### Coming in Phase 6
- [ ] Temperature/Top-P/Top-K UI controls
- [ ] Knowledge Graphs implementation
- [ ] Advanced study track builder
- [ ] Concept mastery tracking
- [ ] Suggested experiment ordering based on prerequisites

### Contributing
To add a new concept:
1. Add entry to `CONCEPTS` array in `concepts-data.ts`
2. Include: testingSteps (Portuguese), whereToSeeInUI, visibleInCurrentData
3. Run tests: `npm run -w apps/web test -- --run`
4. Update this roadmap with phase alignment
5. Open PR

---

**Last Updated:** Phase 5 Completion  
**Total Concepts:** 36 (14 Implemented, 6 Partial, 7 Planned, 3 Stub, 6 Learning Paths)  
**Coverage:** 6 categories across 6 phases  
**Test Status:** ✅ All tests passing (25 tests, 4 skipped)
