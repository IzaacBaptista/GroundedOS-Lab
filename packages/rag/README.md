# rag

Retrieval-Augmented Generation pipeline. Implements the full retrieval stack from document ingestion to context assembly.

## Responsibilities

- Chunk and embed documents into vector representations
- Perform hybrid search (dense + sparse) over the vector store
- Re-rank retrieved candidates for relevance
- Assemble the final context window for LLM inference
- Support Adaptive RAG (decide when retrieval is needed)

## Status

Complete (Phases 1-2 baseline): chunking, embedding providers, in-memory
vector store, hybrid retrieval, query understanding, semantic cache and Dev
Mode retrieval output contract are active. Full LLM context-assembly/routing
policies remain future work.

## Current implementation

The first Phase 1 slices expose deterministic character-based chunking through
`chunkDocument()`, embedding contracts and local deterministic providers,
local similarity search through `InMemoryVectorStore`, and end-to-end local
retrieval through `buildRetrievalIndex()` and `retrieveFromIndex()`.

From the repository root, the complete local pipeline can be exercised with:

```bash
npm run rag:smoke -- --dataset phase-0-smoke-text --query "What does this command verify?"
npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text --query "What does this command verify?"
```

The smoke command runs a registered dataset through ETL, chunking, embeddings,
in-memory vector search and Dev Mode output generation. The ask command runs
the same local pipeline against an arbitrary local text or PDF file. Both print
a simple grounded answer plus retrieval diagnostics.

```ts
import { chunkDocument } from "@groundedos/rag";

const chunks = chunkDocument(normalizedDocument, {
  maxChunkChars: 800,
  overlapChars: 100,
});
```

`chunkDocument()` consumes a `NormalizedDocument` from `packages/core` and
returns retrieval chunks with stable IDs, source section IDs, offsets, text and
metadata needed by future Dev Mode retrieval diagnostics.

When `document.lineage.originalFilename` has a recognized code extension
(`.ts`, `.py`, `.go`, `.java`, ...), chunking switches to a unit-aware mode
that avoids splitting a function/class body mid-way (book cap. 8,
"Chunking para código") instead of the default fixed-size sliding window.

### Chunking strategies (book cap. 8)

`chunkDocument(document, { strategy })` supports three strategies:

| `strategy` | Behavior |
|---|---|
| `"fixed"` (default) | Character sliding window; the cut is snapped back to the nearest whitespace instead of splitting a word, falling back to a hard cut only when no whitespace exists in the window. |
| `"recursive"` | Prefers paragraph boundaries, then sentence boundaries, before falling back to `"fixed"` — the "default choice of most RAG libraries" per the book. |
| `"sentence"` | Packs whole sentences up to `maxChunkChars`; never splits a sentence, even if a single one alone exceeds the budget (emitted as an oversized chunk instead). |

`chunkDocumentWithParents(document, options)` adds parent-child chunking:
returns the same fine-grained `chunks` as `chunkDocument()` (for precise
retrieval matching) plus a `parents` array — one entry per section, the
"contexto amplo" a caller can inject into the prompt once a child chunk
scores well. Each child carries `parentChunkId` pointing to its parent.
`structure-aware` chunking already happens implicitly: chunking runs
per-section, and sections already come from heading/page boundaries set by
the extractors (Part 2).

Semantic chunking (embedding-based topic-shift detection) is not implemented — it needs
a real embedding call per candidate boundary, which is a meaningfully different
cost/complexity trade-off from the three strategies above.

Defaults:

| Option | Default | Description |
|---|---:|---|
| `maxChunkChars` | `800` | Maximum character window size per chunk |
| `overlapChars` | `100` | Character overlap between consecutive chunks in the same section |

Chunking is section-local: chunks do not cross `DocumentSection` boundaries.

Embeddings are local and deterministic by default, intended for tests and the
first retrieval pipeline wiring. The package now has two compatible layers:

- `EmbeddingProvider`, the existing low-level interface used by the retrieval
  pipeline.
- `SemanticEmbeddingsProvider`, the provider contract that exposes model
  metadata, per-input results and future provider compatibility.

`LocalHashEmbeddingsProvider` is the first semantic-style provider. It hashes
tokens and token bigrams into a fixed 256-dimensional L2-normalized vector by
default. It is deterministic and dependency-free, but still not a semantic
quality baseline like a real embedding model.

