# infra

Infrastructure definitions for Phase 6 (Docker, Compose, CI, auth baseline).

## Responsibilities

- Define local full-stack orchestration (API, web, worker, Postgres, Redis)
- Keep environment templates synchronized (`.env.example`, `apps/*/.env.example`)
- Provide CI checks for build/test/typecheck and Docker build validation
- Document deployment and security decisions

## Phase 6 Artifacts

- `../docker-compose.yml` — local full stack
- `../Dockerfile` — API container
- `../Dockerfile.web` — web container
- `../apps/worker/Dockerfile` — worker container
- `../.github/workflows/ci.yml` — CI pipeline
- `../docs/adr/ADR-014-authentication-strategy.md` — auth strategy

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Services:

- API: `http://localhost:3001`
- Web: `http://localhost:3000`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Status

In progress (Phase 6): local stack, CI and auth baseline are active; deployment
hardening and production operations are the next milestones.
