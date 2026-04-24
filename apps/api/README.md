# api

Backend API server for GroundedOS Lab. Handles client requests and orchestrates
the local AI pipeline.

## Responsibilities

- Expose REST endpoints for local development flows
- Route requests through the Phase 1 RAG pipeline
- Provide a future integration point for web, auth, observability and safety
  layers

## Status

In Progress - local RAG API is implemented for inline JSON text, multipart file
upload, persisted local document indexes, basic index management, and selectable
local embedding providers, including an opt-in Ollama semantic provider and
session-scoped persistent memory. Retrieval executes in hybrid mode (dense +
sparse lexical blending) by default, followed by an explicit reranking stage
with per-stage telemetry in Dev Mode.

## Local usage

Start the API server from the repository root:

```bash
npm run api:dev
```

The server listens on `PORT` or `3001` by default.
Reference environment values live in
[`apps/api/.env.example`](./.env.example).

### Endpoints

#### `GET /health`

Returns a basic service health response.

#### `POST /rag/ask`

Runs the local Phase 1 RAG pipeline against inline text content or an uploaded
text/PDF file. It can also ask against a previously persisted index by
`documentId`.

JSON inline text:

```bash
curl -X POST http://localhost:3001/rag/ask \
  -H 'content-type: application/json' \
  -d '{
    "type": "text",
    "content": "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
    "query": "What explains vector search?",
    "title": "Inline API Test",
    "topK": 1
  }'
```

JSON request body:

| Field | Required | Description |
|---|---:|---|
| `type` | No | Only `"text"` is supported for JSON bodies. Defaults to `"text"`. |
| `content` | Yes | Inline text content to ingest and retrieve against. |
| `query` | Yes | Question to ask against the ingested content. |
| `topK` | No | Number of chunks to retrieve. Defaults to `3`. |
| `title` | No | Optional document title for metadata and Dev Mode output. |
| `documentId` | No | Optional stable document ID. |
| `metadata` | No | Additional object metadata passed into ETL. |
| `embeddingProvider` | No | `"api-lexical"`, `"local-hash"` or `"ollama"`. Defaults to `"api-lexical"`. |
| `sessionId` | No | Optional session identifier for persistent per-session memory recall/store. |

Response includes `document`, `answer`, `index`, and `devMode`.

Persisted index ask:

```bash
curl -X POST http://localhost:3001/rag/ask \
  -H 'content-type: application/json' \
  -d '{
    "documentId": "smoke-text-001",
    "query": "What does this command verify?",
    "topK": 1
  }'
```

When asking by `documentId`, the API uses the embedding provider saved with the
persisted index and ignores any `embeddingProvider` in the request body.

Multipart file upload:

```bash
curl -X POST http://localhost:3001/rag/ask \
  -F file=@datasets/samples/phase-0-smoke.txt \
  -F type=text \
  -F query="What does this command verify?" \
  -F topK=1
```

Multipart fields:

| Field | Required | Description |
|---|---:|---|
| `file` | Yes | Text or PDF file to ingest and retrieve against. |
| `type` | No | `"text"` or `"pdf"`. Inferred from `.pdf` extension when omitted; otherwise defaults to text. |
| `query` | Yes | Question to ask against the uploaded content. |
| `topK` | No | Number of chunks to retrieve. Defaults to `3`. |
| `title` | No | Optional document title for metadata and Dev Mode output. |
| `documentId` | No | Optional stable document ID. |
| `metadata` | No | JSON object string with additional metadata passed into ETL. |
| `embeddingProvider` | No | `"api-lexical"`, `"local-hash"` or `"ollama"`. Defaults to `"api-lexical"`. |
| `sessionId` | No | Optional session identifier for persistent per-session memory recall/store. |

#### `POST /rag/index`

Indexes inline text or a text/PDF upload and persists the embedded chunks under
`.groundedos/indexes/`.

JSON inline text:

```bash
curl -X POST http://localhost:3001/rag/index \
  -H 'content-type: application/json' \
  -d '{
    "type": "text",
    "content": "GroundedOS Lab smoke test.\n\nThis command verifies that the ETL dispatcher can route plain text input from a registered sample dataset and return a NormalizedDocument.",
    "title": "Inline API Test",
    "documentId": "smoke-text-001",
    "embeddingProvider": "local-hash"
  }'
```

Multipart file upload:

```bash
curl -X POST http://localhost:3001/rag/index \
  -F file=@datasets/samples/phase-0-smoke.txt \
  -F type=text \
  -F documentId=smoke-text-001 \
  -F embeddingProvider=local-hash
```

Response includes `document`, `index`, and `storage.indexPath`. `index`
contains `embeddingProvider`, `embeddingDimensions`, and, for new indexes,
`embeddingModel` with provider/model/dimension metadata.

### Ollama embeddings

`embeddingProvider: "ollama"` uses a local Ollama server and calls
`POST /api/embed`. It is opt-in and requires Ollama plus an embedding model to
be available locally:

```bash
ollama pull embeddinggemma
```

Optional environment variables:

| Variable | Default | Description |
|---|---|---|
| `GROUNDEDOS_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `GROUNDEDOS_OLLAMA_EMBED_MODEL` | `embeddinggemma` | Embedding model name |
| `GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS` | `768` | Expected vector dimensions saved with the index |
| `GROUNDEDOS_OLLAMA_KEEP_ALIVE` | unset | Optional Ollama keep-alive value |
| `GROUNDEDOS_OLLAMA_REQUEST_TIMEOUT_MS` | package default | Request timeout override |

For a full install and verification tutorial, see
[`docs/ollama-setup.md`](../../docs/ollama-setup.md).

#### `GET /rag/indexes`

Lists persisted local indexes.

```bash
curl http://localhost:3001/rag/indexes
```

Response includes `count` and `indexes`, where each item contains `createdAt`,
`document`, `index`, and `storage`.

#### `DELETE /rag/indexes/:documentId`

Deletes one persisted local index.

```bash
curl -X DELETE http://localhost:3001/rag/indexes/smoke-text-001
```

#### `GET /rag/metrics/tradeoffs`

Returns aggregated request metrics for the local trade-offs dashboard.

```bash
curl http://localhost:3001/rag/metrics/tradeoffs
```

Response includes:

- `totals`: rolling-window aggregate (`requests`, `avgLatencyMs`, `p95LatencyMs`, `avgCostUsd`, `groundedRate`, `cacheHitRate`)
- `providers`: per-provider aggregates for quick comparison
- `recent`: most recent request samples

#### `GET /rag/memory/:sessionId`

Returns persisted session memory entries for the provided session.

```bash
curl http://localhost:3001/rag/memory/demo-session
```

Response includes `sessionId`, `count`, and `entries` with stored query/answer
pairs and timestamps.

## Current limits

- Multipart uploads are limited to one file and 5 MB.
- Persisted indexes are local JSON files under `.groundedos/indexes/`.
- The answer is extractive and based on the top retrieved chunk.
- Retrieval uses `"api-lexical"` by default. `"local-hash"` is available as an
  opt-in deterministic token/ngram hashing provider.
- `"ollama"` is available as an opt-in local semantic embedding provider, but it
  requires a running Ollama server and a pulled embedding model.
- OpenAI and Hugging Face providers are not wired yet.
- No auth, observability or production vector database yet.
