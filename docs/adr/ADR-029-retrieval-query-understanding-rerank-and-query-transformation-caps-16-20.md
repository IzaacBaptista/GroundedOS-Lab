# ADR-029 — Caps 16–20: similarity threshold, real query rewriting, RRF, a real LLM reranker, real HyDE/step-back

**Status:** Accepted

## Context

Auditing the codebase against the RAG book's chapters 16 through 20
(retrieval básico, query understanding, hybrid search, re-ranking, query
transformation) turned up a mix of real mechanisms, honest heuristics, and
two cases of theater — a feature named and billed for what it claimed to
be, while actually doing something else. Full audit findings (chapter by
chapter, file:line references) are recorded in this session's history; the
summary that drove this round's scope:

- **Cap 16 (retrieval básico):** k-NN, top-k, and pre-filter metadata
  filtering were already real (`vector-store.ts`). A minimum-similarity
  **threshold was missing entirely** — retrieval always returned exactly
  `min(k, corpus size)` results, even ones with near-zero similarity.
- **Cap 17 (query understanding):** intent classification and ambiguity
  detection were real (rule-based, honestly labeled as such). **Query
  rewriting was theater relative to its own name** — `rewriteQuery()` only
  lowercased and stripped a stopword list; it did none of typo correction,
  abbreviation expansion, or conversational reference resolution the book
  describes under that heading. **Extracting implicit query constraints
  into structured metadata filters was missing entirely.**
- **Cap 18 (hybrid search):** BM25 + vector, weighted fusion, and score
  normalization were already real and wired (ADR-028). **RRF (Reciprocal
  Rank Fusion) was missing entirely** — zero occurrences in the codebase —
  despite the normalization/fusion scaffolding it would slot next to
  already existing.
- **Cap 19 (re-ranking):** this chapter had the clearest theater. The
  "reranking" stage in `apps/api/src/rag-service.ts` — traced, reported in
  Dev Mode, and billed as a `"reranking"` cost unit on every request where
  `rerankEnabled` was true — was a token-overlap tiebreak
  (`overlap / sqrt(|query| * |doc|)`) blended 80/20 with the existing
  hybrid score. No cross-encoder, no LLM judge, nothing resembling the
  chapter's actual subject existed anywhere in the codebase. Separately,
  `packages/adaptive-rag`'s `rerankEnabled`/`rerankDepth`/`"rerank"` task
  type were computed, traced, and reported by the planner, but
  `retrieval.ts`'s `executeRetrievalPlan` never executes a `"rerank"` task
  — a rerank plan with no executor.
