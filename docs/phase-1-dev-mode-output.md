# Phase 1 Dev Mode Retrieval Output

This document defines the first stable Dev Mode retrieval output contract for
the local Core RAG flow.

The contract is produced by `retrieveForDevMode()` or by passing retrieval
results to `createRetrievalDevOutput()`.

## Shape

```ts
type RetrievalDevModeOutput = {
  query: string;
  resultCount: number;
  results: RetrievalDevModeResult[];
};

type RetrievalDevModeResult = {
  rank: number;
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  text: string;
  source: {
    documentTitle: string;
    modality: string;
    sourceType: string;
    originalFilename?: string;
    sectionHeading?: string;
    page?: number;
  };
  offsets: {
    startOffset: number;
    endOffset: number;
    offsetBasis: "document" | "section";
  };
  embedding: {
    provider: string;
    dimensions: number;
    model?: string;
    normalized?: boolean;
  };
};
```

## Example

```json
{
  "query": "beta question",
  "resultCount": 1,
  "results": [
    {
      "rank": 1,
      "chunkId": "doc-1:section-2:chunk-1",
      "documentId": "doc-1",
      "sectionId": "section-2",
      "score": 1,
      "text": "Beta retrieval note.",
      "source": {
        "documentTitle": "Dev Mode Test",
        "modality": "text",
        "sourceType": "manual"
      },
      "offsets": {
        "startOffset": 20,
        "endOffset": 40,
        "offsetBasis": "document"
      },
      "embedding": {
        "provider": "local-hash",
        "dimensions": 256,
        "model": "local-hash-v1",
        "normalized": true
      }
    }
  ]
}
```

## Semantics

- `rank` is one-based and follows descending retrieval score order.
- `score` is the vector-store similarity score for the retrieved chunk.
- `chunkId`, `documentId` and `sectionId` are stable identifiers for tracing.
- `source` identifies the original document and section/page when available.
- `offsets` point to the emitted chunk text. `offsetBasis: "document"` means the
  offsets are absolute inside `NormalizedDocument.content.fullText`;
  `offsetBasis: "section"` means they are relative to the source section.
- `embedding` identifies the provider and vector dimensions used for retrieval.
  Newer providers may also include model name and whether vectors are
  normalized.

## Non-goals

- This is not a UI contract for a completed web Dev Mode screen.
- This does not include token usage, latency, reranking, traces or model routing.
- This does not imply production vector database support.