`OllamaEmbeddingsProvider` is the first real semantic provider. It calls
Ollama's local `/api/embed` endpoint, uses `embeddinggemma` with 768 dimensions
by default, and remains opt-in so tests and local smoke flows stay deterministic
without requiring an external service.

```ts
import {
  DeterministicEmbeddingProvider,
  LocalHashEmbeddingsProvider,
  OllamaEmbeddingsProvider,
  chunkDocument,
  embedChunks,
  semanticToEmbeddingProvider,
} from "@groundedos/rag";

const chunks = chunkDocument(normalizedDocument);
const embeddedChunks = await embedChunks(
  chunks,
  new DeterministicEmbeddingProvider({ dimensions: 16 })
);

const localHashProvider = semanticToEmbeddingProvider(
  new LocalHashEmbeddingsProvider()
);
const localHashChunks = await embedChunks(chunks, localHashProvider);

const ollamaProvider = semanticToEmbeddingProvider(
  new OllamaEmbeddingsProvider({
    baseUrl: "http://localhost:11434",
    model: "embeddinggemma",
    dimensions: 768,
  })
);
const semanticChunks = await embedChunks(chunks, ollamaProvider);
```

### Document vs query prefixes, and Matryoshka truncation (book cap. 12)

Some models are trained asymmetrically and expect a different
prefix/instruction depending on whether the text being embedded is a
document to index or a query to search with — `embeddinggemma` (this
package's default Ollama model) is one of them. Ignoring this for a model
that expects it is a silent quality regression: the call succeeds, retrieval
just gets worse with no error.

`embedChunks()` always embeds with `inputType: "document"`; `retrieveFromIndex()`
always embeds the query with `inputType: "query"`. `OllamaEmbeddingsProvider`
and `OpenAIEmbeddingsProvider` accept `documentPrefix`/`queryPrefix` options
that get prepended to the text for the matching `inputType` — unset by
default, so behavior is unchanged unless you configure a prefix:

```ts
const ollamaProvider = new OllamaEmbeddingsProvider({
  model: "embeddinggemma",
  documentPrefix: "title: none | text: ",
  queryPrefix: "task: search result | query: ",
});
```

`truncateEmbedding(vector, targetDimensions)` and
`truncateEmbeddedChunk(chunk, targetDimensions)` implement Matryoshka
truncation: a Matryoshka-trained model's first N dimensions already
concentrate most of the semantic signal, so a full vector (or an
already-embedded chunk) can be truncated to a smaller size on demand —
trading quality for storage/compute cost — without re-embedding or
reindexing from scratch.

The in-memory vector store supports insert, similarity search, `topK`
limits and filtering over flat chunk metadata such as `documentId`,
`sectionId`, `modality`, `page`, `sourceType`, `originalFilename` and
`embeddingProvider`. Filtering runs *before* scoring/ranking, not as a
post-hoc discard of an already-ranked `topK` — the book cap. 9 principle for
metadata like `permissions`/`tenantId`.

### Similarity metric (book cap. 11)

`EmbeddingModelInfo.similarityMetric` (`"cosine"` | `"dotProduct"` |
`"euclidean"`) declares which metric a model's vectors were trained/evaluated
to be compared with — using the wrong metric for a given model is a silent
quality regression, not an error, per the book's explicit warning. All
built-in providers (`LocalHashEmbeddingsProvider`, `OllamaEmbeddingsProvider`,
`OpenAIEmbeddingsProvider`, `DeterministicEmbeddingProvider`) declare
`"cosine"`, the RAG default. `embedChunks()` copies the metric onto every
`EmbeddedChunk.embeddingMetadata`, and `InMemoryVectorStore` uses it to pick
the right scoring function automatically — cosine and dot product rank
higher-is-more-similar; Euclidean distance is converted to a score
(`1 / (1 + distance)`) so all three metrics sort consistently. A store
rejects inserting chunks whose declared metric conflicts with what it
already holds, since mixing metrics in one index produces meaningless
scores.

### Cap. 9 metadata filters

`chunkDocument()` copies `author`, `timestamp`, `tags`, `permissions`,
`tenantId` and `relationships` from `NormalizedDocument.metadata` onto every
chunk. `store.search({ filter })` treats the array-valued fields specially:

| Filter key | Match semantics |
|---|---|
| `tags` | Chunk matches if its `tags` array includes the requested value, or if it has no tags at all |
| `permissions` | **Security filter.** Chunk matches if its `permissions` array includes the requested role, or if `permissions` is unset/empty (no restriction = public) |
| `tenantId` | Exact match |

Everything else uses exact-match, as before. See `packages/core`'s README for
the full field list and categories.

### Real vector store backends (book cap. 13)

Besides `InMemoryVectorStore`, this package ships real HTTP-backed stores for
the options the book discusses. All of them implement the same `VectorStore`
interface, fall back to `InMemoryVectorStore` (as a "mirror" or on connection
failure) when unconfigured or unreachable, and apply the cap. 9 metadata
semantics — array fields match by contains-or-open (unset/empty = visible to
everyone), everything else by exact match — as a genuine **pre-filter**, not
a post-hoc discard of an already-ranked result set:

| Store | Options | Namespaces/tenants |
|---|---|---|
| `PgvectorVectorStore` | `createVectorStore({ connect, tableName?, dimensions? })` | none — use a separate table/schema per tenant |
| `QdrantVectorStore` | `new QdrantVectorStore({ baseUrl, collectionName, apiKey? })` | none — use a separate collection per tenant |
| `PineconeVectorStore` | `new PineconeVectorStore({ baseUrl, apiKey, namespace? })` | native `namespace` |
| `WeaviateVectorStore` | `new WeaviateVectorStore({ baseUrl, className, tenant? })` | native `tenant` (class needs `multiTenancyConfig.enabled: true`) |
| `ElasticsearchVectorStore` | `new ElasticsearchVectorStore({ baseUrl, index })` | none — use a separate index per tenant |

Each store's `insert()`/`search()` are synchronous (writing/reading through
an in-memory mirror) for interface compatibility; use `insertAsync()` /
`searchAsync()` to actually round-trip to the real backend.

