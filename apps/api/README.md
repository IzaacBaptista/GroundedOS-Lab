# api

Backend API server for GroundedOS Lab. Handles client requests and orchestrates
the local AI pipeline.

## Responsibilities

- Expose REST endpoints for local development flows
- Route requests through the local RAG pipeline
- Provide a future integration point for web, auth, observability and safety
  layers

## Status

Implemented baseline through Phase 5 with active Phase 6 rollout work: the API
supports local RAG flows, persisted indexes, session-scoped memory, Phase 4 lab
benchmark endpoints, and a Phase 6 auth/admin baseline (JWT login, refresh,
logout, API keys, admin routes, owner scoping, rate limiting and audit hooks).

## Local usage

Start the API server from the repository root:

```bash
npm run api:dev
```

The server listens on `PORT` or `3001` by default.
Reference environment values live in
[`apps/api/.env.example`](./.env.example). The API dev server also loads
repository-root `.env`/`.env.local` files before app-specific env files.

### Endpoints

#### `GET /health`

Returns a basic service health response.

#### `POST /auth/login`

Authenticates with the environment-configured admin credentials, returns access
and refresh tokens, and sets the `groundedos-session` cookie for browser usage.

#### `POST /auth/refresh`

Rotates a refresh token and returns a new access token pair.

#### `POST /auth/logout`

Clears the session cookie and revokes the presented bearer token or cookie token
when available.

### Auth-enabled local web flow

Local development starts open unless auth enforcement is enabled:

```bash
AUTH_ENFORCEMENT=true npm run api:dev
```

Then start the web app with `npm run web:dev` and log in from the top bar.
Default local credentials are:

- username: `admin`
- password: `admin-password`

`POST /auth/login` issues the HttpOnly `groundedos-session` cookie used by the
browser. `POST /auth/refresh` rotates refresh tokens and also refreshes that
cookie. `POST /auth/logout` clears the cookie and revokes the active token when
the request includes one.

#### `GET /admin/*`, `POST /admin/*`, `DELETE /admin/*`

Admin endpoints are implemented for index clearing, cost summary, audit-log
inspection and API-key management. They are accessible only when auth
enforcement is enabled and the authenticated user has the `admin` role.

#### Async jobs (`/jobs/*`)

Async execution endpoints are available through a BullMQ queue when Redis is
configured (`REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`).

- `POST /jobs/phase5` enqueues a Phase 5 experiment run.
- `POST /jobs/model-benchmark` enqueues a model benchmark run.
- `GET /jobs/:jobId` returns queue job status/result metadata.

Start the API worker from repository root:

```bash
npm run api:jobs:worker
```

Or from API workspace:

```bash
npm --workspace @groundedos/api run jobs:worker
```

These endpoints are protected when auth enforcement is active. Provide a
bearer token or API key in requests.

Enqueue a Phase 5 track run (bearer token):

```bash
curl -X POST http://localhost:3001/jobs/phase5 \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access-token>' \
  -d '{"track":"quantization"}'
```

Enqueue a Phase 5 track run (API key):

```bash
curl -X POST http://localhost:3001/jobs/phase5 \
  -H 'content-type: application/json' \
  -H 'x-api-key: <api-key>' \
  -d '{"track":"quantization"}'
```

Enqueue a model benchmark run:

```bash
curl -X POST http://localhost:3001/jobs/model-benchmark \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access-token>' \
  -d '{"providers":["local-extractive","ollama","openai"]}'
```

Capture `jobId` from an enqueue response (requires `jq`):

```bash
JOB_ID=$(curl -s -X POST http://localhost:3001/jobs/phase5 \
  -H 'content-type: application/json' \
  -H 'x-api-key: <api-key>' \
  -d '{"track":"quantization"}' | jq -r '.jobId')
```

Poll a job status (replace `<job-id>` from enqueue response):

```bash
curl http://localhost:3001/jobs/<job-id> \
  -H 'authorization: Bearer <access-token>'
```

Or with API key and captured `JOB_ID`:

```bash
curl "http://localhost:3001/jobs/${JOB_ID}" \
  -H 'x-api-key: <api-key>'
```

If Redis is not configured, jobs endpoints return `503` and worker startup
fails with a configuration error.

Troubleshooting (`/jobs/*`):

- `401 Authentication required`:
  enable auth headers when enforcement is active (`Authorization: Bearer ...`
  or `x-api-key`).
- `401 Invalid or expired token`:
  refresh login session (`POST /auth/refresh`) or re-login to get a new access
  token.
- `403 Admin role required`:
  endpoint was called under `/admin/*` with a non-admin identity.
- `404 Job <id> not found`:
  confirm the `jobId` came from the same Redis-backed environment and queue.
- `503 Async job queue is not configured`:
  set `REDIS_URL` (or `REDIS_HOST`/`REDIS_PORT`) and restart API + worker.
- Worker starts but jobs do not complete:
  verify worker is running (`npm run api:jobs:worker`), Redis is reachable,
  and commands such as `npm run experiment:quantization` run successfully in
  the same environment.

#### `POST /rag/ask`

Runs the local RAG pipeline against inline text content or an uploaded
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
| `embeddingProvider` | No | `"api-lexical"`, `"local-hash"`, `"ollama"` or `"openai"`. Defaults to `"api-lexical"`. |
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
| `embeddingProvider` | No | `"api-lexical"`, `"local-hash"`, `"ollama"` or `"openai"`. Defaults to `"api-lexical"`. |
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

### OpenAI embeddings

`embeddingProvider: "openai"` uses OpenAI embeddings via `POST /v1/embeddings`.
It is opt-in and requires an API key:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | unset | Required OpenAI API key |
| `GROUNDEDOS_OPENAI_BASE_URL` | `https://api.openai.com/v1` | Optional OpenAI-compatible base URL |
| `GROUNDEDOS_OPENAI_EMBED_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `GROUNDEDOS_OPENAI_EMBED_DIMENSIONS` | `1536` | Expected vector dimensions saved with the index |
| `GROUNDEDOS_OPENAI_REQUEST_TIMEOUT_MS` | package default | Request timeout override |
| `OPENAI_ORG_ID` | unset | Optional organization header |
| `OPENAI_PROJECT_ID` | unset | Optional project header |

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

#### `POST /rag/metrics/model-benchmark/run`

Runs the Phase 4 model benchmark command from the API process and writes the
artifact to `datasets/golden/baselines/phase-4-model-benchmark.json`.

```bash
curl -X POST http://localhost:3001/rag/metrics/model-benchmark/run \
  -H 'content-type: application/json' \
  -d '{"providers":["local-extractive","ollama","openai"]}'
```

Response includes `success`, the command used, provider list and process output.

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
- `"openai"` embeddings are wired for indexing and ask flows; Hugging Face
  provider integration is still not implemented.
- Auth, owner scoping, rate limiting, admin routes and audit logging are
  implemented. Middleware enforcement is opt-in in local dev and defaults to
  enabled in non-dev/non-test environments when `AUTH_ENFORCEMENT` is unset.
- User/session storage supports memory (default) and optional PostgreSQL
  backends (`AUTH_USER_BACKEND=postgres`, `AUTH_SESSION_BACKEND=postgres`) with
  memory fallback on DB unavailability.
- Async jobs require a Redis connection and currently run with single-worker,
  in-order processing (`concurrency: 1`) without advanced retry policies.
- Production observability stack and production vector database are still
  pending.
