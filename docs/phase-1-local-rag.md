# Local RAG Usage

The local RAG path has an executable Phase 1 foundation plus later retrieval
quality additions. The default flow runs without external model APIs or
production vector databases.

## Commands

Run the ETL smoke test against the registered sample dataset:

```bash
npm run ingest:smoke
```

Run the registered sample dataset through the local RAG pipeline:

```bash
npm run rag:smoke -- --dataset phase-0-smoke-text --query "What does this command verify?"
```

Ask a grounded question against a direct local text or PDF file:

```bash
npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text --query "What does this command verify?"
```

`rag:ask` also supports positional input:

```bash
npm run rag:ask -- ./notes.txt "What are the main points?"
```

## Pipeline

The CLI commands execute the local Phase 1 pipeline:

```text
source document
  -> ingest()
  -> chunkDocument()
  -> embedChunks()
  -> InMemoryVectorStore
  -> retrieveForDevMode()
  -> grounded answer JSON
```

The API path extends that baseline with query understanding, semantic cache,
hybrid retrieval, reranking, cost tracking, retrieval spans, trade-off metrics
and optional session memory.

The output includes:

- `answer.grounded` and a simple answer generated from the top retrieved chunk
- citation metadata for the answer
- retrieved chunk IDs, scores, source metadata and offsets
- Dev Mode retrieval output matching
  [`phase-1-dev-mode-output.md`](./phase-1-dev-mode-output.md)
- index metadata such as chunk count, embedding provider, vector dimensions and
  embedding model metadata when available
- API Dev Mode fields for `processedQuery`, `workflowContext`, `cache`, `cost`,
  `reranking`, `stageMetrics`, `retrievalSpans` and optional `memory`

## Current Limits

- The CLI answer is extractive: it quotes the top retrieved chunk instead of
  calling an LLM.
- `rag:smoke` and `rag:ask` use deterministic providers for local retrieval
  reproducibility.
- The API defaults to `api-lexical` and can opt into `local-hash` or `ollama`
  for new inline/upload asks and persisted indexes.
- `local-hash` is a deterministic token/ngram hashing provider, not a real
  semantic embedding model quality baseline.
- `ollama` is the first real local semantic provider. It requires a running
  Ollama server and a local embedding model.
- Full install and setup steps live in
  [`ollama-setup.md`](./ollama-setup.md).
- The vector store is in memory only.
- The API is local-development only; it has no auth or production tracing yet.
- The API can persist local JSON indexes under `.groundedos/indexes/`, but there
  is no production vector database yet.
- Session memory persists local JSON files under `.groundedos/memory/sessions/`
  when `sessionId` is supplied.
- The web surface is local-development only; it has no saved question history or
  production build pipeline yet.
- Reranking, token/unit accounting, local cost tracking and latency spans are
  implemented in the API path. Model routing is not implemented yet.

## Local API And Web

The local package and CLI layer are wrapped by the first API surface:

```bash
npm run api:dev
```

It exposes `GET /health`, `POST /rag/index`, `POST /rag/ask`,
`GET /rag/indexes`, `DELETE /rag/indexes/:documentId`,
`GET /rag/metrics/tradeoffs` and `GET /rag/memory/:sessionId` for inline JSON
text, multipart text/PDF uploads, persisted local indexes, metrics and memory
inspection.
Inline/upload requests accept
`embeddingProvider: "api-lexical" | "local-hash" | "ollama"`.
Persisted-index asks use the provider saved with that index.

To try Ollama manually:

```bash
ollama pull embeddinggemma

GROUNDEDOS_OLLAMA_EMBED_MODEL=embeddinggemma \
GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS=768 \
npm run api:dev
```

For a full install tutorial, including OS-specific setup and troubleshooting,
see [`ollama-setup.md`](./ollama-setup.md).

Start the web surface in another terminal:

```bash
npm run web:dev
```

It serves `http://localhost:3000` and proxies `/api/*` to the local API.
Use `Index` to persist the current source, then `Ask` to query the saved local
index. The indexed-document selector can refresh, select and delete local
indexes. The UI also includes provider comparison, trade-off metrics and an
optional session ID field for memory continuity.

Example multipart upload:

```bash
curl -X POST http://localhost:3001/rag/ask \
  -F file=@datasets/samples/phase-0-smoke.txt \
  -F type=text \
  -F query="What does this command verify?" \
  -F topK=1
```

Example persisted index flow:

```bash
curl -X POST http://localhost:3001/rag/index \
  -H 'content-type: application/json' \
  -d '{
    "type": "text",
    "content": "GroundedOS Lab smoke test.\n\nThis command verifies that the ETL dispatcher can route plain text input from a registered sample dataset and return a NormalizedDocument.",
    "title": "Smoke Test",
    "documentId": "smoke-text-001",
    "embeddingProvider": "local-hash"
  }'

curl -X POST http://localhost:3001/rag/ask \
  -H 'content-type: application/json' \
  -d '{
    "documentId": "smoke-text-001",
    "query": "What does this command verify?",
    "topK": 1
  }'

curl http://localhost:3001/rag/indexes

curl -X DELETE http://localhost:3001/rag/indexes/smoke-text-001
```

The next implementation target is the missing hybrid-vs-dense benchmark
artifact. After that, Phase 4 can start with local-vs-cloud comparison or A/B
prompt testing.

For a code-level walkthrough of what happens inside this pipeline, see
[`phase-1-rag-internals.md`](./phase-1-rag-internals.md).
