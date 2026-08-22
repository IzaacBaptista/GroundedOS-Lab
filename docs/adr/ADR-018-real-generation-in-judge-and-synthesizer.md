# ADR-018 — Real LLM generation in SynthesizerAgent and a real OllamaJudgeProvider

**Status:** Accepted

## Context

Following up on [ADR-017](./ADR-017-real-llm-generation.md) (real generation for `/rag/ask`), a chapter-by-chapter audit against a RAG engineering book's table of contents surfaced two more places where AI-sounding machinery had no real model behind it:

1. **`packages/evals`'s LLM-as-judge harness** (`advanced.ts`): `createJudgeRun`/`renderJudgePrompt`/`DEFAULT_JUDGE_RUBRICS` build a complete judge prompt and orchestration flow, but the only `JudgeProvider` implementation was `StaticJudgeProvider`, which just calls a caller-supplied resolver function — no LLM/HTTP call anywhere. The harness also has zero production callers (only its own tests use it).
2. **`SynthesizerAgent`** (`packages/agents/src/specialized-agents.ts`, part of the `MultiAgentRunner` pipeline documented in [ADR-015](./ADR-015-multi-agent-orchestration-strategy.md)): the `synthesize-answer` tool produced the "final grounded answer" via string concatenation — `` `Based on ${evidence.length} evidence items: ${evidenceText}`.slice(0, 500) `` — with a hardcoded `groundingScore`. This was already disclosed in `packages/agents/README.md` ("Current limits": *"no agent calls an LLM yet ... deliberately out of scope for Phase 8"*), so unlike the `/rag/ask` case this was a known, tracked gap rather than a hidden one — but the audit made it the next item to close.

A related bug was found while wiring this: `SynthesizerAgent`'s tool input never carried the original user query — `MultiAgentRunner` built `synthInput` from evidence only, and `reasoningStep` then set `toolInput.query = input` (the evidence JSON string itself), so `query` was never the actual question.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Reuse `@groundedos/rag`'s `OllamaChatProvider`/`GenerationProvider` in `SynthesizerAgent`** (chosen for the agent) | `packages/agents` already depends on `@groundedos/rag`; `GenerationProvider.generate({query, chunks})` maps directly onto evidence-as-chunks; zero new dependency | Prompt is the generic grounded-QA prompt (`buildGroundedPrompt`), not agent-pipeline-specific — acceptable since the synthesis step's job (answer a question from evidence) is the same shape |
| **New standalone `OllamaJudgeProvider` with its own raw fetch call** (chosen for evals) | `packages/evals` doesn't depend on `@groundedos/rag`; the judge prompt is already fully rendered by `renderJudgePrompt`, so it needs a raw chat call, not the grounded-QA wrapper `OllamaChatProvider` provides; keeps `evals` dependency-light | Duplicates ~40 lines of fetch/timeout/error-handling already present in `packages/rag/src/generation.ts` — accepted as consistent with the codebase's existing per-package provider convention (`OllamaEmbeddingsProvider` vs `OllamaChatProvider` already duplicate this shape) |
| **Extract a shared low-level `callOllamaChat` primitive into `@groundedos/core`** | Removes the duplication above | New shared abstraction across 3 call sites for a small amount of code; deferred until a third real need for raw (non-grounded-QA) chat appears |

## Decision

- Add `OllamaJudgeProvider` (`packages/evals/src/ollama-judge-provider.ts`) implementing `JudgeProvider` for real. It sends `renderJudgePrompt`'s output as a single user message to Ollama chat and returns the raw text for `parseJudgeOutput`. `StaticJudgeProvider` remains for tests/custom resolvers.
- Wire real generation into `SynthesizerAgent`'s `synthesize-answer` tool behind the same `GROUNDEDOS_ENABLE_LLM_GENERATION` flag used by `/rag/ask`, via `@groundedos/rag`'s `OllamaChatProvider`. Falls back to the existing heuristic template on any failure, disabled flag, or missing query/evidence.
- Fix the query-plumbing bug: `MultiAgentRunner` now includes `query` in the JSON handed to `SynthesizerAgent`, and the tool reads it from the parsed payload instead of the bogus `toolInput.query = input` assignment.
- `PlannerAgent` (`decomposeObjective`), `ResearcherAgent` (`research-retrieve`) and `CriticAgent` (`critique-evidence`) are explicitly **not** changed by this ADR — they stay heuristic/mocked. `research-retrieve` in particular still doesn't call a real index (`setRagService` exists but `MultiAgentRunner` never calls it); wiring a real retrieval index through the multi-agent pipeline is a bigger plumbing change than a model-call substitution and is left as tracked future work.

## Consequences

- `/agents/multi` can now produce a genuinely LLM-synthesized final answer, opt-in, with the same fallback safety property as `/rag/ask`.
- The LLM-as-judge harness now has a real provider, but still has no production caller — using it (from an eval pipeline, CLI, or API endpoint) is separate future work.
- This does not change or supersede ADR-015's architecture decision (custom lightweight handoff runner over LangGraph/CrewAI) — only the internals of one tool (`synthesize-answer`) within that architecture.
- Planning and evidence retrieval in the multi-agent pipeline remain heuristic; a future ADR should cover replacing `research-retrieve`'s mock with a real `@groundedos/rag` call if that becomes a priority.