`PgvectorVectorStore` and `QdrantVectorStore` fixed a real bug in this round:
filtering by any cap. 9 metadata field (`tenantId`, `permissions`, `tags`,
`modality`, ...) used to either throw a SQL error (pgvector, which assumed
every filter key was a real table column) or silently match nothing (Qdrant,
whose filter keys didn't point at the nested `payload.metadata.*` path
where those fields actually live) — see ADR-026.

`relationships` (an array of objects) has no flat representation in Pinecone
or Weaviate's schema-typed properties, so both serialize it to a JSON string
field and parse it back on read; it isn't filterable on those two backends.

### Index type, similarity metric, and recall/latency tuning (book cap. 14)

`InMemoryVectorStore` is brute-force by design — the correctness baseline
the book describes, not an approximation. The real backends build an ANN
index and must be told which similarity metric to build it for, since the
book is explicit that the index's distance function has to match the
embedding model's declared metric (`EmbeddingModelInfo.similarityMetric`,
ADR-024) — using cosine ops for a dot-product-optimized model is a silent
correctness bug, not an error. `PgvectorVectorStore` and `QdrantVectorStore`
both fixed this: they used to hardcode cosine distance regardless of what
the embedding model actually declared (ADR-027).

| Store | `similarityMetric` → | Build-time tuning | Query-time recall/latency knob |
|---|---|---|---|
| `PgvectorVectorStore` | operator class (`vector_cosine_ops`/`vector_l2_ops`/`vector_ip_ops`) + operator (`<=>`/`<->`/`<#>`) | `indexType: "ivfflat" \| "hnsw"`, `ivfflatLists`, `hnswM`, `hnswEfConstruction` | `probes` (ivfflat) or `hnswEfSearch` (hnsw) |
| `QdrantVectorStore` | collection `distance` (`Cosine`/`Dot`/`Euclid`) | `hnswM`, `hnswEfConstruct` | `hnswEf`, `exact: true` (brute-force baseline for a given query) |
| `ElasticsearchVectorStore` | n/a (ES native `knn` always uses cosine internally for `dense_vector`) | — | `numCandidates` (defaults to `max(topK * 10, 50)`) |

`PgvectorVectorStore.reindexAnn()` runs `REINDEX INDEX CONCURRENTLY` on the
ANN index — the book notes index quality degrades as rows are inserted over
time without a full rebuild; call this periodically (e.g. a scheduled
maintenance job), not on every write.

