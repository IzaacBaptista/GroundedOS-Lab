# ADR-013: Cost Tracking Strategy
## Status
Accepted

## Context
GroundedOS already measures request quality and retrieval internals, but cost remained implicit. As new providers and richer workflows are introduced, we need request-level cost attribution and configurable budget controls.

## Decision
Implement a local-first cost governance layer in `packages/observability` with:
- stage-level `CostEvent` tracking,
- `RequestCostSummary` aggregation,
- JSONL ledger persistence (`.groundedos/cost/ledger.jsonl`),
- budget checks via `CostBudgetEnforcer`.

Provider defaults in Phase 2 treat local providers (`api-lexical`, `local-hash`, `ollama`) as zero-cost. Cloud provider costs are configured via environment variables.

## Consequences
- Each request can expose a cost breakdown in Dev Mode.
- Budget policy can block requests that exceed configured limits.
- JSONL ledger is simple and local-first, but not ideal for high-concurrency analytics.

## Alternatives considered
- **No budget enforcement:** observability only, but no governance.
- **Database-first ledger:** stronger querying, but unnecessary infra overhead for Phase 2.
- **External billing integration now:** premature for local learning-lab scope.
