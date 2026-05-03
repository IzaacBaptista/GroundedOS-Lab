# Concept Roadmap & Current Implementation Status

This document reflects the current source of truth used by the web Concepts Lab:
[`apps/web/src/concepts/concepts-data.ts`](../apps/web/src/concepts/concepts-data.ts).

## Overview

The current Concepts Lab ships with:

- **30 concepts**
- **6 learning paths**
- **9 categories**
- Status distribution from the checked-in source data:
  - **15 implemented**
  - **5 partial**
  - **10 planned**

Every concept entry includes explanation text, project-specific study guidance,
UI visibility hints, related files, dependency links, and test coverage for
cross-reference validity.

## Source Of Truth

The concepts surface is defined in:

- [`apps/web/src/concepts/concepts-data.ts`](../apps/web/src/concepts/concepts-data.ts)
- [`apps/web/src/concepts/types.ts`](../apps/web/src/concepts/types.ts)
- [`apps/web/src/concepts/index.ts`](../apps/web/src/concepts/index.ts)
- [`apps/web/src/concepts/concepts-data.test.ts`](../apps/web/src/concepts/concepts-data.test.ts)

If this document and the TypeScript data disagree, the TypeScript data wins.

## Category Breakdown

| Category | Concept count | Notes |
|---|---:|---|
| Core AI | 5 | Mostly foundational concepts; several are still documentation-first rather than UI-visible |
| Retrieval & Data | 8 | Strongest current implementation coverage across the RAG flow |
| Context & Reasoning | 6 | Mixed: core RAG concepts implemented, more advanced reasoning still planned |
| Data Engineering | 2 | ETL and Uniform Document Schema are implemented |
| Agents & Execution | 1 | Tool-calling concept exists; agent execution is only partially surfaced |
| Optimization | 4 | Phase 5 concepts are present in the Concepts Lab and backed by experiment artifacts |
| Evaluation & Observability | 2 | Cost analysis and observability are implemented |
| Safety & Reliability | 1 | Guardrails concept is implemented |
| Generation Control | 1 | Temperature / Top-P / Top-K remains planned |

## Current Status By Area

### Implemented now

- Core retrieval concepts such as RAG, chunking, embeddings, vector database,
  grounding, ETL, uniform document schema, observability, cost analysis and
  guardrails are marked `implemented` in the live concepts data.
- Phase 5 optimization concepts (`fine-tuning`, `lora`, `quantization`,
  `distillation`) are marked `implemented` in the Concepts Lab.
- Learning paths are present and validated in tests.

### Partial now

- The live data marks **5 concepts** as `partial`.
- These are concepts where some supporting implementation or UI visibility
  exists, but the project does not yet expose the full intended learning or
  experimentation surface.

### Planned now

- The live data marks **10 concepts** as `planned`.
- Most of these are future-facing concepts where the documentation and learning
  path exist before a complete UI/runtime implementation lands.

## Relationship To Project Phases

The concepts surface now spans the implemented project phases this way:

- **Phase 0-2**: strongest coverage in ETL, schema, chunking, embeddings,
  retrieval, reranking-adjacent ideas, and memory/observability concepts.
- **Phase 3**: agent, safety and evaluation concepts are present, but some are
  more documented than fully interactive in the UI.
- **Phase 4**: lab-facing concepts such as benchmarking, cost analysis and
  trade-off inspection align with the implemented lab surface.
- **Phase 5**: optimization concepts are represented in the Concepts Lab and
  backed by experiment artifacts under `datasets/experiments/phase-5/`.
- **Phase 6**: concepts that depend on production auth/deploy controls are still
  mostly roadmap-level rather than fully integrated in the web concepts UX.

## Phase 5 Clarification

The Concepts Lab marks the optimization concepts as implemented, which is
correct for the current repository state, but the underlying tracks differ in
maturity:

- Fine-tuning, LoRA and distillation have real measured artifacts.
- Quantization currently uses a measured lexical-vector quantization benchmark.
- Full model-weight quantization and production training infrastructure remain
  separate future work.

## How To Maintain This Document

1. Update [`apps/web/src/concepts/concepts-data.ts`](../apps/web/src/concepts/concepts-data.ts) first.
2. Run `npm run test` or at minimum the web concepts tests.
3. Update this roadmap only after the data and tests are already correct.
4. Keep counts and category summaries derived from the current source data.

## Test Coverage

[`apps/web/src/concepts/concepts-data.test.ts`](../apps/web/src/concepts/concepts-data.test.ts)
currently verifies:

- required fields exist for each concept
- statuses stay within the allowed set
- concept IDs are unique
- learning paths reference valid concepts
- `dependsOn` and `nextConcepts` reference valid concepts
- implemented concepts expose visible UI locations

## Next Documentation Priorities

- Expand this roadmap with a generated per-concept table if the concepts dataset
  grows again.
- Keep the roadmap aligned with the actual `status` values in
  `concepts-data.ts` instead of hand-maintaining speculative phase labels.
- Document the difference between concept visibility in the web UI and runtime
  maturity in the backend/experiments packages.

**Last Updated:** Current source data in `apps/web/src/concepts/concepts-data.ts`  
**Total Concepts:** 30  
**Learning Paths:** 6  
**Categories:** 9  
**Status Counts:** 15 implemented, 5 partial, 10 planned
