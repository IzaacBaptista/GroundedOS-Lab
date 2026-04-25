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
- Show a Trade-offs dashboard tab with rolling request/provider metrics
- Support optional session IDs for persistent conversation memory continuity

## Status

In Progress - local RAG upload and persisted-index surface is implemented,
including provider selection for new indexes, optional session memory-aware
asks, provider comparison, and a local Trade-offs metrics tab backed by API
aggregates.

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
Reference environment values live in
[`apps/web/.env.example`](./.env.example). The Vite config also loads
repository-root `.env`/`.env.local` files before app-specific env files.

## Current limits

- Local-development server only; no production build pipeline yet.
- No authentication or saved question history.
- Persisted indexes are local JSON files managed by the API under
  `.groundedos/indexes/`.
- Session memory is managed by the API under `.groundedos/memory/` when
  `sessionId` is supplied.
- Answers remain extractive and deterministic, matching the local API.
- The `ollama` provider requires a running local Ollama server and an embedding
  model configured in the API environment.