```ts
import { InMemoryVectorStore } from "@groundedos/rag";

const store = new InMemoryVectorStore();
store.insert(embeddedChunks);

const results = store.search({
  embedding: embeddedChunks[0].embedding,
  topK: 3,
  filter: { modality: "text" },
});
```

For the first local retrieval flow:

```ts
import { buildRetrievalIndex, retrieveFromIndex } from "@groundedos/rag";

const index = await buildRetrievalIndex(normalizedDocument);
const results = await retrieveFromIndex(index, "what does this document say?", {
  topK: 3,
  mode: "hybrid",
});
```

Retrieval options:

| Option | Default | Description |
|---|---|---|
| `topK` | store default (`5`) | Number of ranked chunks returned |
| `filter` | unset | Exact metadata filter applied before ranking |
| `mode` | `"dense"` | `"dense"` for cosine-only ranking, `"hybrid"` for dense+sparse |
| `hybridDenseWeight` | `0.65` | Dense weight in hybrid score blend (`0..1`) |
| `hybridCandidateTopK` | `max(topK*4, 10)` | Candidate pool size before hybrid reranking |

For Dev Mode diagnostics, use `retrieveForDevMode()` to return the documented
retrieval output shape with chunk IDs, scores, source metadata and offsets.

```ts
import { retrieveForDevMode } from "@groundedos/rag";

const devOutput = await retrieveForDevMode(index, "what does this document say?", {
  topK: 3,
  mode: "hybrid",
});
```

When `mode: "hybrid"` is used, Dev Mode includes a `hybrid` block with
`denseWeight`, `sparseWeight`, and `candidateCount`.

### Sparse retrieval: real BM25, not a character-overlap heuristic (book cap. 15)

The "sparse" half of hybrid search is real BM25 (`bm25Score`/
`scoreCandidatesWithBm25`), computed over the candidate pool that dense
search already returned — term frequency with saturation (`k1`) and
document-length normalization (`b`), weighted by inverse document
frequency, exactly as the book describes it. Scores are min-max normalized
to `[0, 1]` across the candidate pool before being blended with the
(already-bounded) dense score, since raw BM25 scores are unbounded and
depend on corpus size.

`tfIdfScore`/`buildCorpusStats`/`computeTermFrequencies` are exported too —
TF-IDF is BM25's conceptual foundation per the book, useful on its own for
simpler lexical scoring needs.

```ts
import { scoreCandidatesWithBm25 } from "@groundedos/rag";

const scores = scoreCandidatesWithBm25("dispatcher normalized document", [
  { id: "chunk-1", text: "..." },
  { id: "chunk-2", text: "..." },
]);
```

This replaces a prior character-trigram overlap heuristic that had no IDF
weighting, no term-frequency saturation, and no document-length
normalization — see ADR-028. "Sparse embeddings" (learned sparse vectors,
e.g. SPLADE) — the book's third cap. 15 concept — are **not** implemented;
they need a real trained model, not a formula, and this package doesn't
integrate one.

### Retrieval básico: similarity threshold (book cap. 16)

`VectorSearchQuery.minScore` (and `retrieveFromIndex(..., { minScore })`)
excludes chunks below a similarity cutoff, instead of always returning
`topK` results regardless of how weak the weakest one is. Unset by default
(existing behavior unchanged); `InMemoryVectorStore` enforces it directly.

### Query understanding: real rewriting and explicit filter extraction (book cap. 17)

`rewriteQuery(text, options?)` now does more than strip filler words:

- **Abbreviation expansion** — a real dictionary (`db` → `database`, `auth`
  → `authentication`, etc.), separate from `expandQuery()`'s synonym map.
- **Anaphoric reference resolution** — `{ previousQuery }` lets a bare
  reference ("what about it?") pull in the previous turn's content words.
  Heuristic, not a coreference model — it only fires when the query
  contains a reference word (it/that/this/those/them/he/she).
- **Typo correction** — `{ vocabulary }` corrects a token within edit
  distance 1 of a known-good word. No vocabulary, no correction: there's no
  way to tell a typo from a valid rare term without one.

