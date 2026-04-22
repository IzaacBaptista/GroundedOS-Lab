# api

Backend API server for GroundedOS Lab. Handles all client requests and orchestrates the AI pipeline.

## Responsibilities

- Expose REST endpoints and a GraphQL API for the web and worker apps
- Route requests through the RAG pipeline and agent layer
- Manage authentication and session state
- Integrate with observability and safety packages

## Status

In Progress - minimal JSON API for local RAG is implemented.

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

Runs the local Phase 1 RAG pipeline against inline text content.

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

Request body:

| Field | Required | Description |
|---|---:|---|
| `type` | No | Currently only `"text"` is supported. Defaults to `"text"`. |
| `content` | Yes | Inline text content to ingest and retrieve against. |
| `query` | Yes | Question to ask against the ingested content. |
| `topK` | No | Number of chunks to retrieve. Defaults to `3`. |
| `title` | No | Optional document title for metadata and Dev Mode output. |
| `documentId` | No | Optional stable document ID. |
| `metadata` | No | Additional object metadata passed into ETL. |

Response includes `document`, `answer`, `index`, and `devMode`.

## Current limits

- JSON-only text input; multipart upload and PDF upload are not implemented yet.
- The answer is extractive and based on the top retrieved chunk.
- Retrieval uses a deterministic local lexical embedding provider.
- No auth, persistence, observability or production vector database yet.
