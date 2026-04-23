# Phase 1 Local RAG Usage

Phase 1 now has a local, executable RAG foundation. It runs without external
model APIs or production vector databases.

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

Both RAG commands execute the same local pipeline:

```text
source document
  -> ingest()
  -> chunkDocument()
  -> embedChunks()
  -> InMemoryVectorStore
  -> retrieveForDevMode()
  -> grounded answer JSON
```

The output includes:

- `answer.grounded` and a simple answer generated from the top retrieved chunk
- citation metadata for the answer
- retrieved chunk IDs, scores, source metadata and offsets
- Dev Mode retrieval output matching
  [`phase-1-dev-mode-output.md`](./phase-1-dev-mode-output.md)
- index metadata such as chunk count, embedding provider, vector dimensions and
  embedding model metadata when available

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
- The vector store is in memory only.
- The API is local-development only; it has no auth or observability yet.
- The API can persist local JSON indexes under `.groundedos/indexes/`, but there
  is no production vector database yet.
- The web surface is local-development only; it has no saved question history or
  production build pipeline yet.
- There is no reranking, token accounting, latency tracing or model routing yet.

## Local API And Web

The local package and CLI layer are wrapped by the first API surface:

```bash
npm run api:dev
```

It exposes `GET /health`, `POST /rag/index`, `POST /rag/ask`,
`GET /rag/indexes`, and `DELETE /rag/indexes/:documentId` for inline JSON text,
multipart text/PDF uploads, persisted local indexes and basic index management.
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

Start the web surface in another terminal:

```bash
npm run web:dev
```

It serves `http://localhost:3000` and proxies `/api/*` to the local API.
Use `Index` to persist the current source, then `Ask` to query the saved local
index. The indexed-document selector can refresh, select and delete local
indexes.

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

The next implementation target is either API contract hardening around provider
config/errors or adding a second semantic provider such as OpenAI or Hugging
Face for local-vs-cloud comparison.
