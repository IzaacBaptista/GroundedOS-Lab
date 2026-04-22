# api

Backend API server for GroundedOS Lab. Handles client requests and orchestrates
the local AI pipeline.

## Responsibilities

- Expose REST endpoints for local development flows
- Route requests through the Phase 1 RAG pipeline
- Provide a future integration point for web, auth, observability and safety
  layers

## Status

In Progress - minimal local RAG API is implemented for inline JSON text and
multipart file upload.

## Local usage

Start the API server from the repository root:

```bash
npm run api:dev
```

The server listens on `PORT` or `3001` by default.

### Endpoints

#### `GET /health`

Returns a basic service health response.

#### `POST /rag/ask`

Runs the local Phase 1 RAG pipeline against inline text content or an uploaded
text/PDF file.

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

Response includes `document`, `answer`, `index`, and `devMode`.

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

## Current limits

- Multipart uploads are limited to one file and 5 MB.
- The answer is extractive and based on the top retrieved chunk.
- Retrieval uses a deterministic local lexical embedding provider.
- No auth, persistence, observability or production vector database yet.
