# Phase 1 RAG Internals

This guide explains what happens inside the runnable Phase 1 RAG loop, from
the browser or CLI request to the Dev Mode retrieval output. It is meant to be
read with the code open.

Use [`phase-1-local-rag.md`](./phase-1-local-rag.md) when you want commands.
Use this guide when you want to understand where the behavior lives and why the
current implementation behaves the way it does.

## Mental Model

Think of Phase 1 as a deterministic pipeline:

```text
Document -> chunks -> vectors -> similarity -> top-k -> extractive answer
```

There is no "intelligence" yet. Only:

- text segmentation
- vector matching
- ranking

This is intentional. Everything that looks like AI behavior comes from:

- how text is chunked
- how embeddings are computed
- how similarity is measured

## What Runs Today

| Works today | Intentionally missing |
|---|---|
| Text and PDF ingestion through `packages/etl` | Image and audio extraction beyond registered stubs |
| Chunking `NormalizedDocument` sections into stable retrieval chunks | Semantic chunking or document-structure-aware chunking |
| Local lexical/hash embeddings and opt-in Ollama embeddings | Cloud LLM providers and generated answers |
| In-memory cosine similarity search | Production vector database, ANN indexes, hybrid search |
| Extractive grounded answer from the top retrieved chunk | LLM synthesis, self-reflection, tool use |
| Dev Mode output with chunks, scores, offsets and embedding metadata | Full OpenTelemetry tracing, token accounting, reranking |
| Phase 1 baseline in `datasets/golden/baselines/phase-1-baseline.json` | Automated eval runner for the full golden dataset |

## End-to-End Flow

The current local loop is deliberately small:

```text
Browser
  -> apps/web static server
  -> apps/api/src/rag-service.ts
  -> packages/etl ingest()
  -> packages/rag chunkDocument()
  -> packages/rag embedChunks()
  -> packages/rag InMemoryVectorStore
  -> packages/rag retrieveForDevMode()
  -> RagAskResponse JSON
  -> browser renders answer, citations and raw Dev Mode data

CLI
  -> scripts/rag-smoke.ts or scripts/rag-ask.ts
  -> packages/etl ingest()
  -> packages/rag buildRetrievalIndex()
  -> packages/rag retrieveForDevMode()
  -> grounded answer JSON
```

For the web path, the React SPA under `apps/web/src/` (entry `main.tsx`,
root component `App.tsx`) sends `/api/rag/*` requests that the Vite dev server
proxies to the NestJS API. The API route in
`apps/api/src/rag/rag.controller.ts` delegates to `RagService`, which in turn
reuses the pure functions in `apps/api/src/rag-service.ts`.

For the CLI path, `scripts/rag-smoke.ts` and `scripts/rag-ask.ts` call
`packages/etl` and `packages/rag` directly. They bypass the API server but use
the same retrieval package functions.

Inside the API service:

1. Inline text or uploaded files are normalized into a `NormalizedDocument`
   through `packages/etl`.
2. `buildRetrievalIndex()` in `packages/rag/src/retrieval.ts` calls
   `chunkDocument()`, `embedChunks()` and `InMemoryVectorStore.insert()`.
3. `retrieveForDevMode()` embeds the query, searches the store and formats the
   ranked results as the Dev Mode contract.
4. `apps/api/src/rag-service.ts` creates an extractive answer from the top
   retrieved chunk and returns `RagAskResponse`.

After observing a response in the browser, open
`packages/rag/src/vector-store.ts` and read `cosineSimilarity()`. You have just
seen that function produce the `score` values in Dev Mode.

## Concept To Code Map

| Concept | Code location | What to inspect |
|---|---|---|
| RAG retrieval flow | `packages/rag/src/retrieval.ts` | `buildRetrievalIndex()`, `retrieveFromIndex()`, `retrieveForDevMode()` |
| Chunking | `packages/rag/src/chunking.ts` | `chunkDocument()`, stable chunk IDs, offsets |
| Embeddings | `packages/rag/src/embeddings.ts` | `EmbeddingProvider`, `embedChunks()`, provider metadata |
| API lexical embeddings | `apps/api/src/rag-service.ts` | `ApiLexicalEmbeddingProvider`, `hashToken(token) % 64` |
| Vector search | `packages/rag/src/vector-store.ts` | `InMemoryVectorStore.search()`, `cosineSimilarity()` |
| Dev Mode | `packages/rag/src/retrieval.ts` | `RetrievalDevModeOutput`, rank, score, source, offsets |
| Extractive answer | `apps/api/src/rag-service.ts` | answer built from the top retrieved chunk |

## Stable Contract Boundaries

These types define the boundaries between packages and request layers. Internal
implementation can change; these contracts cannot break without a deliberate
versioning or migration plan.

