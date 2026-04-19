# Phase 0 MVP Plan

Implementation plan to move GroundedOS Lab from architectural scaffold to a runnable and testable data foundation.

## Objective

Deliver a minimum vertical slice for ingestion that is executable locally and provides a stable base for Phase 1 (Core RAG).

## Scope

In scope:
- `packages/core` as canonical schema contract
- `packages/etl` with dispatcher and extractors for `text` + one multimodal path (`pdf`)
- local runnable command for ingestion smoke test
- minimal dataset registry example in `datasets/`
- documentation and success-criteria tracking

Out of scope:
- full RAG retrieval pipeline
- web/API apps
- model routing, agents, safety runtime
- production infra

## Milestones

### M1 — Monorepo baseline tooling

Status: complete for the initial TypeScript baseline.

Deliverables:
- npm workspace/package manager setup
- TypeScript config and package build scripts
- Vitest test framework bootstrap

Definition of done:
- `npm run build` type-checks the active TypeScript packages
- `npm test` runs the active Vitest suite

### M2 — ETL runnable vertical slice

Deliverables:
- `ingest()` stable for `text`
- `pdf` extractor implemented (first functional version)
- clear error contract for unsupported/incomplete modalities

Definition of done:
- `text` and `pdf` return `NormalizedDocument`
- extraction output includes sections + lineage
- integration tests cover dispatcher routing and extractor outputs

### M3 — Data and local execution

Status: partial — `text` smoke command is available; dataset registry is still pending.

Deliverables:
- sample dataset entry documented in `datasets/`
- `npm run ingest:smoke` local ETL smoke command
- expected output format documented in `packages/etl/README.md`

Definition of done:
- any contributor can run text ETL locally with one command
- sample input and expected shape are reproducible
- sample dataset entry is documented in `datasets/`

### M4 — Readiness for Phase 1

Deliverables:
- updated roadmap checkboxes for Phase 0
- package READMEs aligned with real implementation status
- open issues list for Phase 1 handoff

Definition of done:
- Phase 0 status is auditable by documentation + tests
- no ambiguity between “planned” and “implemented” states

## Execution order

1. Setup tooling baseline (M1)
2. Implement and test ETL vertical slice (M2)
3. Add dataset + run command (M3)
4. Documentation closure and roadmap update (M4)

## Risks and mitigations

- PDF extraction library instability
  - Mitigation: isolate adapter and keep extractor contract unchanged
- Tooling setup overhead slowing feature delivery
  - Mitigation: choose minimal stack first; expand after green baseline
- Documentation drift
  - Mitigation: require README updates in each implementation PR

## Next immediate action

Start M2 by implementing the first functional `pdf` extractor and adding integration tests for text + PDF ingestion.