`extractQueryFilters(text)` parses explicit `key:value` tokens (`tag:`,
`author:`, `tenant:`) into a `VectorMetadataFilter`-shaped object and
strips them from the query. It does **not** parse free natural-language
constraints ("a política de reembolso em 2023") — that needs NER/an LLM,
not a formula, and is a disclosed limitation, not theater.

### Hybrid search: Reciprocal Rank Fusion (book cap. 18)

`retrieveFromIndex(..., { fusionMethod: "rrf" })` fuses the dense and BM25
rankings by position (`reciprocalRankFusion`, also exported standalone)
instead of the default weighted score sum — useful when the two scores'
scales aren't meaningfully comparable for a given corpus. Default stays
`"weighted"`; existing behavior is unchanged unless you opt in.

### Re-ranking: a real LLM reranker replaces billed-but-fake reranking (book cap. 19)

`rerankWithLlm(query, candidates, llmProvider)` is a genuine reranker: it
asks an LLM to judge relevance and reorders candidates by where their id
appears in the response. In `apps/api`, this is wired in behind
`GROUNDEDOS_ENABLE_LLM_RERANK=true` (same opt-in pattern as
`GROUNDEDOS_ENABLE_LLM_GENERATION`, ADR-017) — before this, the "reranking"
stage that ran unconditionally, was traced, and was billed as a
`"reranking"` cost unit was actually a lexical-overlap tiebreak, not a
reranker of any kind (see ADR-029). Every reranked candidate now carries a
`method: "llm" | "lexical-heuristic"` field so it's never silently reported
as the real thing when it's the fallback.

### Query transformation: real HyDE and step-back prompting (book cap. 20)

`buildHypotheticalDocument(query, { llmProvider })` now optionally asks an
LLM for a real hypothetical answer — HyDE's actual technique — instead of
always returning a fixed template. Without a provider (or if it throws),
it falls back to the template, disclosed as a heuristic approximation, not
the technique itself.

`buildStepBackQuery(query, { llmProvider })` is new: generalizes a specific
query into a broader one before retrieval, matching reference documentation
better than the exact question asked. LLM-backed when a provider is given;
otherwise a naive keyword-stripping heuristic. `retrieveFromIndex(...,
{ stepBack: true })` wires it into the candidate pool alongside dense/HyDE/
expansion results.

Both share `LlmTextProvider`/`OllamaTextProvider` — a minimal
text-completion primitive distinct from `GenerationProvider` (which is
shaped specifically for grounded question-answering), reused by HyDE,
step-back, and the LLM reranker instead of three separate provider shapes.

The output contract is documented in
[`docs/phase-1-dev-mode-output.md`](../../docs/phase-1-dev-mode-output.md).
The local CLI usage guide is documented in
[`docs/phase-1-local-rag.md`](../../docs/phase-1-local-rag.md).
The end-to-end internals guide is documented in
[`docs/phase-1-rag-internals.md`](../../docs/phase-1-rag-internals.md).

## Public API

