# ADR-028 — Real BM25/TF-IDF sparse retrieval, replacing a character-overlap heuristic

**Status:** Accepted

## Context

The RAG book's chapter 15 covers sparse retrieval: TF-IDF as the conceptual
foundation, BM25 as what the book explicitly calls the de facto standard for
lexical/keyword search in production ("quando alguém menciona busca por
palavra-chave... está quase sempre se referindo a alguma variação de
BM25"), and learned sparse embeddings (e.g. SPLADE) as a third, distinct
approach.

Auditing the existing hybrid search implementation: the "sparse" half of
`retrieveFromIndex(..., { mode: "hybrid" })` was `sparseNgramCosine()` — a
character-trigram Jaccard-style overlap between the query and each
candidate chunk's text. It has none of BM25/TF-IDF's defining mechanisms:
no inverse-document-frequency weighting (a term appearing in every
candidate scores the same as one appearing in only one), no term-frequency
saturation, and no document-length normalization. The package's own README
described this as "dense + sparse" hybrid search without disclosing that
"sparse" wasn't actually TF-IDF or BM25 — exactly the kind of gap this
project's ongoing chapter-by-chapter audit exists to catch: a chunk of the
book's vocabulary reused for something that doesn't do what that vocabulary
means in the field.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| What to implement | Real BM25 (`k1`/`b` params, IDF, term-frequency saturation, document-length normalization) as the primary scoring function, with TF-IDF exposed alongside it as the simpler building block BM25 refines | Implementing only TF-IDF (rejected: the book is explicit BM25 is what's actually used in practice — shipping only the simpler, less accurate predecessor when the more correct one is a small increment further doesn't match "what would actually be used") |
| Scope relative to the candidate pool | BM25 is computed over the same dense-search candidate pool hybrid search already fetches (`validatedDenseCandidates`) — a drop-in replacement for the old scoring function's role, not a redesign of the retrieval architecture | Running BM25 as a fully independent retrieval pass over the whole corpus and merging with dense results via RRF (rejected for this round: that's the book's chapter 18 topic — "hybrid search" as an architecture, RRF/fusion strategy — not chapter 15's, which is about the scoring function itself. Re-scoring a shared candidate pool is a real, if narrower, form of hybrid search; broadening it to independent-retrieval-plus-fusion is a larger, separate change noted as a known limitation below, not silently left broken) |
| Score scale mismatch (BM25 is unbounded, dense score is a bounded cosine value) | Min-max normalize BM25 scores to `[0, 1]` across the candidate pool before the weighted-sum fusion | Leaving BM25 raw and re-tuning `hybridDenseWeight` to compensate (rejected: BM25's raw scale depends on corpus size and query, so no fixed weight would stay correct as the corpus changes — normalizing per query is the standard fix and keeps the existing `denseWeight`/`sparseWeight` blend meaningful) |
| Tokenization | Reused the existing word-based tokenizer (`normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g)`) that the old n-gram heuristic already used for its own word-splitting step | A more sophisticated tokenizer (stemming, stopword removal) (rejected as out of scope: the book's chapter 15 content doesn't ask for it, and adding it would be a separate, debatable quality trade-off) |
| Learned sparse embeddings (SPLADE etc.) | Not implemented; documented as an explicit, disclosed gap | Building a placeholder/mock (rejected: this project's whole audit methodology is "no theater" — a fake sparse-embedding provider would be exactly the kind of thing being audited against in every other chapter) |

## Decision

- Added `packages/rag/src/sparse-retrieval.ts`: `tokenize`,
  `computeTermFrequencies`, `buildCorpusStats`, `tfIdfScore`, `bm25Score`,
  `scoreCandidatesWithBm25` (the min-max-normalized, candidate-pool-scoped
  entry point hybrid search actually calls).
- `retrieval.ts`'s hybrid scoring now calls `scoreCandidatesWithBm25()`
  instead of `sparseNgramCosine()`; the old function and its
  `buildCharacterNgrams()`/local `tokenize()` helpers were deleted.
- All new functions are exported from `@groundedos/rag`'s public API.

## Consequences

- Hybrid search's lexical signal now actually rewards rare, discriminating
  terms (error codes, product names, technical jargon — the book's own
  example of where lexical matching beats dense embeddings) instead of
  weighting every character trigram equally regardless of how common it is
  across the corpus.
- BM25 is a word/term-based algorithm, not a substring one — a compound
  token like "NormalizedDocument" (no space) is one token, not a substring
  match for the separate words "normalized" and "document" the way the old
  character-trigram approach happened to catch. This is an accurate
  reflection of what BM25 actually is, not a regression to work around; the
  existing hybrid-mode test suite passed unchanged, since dense search
  already carries those cases.
- Hybrid search's "sparse" component is still a re-scoring of the
  dense-retrieved candidate pool, not an independent lexical retrieval pass
  merged via RRF/weighted fusion across two separate result sets. A query
  whose only relevant match uses a rare term absent from the dense
  candidate pool entirely still won't be found by BM25 here — that
  limitation was already true with the old heuristic and is unchanged by
  this fix; addressing it is chapter 18 (hybrid search architecture) scope.
- Learned sparse embeddings remain unimplemented and undocumented-as-done
  anywhere; nothing in this codebase claims to provide them.