| Contract | Owner | Role |
|---|---|---|
| `NormalizedDocument` | `packages/core` | Canonical ETL output consumed by RAG |
| `RetrievalChunk` | `packages/rag/src/chunking.ts` | Stable chunk ID, document/section IDs, text and offsets |
| `EmbeddedChunk` | `packages/rag/src/embeddings.ts` | Retrieval chunk plus vector and embedding metadata |
| `VectorSearchResult` | `packages/rag/src/vector-store.ts` | Ranked chunk and cosine similarity score |
| `RetrievalDevModeOutput` | `packages/rag/src/retrieval.ts` | Observable retrieval diagnostics returned to API/UI |
| `RagAskResponse` | `apps/api/src/rag-service.ts` | Public API response with document, answer, index and Dev Mode data |

Rule: refactor internals freely, but preserve these boundaries unless the same
change updates versioning expectations, docs, tests and downstream callers.

## Why Extractive Answers?

Phase 1 returns extractive answers: the answer text is derived from the top
retrieved chunk instead of being generated by an LLM.

This is intentional:

- Grounding is explicit because the answer is tied directly to retrieved text.
- Tests remain deterministic because there is no model sampling.
- Hallucination risk is minimized while the retrieval loop is being built.
- Evaluation can focus first on chunk recall, source hit rate and scores.

LLM-based answer synthesis belongs to Phase 3, after retrieval quality,
provider contracts, guardrails and evals have stronger baselines.

## Current Retrieval Quality Gap

The default API provider, `api-lexical`, is lexical, not semantic. It tokenizes
text, hashes each token into a 64-dimensional vector and normalizes the result.
The score is cosine similarity between the query vector and chunk vector.

Implications:

- Synonyms are not understood unless they share tokens.
- Different wording can produce low or zero similarity.
- Scores mostly reflect token overlap, not meaning.
- The second chunk in the smoke output can score `0` when it shares no useful
  tokens with the query.

Example:

```text
Query: "What is vector similarity?"
Chunk: "Cosine similarity measures distance between embeddings."
```

Those two lines are semantically related, but lexical overlap can be low enough
to produce a weak score with `api-lexical`. This is the limitation Phase 2 is
designed to expose and improve.

This limitation is useful for learning because it makes retrieval behavior easy
to inspect. Phase 2 is where the quality gap becomes the work: semantic
embeddings, hybrid search, reranking and retrieval observability.

## Scaling Notes

`InMemoryVectorStore` is intentionally simple. It stores embedded chunks in a
`Map`, scans every chunk for each search, computes cosine similarity and sorts
the results before applying `topK`.

Current fit:

- Small local datasets and learning workflows.
- Phase 1 smoke tests and deterministic examples.
- Debugging retrieval behavior without an external database.

Limits:

- Search is a linear scan over all chunks.
- Memory grows with chunk count and embedding dimensions.
- There is no approximate nearest-neighbor index.
- Local JSON persistence is useful for development, not production scale.

Scaling breakpoints:

| Chunk count | Expected fit | Why |
|---:|---|---|
| `< 10k` | Fast for local learning | Linear scan remains small |
| `~100k` | Acceptable for experiments, depending on dimensions and hardware | Every query still scans every chunk |
| `> 1M` | Not viable for this store | No indexing structure or approximate nearest-neighbor search |

Roadmap direction:

- Phase 2 introduces stronger retrieval quality and observability.
- The target stack starts with pgvector for a Postgres-backed vector store.
- Qdrant remains the later migration path when vector scale or ANN features
  justify a dedicated vector database.

## Cost Model (Planned)

Even in a local system, every step has a cost:

- more chunks mean slower retrieval
- higher dimensions mean more expensive similarity comparisons
- larger documents mean more embeddings to compute and store

Understanding cost in Phase 1 matters before adding LLMs, agents and memory.
Otherwise, complexity grows without control. Phase 1 records a baseline but
does not yet expose full per-stage cost metrics. The cost model should
eventually make each request explainable by stage:

| Stage | Current cost shape | Metrics to track |
|---|---|---|
| ETL | O(input size) | bytes read, sections produced, extraction latency |
| Chunking | O(document characters) | chunk count, chunk size distribution, latency |
| Embeddings | O(chunks * dimensions) | provider, dimensions, input tokens/chars, latency |
| Retrieval | O(chunks * dimensions) for in-memory scan | topK, score distribution, retrieval latency |
| Answering | O(top chunk size) today; LLM inference TBD | answer latency, tokens, model, estimated cost |

This connects the learning loop to the future observability work: latency per
stage, token usage, memory usage and estimated cost.

## Mini Experiment

1. Run the current smoke flow:

   ```bash
   npm run rag:smoke -- --dataset phase-0-smoke-text --query "What does this command verify?"
   ```

2. Observe:

   - the score of the top chunk
   - the zero or lower-than-top score on unrelated chunks
   - `devMode.results[*].embedding.provider` and `dimensions`

3. Open `packages/rag/src/vector-store.ts`.

4. Locate `cosineSimilarity()`.

5. Try different query wording and observe how scores change.

6. Compare the result with `datasets/golden/baselines/phase-1-baseline.json`
   for the recorded Phase 1 baseline.

Goal: understand how retrieval behavior emerges from vector math. The output
score you see in JSON is the score computed by the vector store you can read in
the code.
