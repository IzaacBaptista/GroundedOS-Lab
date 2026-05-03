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

Implemented baseline through Phase 5 with ongoing Phase 6 integration work: the
web app exposes local RAG upload/index/ask flows, provider selection, optional
session-aware asks, concept and lab surfaces, and the Trade-offs dashboard. The
backend auth baseline exists, but the full interactive login UX is still being
finished.

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

- Local-development UI is primary; production deployment hardening is tracked in
  Phase 6.
- The backend can enforce JWT/session auth, but the default local web flow still
  assumes `AUTH_ENFORCEMENT=false` unless you wire tokens/cookies manually.
- Persisted indexes are local JSON files managed by the API under
  `.groundedos/indexes/`.
- Session memory is managed by the API under `.groundedos/memory/` when
  `sessionId` is supplied.
- Answers remain extractive and deterministic, matching the local API.
- The `ollama` provider requires a running local Ollama server and an embedding
  model configured in the API environment.