| Export | Purpose |
|---|---|
| `chunkDocument(document, options?)` | Convert normalized document sections into retrieval chunks |
| `RetrievalChunk` | Stable chunk shape for retrieval and Dev Mode diagnostics |
| `ChunkDocumentOptions` | Optional chunk size and overlap settings |
| `embedChunks(chunks, provider)` | Attach embedding vectors to retrieval chunks |
| `EmbeddingProvider` | Interface for local or remote embedding providers |
| `DeterministicEmbeddingProvider` | Local deterministic provider for tests and development |
| `SemanticEmbeddingsProvider` | Higher-level embedding provider contract with model metadata |
| `EmbeddingModelInfo` | Provider/model/dimension/similarity-metric metadata for compatibility and Dev Mode output |
| `SimilarityMetric` | `"cosine" \| "dotProduct" \| "euclidean"` — which metric a model's vectors were trained to be compared with |
| `EmbeddingInputType` | `"document" \| "query"` — which side of asymmetric embedding a text is |
| `truncateEmbedding(vector, targetDimensions)` | Matryoshka truncation of a raw embedding vector |
| `truncateEmbeddedChunk(chunk, targetDimensions)` | Matryoshka truncation of an `EmbeddedChunk`, keeping `embeddingMetadata.dimensions` consistent |
| `LocalHashEmbeddingsProvider` | Local deterministic token/ngram hashing provider |
| `OllamaEmbeddingsProvider` | Opt-in local semantic embedding provider using Ollama `/api/embed`; supports `documentPrefix`/`queryPrefix` for asymmetric models |
| `semanticToEmbeddingProvider(provider)` | Adapt a semantic provider to the existing retrieval pipeline |
| `embeddingProviderToSemantic(provider, modelInfo?)` | Wrap a legacy provider with the semantic provider contract |
| `createEmbeddingProviderRegistry(providers?)` | Create a small provider registry for semantic providers |
| `EmbeddedChunk` | Retrieval chunk plus embedding vector and embedding metadata |
| `InMemoryVectorStore` | Local vector store with insert, similarity search and metadata filtering |
| `VectorSearchResult` | Search result containing an embedded chunk and cosine similarity score |
| `PgvectorVectorStore`, `createVectorStore(options)` | PostgreSQL + pgvector backend (book cap. 13) |
| `QdrantVectorStore` | Qdrant backend (book cap. 13) |
| `PineconeVectorStore` | Pinecone backend, with native namespace support (book cap. 13) |
| `WeaviateVectorStore` | Weaviate backend, with native tenant support (book cap. 13) |
| `ElasticsearchVectorStore` | Elasticsearch/OpenSearch backend using native `knn` pre-filtered search (book cap. 13) |
| `PgVectorProvider`, `QdrantProvider`, `PineconeProvider`, `WeaviateProvider`, `ElasticsearchProvider` | `VectorStoreProvider` wrappers for each backend, falling back to in-memory when unconfigured |
| `buildRetrievalIndex(document, options?)` | Chunk, embed and insert a normalized document into a local retrieval index |
| `retrieveFromIndex(index, query, options?)` | Embed a query and retrieve ranked chunks from an index |
| `RetrievalIndex` | Local retrieval index with provider, store and embedded chunks |
| `retrieveForDevMode(index, query, options?)` | Retrieve ranked chunks as the Dev Mode diagnostics contract |
| `RetrievalDevModeOutput` | Stable Dev Mode retrieval output shape |
| `processQuery(raw)` | Run query rewriting, expansion and intent detection before retrieval |
| `rewriteQuery(text, options?)` | Normalize, expand abbreviations, resolve anaphoric references, correct typos (book cap. 17) |
| `expandQuery(text)` | Generate lexical variants for retrieval recall |
| `detectIntent(text)` | Classify query intent into a stable contract |
| `extractQueryFilters(text)` | Parse explicit `key:value` tokens into a metadata filter (book cap. 17) |
| `bm25Score(queryTokens, doc, documentFrequency, totalDocuments, averageDocumentLength, params?)` | BM25 relevance score for one document (book cap. 15) |
| `scoreCandidatesWithBm25(query, candidates, params?)` | BM25-score and min-max normalize a candidate pool — what hybrid search uses |
| `tfIdfScore(queryTokens, doc, documentFrequency, totalDocuments)` | TF-IDF relevance score, BM25's conceptual foundation |
| `buildCorpusStats(documents)` | Document frequency + average document length over a corpus |
| `reciprocalRankFusion(rankedLists, k?)` | Rank-based RRF fusion, independent of raw score scale (book cap. 18) |
| `SemanticCache` | In-memory semantic cache keyed by document scope and query embedding similarity |
| `buildGroundedPrompt(request)` | Build a system/user prompt that restricts the model to the given chunks and asks it to cite chunk ids |
| `OllamaChatProvider` | Opt-in real LLM generation provider using Ollama `/api/chat`; turns retrieved evidence into an actual grounded answer |
| `GenerationProvider` | Interface for chat/completion providers consumed by grounded generation |
| `LlmTextProvider`, `OllamaTextProvider` | Minimal text-completion primitive shared by HyDE, step-back and LLM re-ranking (book cap. 19/20) |
| `rerankWithLlm(query, candidates, llmProvider)` | Real LLM-judged re-ranking (book cap. 19) |
| `buildHypotheticalDocument(query, options?)` | HyDE — LLM-backed when `llmProvider` given, template fallback otherwise (book cap. 20) |
| `buildStepBackQuery(query, options?)` | Generalize a query before retrieval — LLM-backed or keyword-heuristic fallback (book cap. 20) |
