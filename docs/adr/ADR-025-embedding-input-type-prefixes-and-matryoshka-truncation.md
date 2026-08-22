# ADR-025 — Document/query input-type prefixes and Matryoshka vector truncation

**Status:** Accepted

## Context

The RAG book's chapter 12 (choosing an embedding model) calls out two
concrete implementation concerns beyond model selection itself:

1. **Embedding de documentos vs queries** — some models are trained
   asymmetrically and expect a different prefix/instruction depending on
   whether the text is a document being indexed or a query being searched
   with. The book is explicit that ignoring this for a model that expects
   it is "an erro silencioso": the call succeeds, but retrieval quality
   degrades with no visible error.
2. **Matryoshka embeddings** — a Matryoshka-trained model's vectors can be
   truncated to a smaller dimensionality on demand, trading quality for
   storage/compute cost, without re-training the model or reindexing from
   scratch.

Auditing the code against (1): `embedChunks()` (indexing path) and
`embedQuery()` in `packages/rag/src/retrieval.ts` (query path) both called
`provider.embedTexts(texts)` — the exact same code path, with no concept of
"this text is a document" vs "this text is a query" anywhere in the type
system. This is not a hypothetical gap: `OllamaEmbeddingsProvider`'s default
model, `embeddinggemma`, is documented by Google as an asymmetric model that
expects distinct task-type prefixes for search queries vs indexed passages.
Against (2): there was no utility at all for truncating an already-computed
vector — changing output dimensionality meant reconfiguring a provider and
recomputing every embedding from scratch, exactly the cost Matryoshka is
supposed to avoid.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Where `inputType` lives | Added `inputType?: "document" \| "query"` to `EmbedTextInput`, and a second optional parameter to `EmbeddingProvider.embedTexts(texts, inputType?)` | A wrapper type distinguishing `DocumentEmbeddingProvider`/`QueryEmbeddingProvider` (rejected: doubles the provider surface for what's really one extra parameter); inferring input type by other means, e.g. text length heuristics (rejected: unreliable, and the book's whole point is that this must be an explicit, deliberate signal) |
| Backward compatibility of `embedTexts`'s new parameter | Optional second parameter — existing implementations with the old one-argument signature remain valid (TS/JS callback-arity compatibility), and omitting it preserves current behavior exactly | Making it required (rejected: would force every existing `EmbeddingProvider` implementation across the codebase and any external consumer to change, for a feature only two providers act on) |
| Where prefixes are configured | `documentPrefix`/`queryPrefix` options on `OllamaEmbeddingsProviderOptions` and `OpenAIEmbeddingsProviderOptions`, applied only when `inputType` matches and a prefix is configured (both default unset — no-op) | Hardcoding `embeddinggemma`'s specific Google-documented prefix strings as defaults (rejected: brittle — the exact convention is model-specific and could change; making it explicit, opt-in configuration keeps the provider honest about not guessing a convention it can't verify) |
| Matryoshka truncation API | Two pure functions: `truncateEmbedding(vector, targetDimensions)` (vector-level) and `truncateEmbeddedChunk(chunk, targetDimensions)` (chunk-level, keeps `embeddingMetadata.dimensions` consistent so `InMemoryVectorStore` still validates correctly) | A stateful "truncating embedding provider" wrapper (rejected: truncation is a pure, cheap, synchronous transform — wrapping it in the async provider interface adds ceremony with no benefit); re-normalizing the truncated vector (rejected: cosine similarity is magnitude-insensitive already, and dot product/Euclidean are supposed to reflect the truncated vector's own magnitude — re-normalizing would silently change what those two metrics measure) |

## Decision

- `EmbedTextInput.inputType?: "document" | "query"` added; `embedChunks()`
  always passes `"document"`, `retrieval.ts#embedQuery()` always passes
  `"query"`.
- `EmbeddingProvider.embedTexts(texts, inputType?)` — the extra parameter
  threads through `semanticToEmbeddingProvider()`/`embeddingProviderToSemantic()`
  in both directions.
- `OllamaEmbeddingsProvider`/`OpenAIEmbeddingsProvider` gained
  `documentPrefix?`/`queryPrefix?` options, applied via a shared
  `applyInputTypePrefix()` helper before the request text is sent (and
  before `maxInputChars` truncation, so the budget includes the prefix).
  `LocalHashEmbeddingsProvider`/`DeterministicEmbeddingProvider` don't get
  this option — they're synthetic hash-based embeddings with no real model
  behind them, so a prefix would be pure ceremony.
- `truncateEmbedding()`/`truncateEmbeddedChunk()` added as plain, synchronous
  utilities in `packages/rag/src/embeddings.ts`.

## Consequences

- Any caller wiring up a real asymmetric model (embeddinggemma or otherwise)
  now has a real mechanism to apply the correct prefix per input type,
  instead of the pipeline silently treating every text the same way.
- No behavior changes for existing callers: `inputType` is optional
  everywhere, and no provider ships with a prefix configured by default.
- Matryoshka truncation is available as a library primitive, but nothing in
  `apps/api`'s ingestion/retrieval paths calls it yet — a caller that wants
  variable-cost storage tiers (e.g. store full vectors, serve a truncated
  copy for a cheaper/faster index) has to wire that up itself. Same
  precedent as ADR-021's unwired `parentChunkId` and ADR-022's
  unwired `permissions`/`tenantId` API filter: the capability is real and
  tested at the `packages/rag` layer; end-to-end API wiring is separate,
  smaller follow-up work if/when a concrete use case needs it.
