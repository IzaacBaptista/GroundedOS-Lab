# ADR-017 — Real LLM generation for /rag/ask: opt-in Ollama chat with extractive fallback

**Status:** Accepted

## Context

Since Phase 1, `/rag/ask` never called an LLM to produce the answer. `createGroundedAnswer` (`apps/api/src/rag-service.ts`) returned a fixed template — `"Based on the top retrieved chunk: ${topResult.text}"` — and the "multi-model orchestration" layer (`packages/agents/src/orchestration.ts`) that ran on top of it was fully simulated (`simulateDraft`/`simulateRefinement` string concatenation, no network call). This was documented and intentional for Phase 1 (`docs/phase-1-rag-internals.md`), but it was never revisited in any later phase even though README marks Phases 1-7 "Complete" — meaning the "Generation" half of Retrieval-Augmented *Generation* did not exist anywhere in the codebase.

This surfaced during a chapter-by-chapter audit against a RAG engineering book's table of contents (caps. 26-29: prompt engineering, grounding, faithfulness, LLM generation controls) — those chapters had no real surface to map to.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Ollama chat (`/api/chat`), opt-in via env flag** | Reuses the local-first pattern already established for embeddings (`OllamaEmbeddingsProvider`); zero new external dependency; matches README's "Local-First Philosophy" | Requires a local Ollama server + pulled chat model to see real answers; not a hosted default |
| **Cloud provider (OpenAI/Groq) as the default generator** | Higher-quality answers without local setup; Groq client already exists for model-benchmark prechecks | Contradicts local-first default; requires an API key to get any real answer out of the box; existing 500+ test suite asserts extractive text verbatim as default behavior |
| **Keep extractive-only, defer generation entirely** | Zero risk, zero new surface | Leaves the core RAG promise (grounded generation, not just retrieval) unmet; caps 26-29 stay permanently inapplicable |

## Decision

Add `OllamaChatProvider` and `buildGroundedPrompt` (`packages/rag/src/generation.ts`) and wire them into `createGroundedAnswer` behind `GROUNDEDOS_ENABLE_LLM_GENERATION` (default off). When enabled, the top retrieved chunks are passed to Ollama chat with a prompt that restricts the model to that context and asks it to cite chunk ids; on any failure (unreachable server, timeout, malformed response) the code falls back to the existing extractive template instead of failing the request. The simulated multi-model orchestration overlay (`orchestrateAnswerPipeline`) is skipped when a real generated answer is used (`GroundedAnswer.generationSource === "llm"`), since it was standing in for the missing generation step and would otherwise append fabricated "Grounded with retrieved context." text onto a real model's output.

Default behavior (flag off) is unchanged — the extractive template stays the baseline so the existing test suite (~10 assertions comparing `answer.text` to retrieved chunk text verbatim) does not need rewriting, and so a fresh clone with no local LLM configured still gets a working, deterministic answer.

## Consequences

- `/rag/ask` can now produce genuinely generated, grounded answers, but only for operators who opt in and run Ollama locally — this is not yet the default experience.
- Cloud generation (OpenAI/Groq) is not wired for the main answer path; only Ollama. A future ADR should cover adding a cloud `GenerationProvider` if that's needed.
- Cost/latency accounting, streaming, and structured/JSON output (book cap. 29) are not covered by this change — `OllamaChatProvider.generate` is a single non-streaming call.
- `packages/agents/src/orchestration.ts` remains simulated for the extractive path; it was not removed, only bypassed when real generation succeeds. This is the small `orchestrateAnswerPipeline` draft/refine/verify helper used only inside `/rag/ask` — unrelated to the `MultiAgentRunner`/`ReActRunner`/`PlanExecutor` system covered by [ADR-015](./ADR-015-multi-agent-orchestration-strategy.md), which this ADR does not touch.