- **Cap 20 (query transformation):** query expansion and multi-query were
  real (static dictionary / templated variants) with genuine
  retrieve-and-merge plumbing. **HyDE's mechanics were correct but its
  payload was fake** — `buildHypotheticalDocument()` embeds the
  hypothetical document rather than the query (textbook HyDE), but that
  document was always a fixed template (query + boilerplate), never an
  actual LLM-generated answer. **Step-back prompting was missing
  entirely.**

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Similarity threshold | `VectorSearchQuery.minScore` / `RetrieveFromIndexOptions.minScore`, unset by default | A separate `search()` variant (rejected: an optional field on the existing query object is a smaller surface and composes with `topK`/`filter` for free) |
| Query rewriting's missing pieces | Added abbreviation expansion (real dictionary, separate from `expandQuery`'s synonym map), anaphoric reference resolution (`previousQuery` — heuristic: only fires on a detected reference word, appends the previous turn's content words), typo correction (`vocabulary` — edit-distance-1 against a caller-supplied known-good list) | An LLM-based rewrite (rejected as this round's scope: the book presents rewriting as the rule-based stage that precedes the LLM-heavy techniques in cap. 20 — HyDE/step-back are where this codebase now does spend an LLM call); correcting typos without any vocabulary (rejected: no way to distinguish a typo from a rare valid term without one — silently "correcting" would be worse than not correcting) |
| Implicit constraint extraction | `extractQueryFilters()` parses explicit `key:value` tokens (`tag:`, `author:`, `tenant:`) into a filter object, disclosed as NOT parsing free natural language (no year/date NER) | Full NLU-style extraction of dates/categories from prose (rejected: needs an LLM or a NER model, and chunks don't carry a bare "year" field to filter against even if one were extracted — this would be a much larger, separate feature, not a formula) |
| RRF | `reciprocalRankFusion()` (new `fusion.ts`), selectable via `RetrieveFromIndexOptions.fusionMethod: "weighted" \| "rrf"`, default unchanged (`"weighted"`) | Replacing weighted fusion outright (rejected: weighted fusion's "how much better" signal is real information RRF discards; making both available and opt-in is strictly more capability, not a replacement) |
| Cross-encoder vs. LLM reranker | LLM reranker (`rerankWithLlm`) — any chat-capable model can judge relevance directly, no trained cross-encoder model to ship | A real cross-encoder (rejected: needs an actual trained model this project doesn't have and has no infrastructure to serve; the LLM path reuses the Ollama connection this codebase already has for generation) |
| Reranking's shared LLM plumbing | A new minimal `LlmTextProvider`/`OllamaTextProvider` (`llm-text-provider.ts`), distinct from `GenerationProvider` | Reusing `GenerationProvider` for HyDE/step-back/rerank too (rejected: `GenerationProvider.generate()` is shaped specifically for grounded QA — chunks + citation instructions — and forcing HyDE/step-back/rerank prompts through that shape would be a worse fit than a three-line plain-completion interface) |
| Fixing the reranking theater without destabilizing cost/telemetry tests | Kept the existing lexical-overlap path as the **default, unchanged fallback** (same behavior, same cost-charging, when no LLM reranker is configured); added the real LLM reranker as opt-in (`GROUNDEDOS_ENABLE_LLM_RERANK=true`, same pattern as `GROUNDEDOS_ENABLE_LLM_GENERATION`, ADR-017); added a `method: "llm" \| "lexical-heuristic"` field to every reranked candidate so the two are never indistinguishable again | Stopping cost-charging for the lexical fallback (rejected: reranking work — cheap or not — still happens on every request where `rerankEnabled` is true, and changing default billing behavior risks a large, unrelated test/dashboard blast radius for a chapter-16-through-20 audit round); wiring the unexecuted adaptive-rag `"rerank"` task type into `executeRetrievalPlan` (deferred: `rerank-chunks` in `rag-service.ts` already runs unconditionally as its own workflow step for every hybrid request, so the plan-level task type is redundant with what already runs — removing or wiring it is a separate, narrower cleanup than this round's scope) |
| HyDE | `buildHypotheticalDocument()` takes an optional `llmProvider`; when given, asks the LLM for a real plausible answer; on missing provider or LLM failure, falls back to the exact same fixed template as before (now explicitly disclosed as a heuristic fallback, not the technique) | Making the LLM call mandatory (rejected: breaks every existing caller that doesn't configure one, and the fallback is a legitimate degraded mode, not a bug, as long as it's disclosed) |
| Step-back prompting | New `buildStepBackQuery()`, same LLM-optional/heuristic-fallback shape as HyDE; wired into `retrieveFromIndex(..., { stepBack: true })` as one more candidate source merged into the existing pool (same mechanism as query expansion) | A dedicated fusion-trace signal like HyDE's `hydeSimilarity` weight (rejected as unnecessary complexity: step-back's result set is just another query variant to retrieve and merge, exactly like multi-query already does — it doesn't need its own weighted-signal slot) |

## Decision

- `packages/rag/src/vector-store.ts`: `VectorSearchQuery.minScore`, enforced
  in `InMemoryVectorStore.search()`. `retrieval.ts`: `RetrieveFromIndexOptions.minScore`,
  applied in dense mode's `searchStore()` call and in hybrid mode's final
  sorted candidate list before slicing to `topK`.
- `packages/rag/src/query-understanding.ts`: `rewriteQuery()` gained
  `RewriteQueryOptions` (`previousQuery`, `vocabulary`) and an
  `ABBREVIATION_MAP`; new `extractQueryFilters()`.
- `packages/rag/src/fusion.ts` (new): `reciprocalRankFusion()`.
  `retrieval.ts`: `RetrieveFromIndexOptions.fusionMethod`.
- `packages/rag/src/llm-text-provider.ts` (new): `LlmTextProvider`,
  `OllamaTextProvider`.
- `packages/rag/src/rerank.ts` (new): `rerankWithLlm()`.
  `apps/api/src/rag-service.ts`: `rerankRetrievalOutput()` split into
  `rerankWithRealLlm()` (new) and `rerankWithLexicalHeuristic()` (the
  pre-existing behavior, unchanged), selected by `resolveRerankProvider()`
  (opt-in via `GROUNDEDOS_ENABLE_LLM_RERANK`, mirroring
  `resolveGenerationProvider`). Every reranked candidate now carries `method`.
- `packages/rag/src/advanced-retrieval.ts`: `buildHypotheticalDocument()`
  is now async and takes an optional `llmProvider`; new `buildStepBackQuery()`.
  `retrieval.ts`: both threaded through `RetrieveFromIndexOptions.llmProvider`
  / `.stepBack`, merged into the candidate pool the same way expansion
  queries already are.

## Consequences

- A caller can now ask for `minScore`-bounded retrieval instead of always
  getting `topK` results regardless of relevance; RRF as an alternative to
  weighted fusion; abbreviation/reference/typo-aware query rewriting;
  explicit `key:value` filter extraction — all opt-in, all backward
  compatible (every new option defaults to the prior behavior).
- The "reranking" stage in `apps/api` can now be a real LLM reranker, and
  — critically — it is never silently reported or billed as one when it
  isn't. Anyone who already depends on the current lexical-overlap
  behavior (the default, since `GROUNDEDOS_ENABLE_LLM_RERANK` is unset by
  default) sees no change; the existing 28-test `rag-service.test.ts` suite
  passes unchanged.
- HyDE now has a path to being the real technique (LLM-generated
  hypothetical answer) instead of always the template proxy — opt-in via
  the same `llmProvider` used for reranking and step-back.
- Not addressed this round, disclosed as known gaps: cross-encoder /
  ColBERT-style late interaction (cap. 19) — no real trained reranking
  model is integrated, only the LLM-judge path; in-scope/out-of-scope query
  classification (cap. 17); free natural-language constraint extraction
  (cap. 17) beyond explicit `key:value` tokens; the unexecuted `"rerank"`
  task type in `packages/adaptive-rag`'s retrieval plan (redundant with
  `rag-service.ts`'s own unconditional rerank step, not wired to it).
