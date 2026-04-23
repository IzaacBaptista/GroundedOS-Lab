# web

Frontend application for GroundedOS Lab. Provides the local interface for
grounded retrieval workflows.

## Responsibilities

- Accept inline text or local text/PDF file input
- Index documents through the local API and ask against the active persisted index
- List, select, refresh and delete persisted local indexes
- Select the local embedding provider for new inline/upload requests
- Display grounded answers, citations and retrieved chunks
- Expose the raw Dev Mode JSON returned by the API

## Status

In Progress - Phase 1 local RAG upload and persisted-index surface is
implemented, including provider selection for new indexes and ephemeral asks.

## Local usage

Start the API server from the repository root:

```bash
npm run api:dev
```

In another terminal, start the web server:

```bash
npm run web:dev
```

The web server listens on `PORT` or `3000` by default and proxies `/api/*` to
`API_BASE_URL` or `http://localhost:3001`.

## Current limits

- Local-development server only; no production build pipeline yet.
- No authentication or saved question history.
- Persisted indexes are local JSON files managed by the API under
  `.groundedos/indexes/`.
- Answers remain extractive and deterministic, matching the Phase 1 API.
