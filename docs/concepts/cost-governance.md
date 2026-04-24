# Cost Governance
> Per-request and daily budget governance for AI pipeline execution.

## Why it matters
Cost observability without enforcement is incomplete. Cost governance turns measurements into operational policy: how much each request can spend, when to alert, and when to block expensive paths.

## How it works in GroundedOS Lab
- `packages/observability/src/cost/types.ts` defines the cost contracts.
- `CostTracker` records stage-level events (`embedding-index`, `embedding-query`, `retrieval`, `llm-inference`, `reranking`).
- `CostLedger` appends request summaries to `.groundedos/cost/ledger.jsonl`.
- `CostBudgetEnforcer` validates projected spend against per-request and daily limits.
- `apps/api/src/rag-service.ts` integrates cost tracking in the workflow and emits `devMode.cost`.

## Where it lives in the code
- `packages/observability/src/cost/types.ts`
- `packages/observability/src/cost/cost.ts`
- `packages/observability/src/cost/cost.test.ts`
- `apps/api/src/rag-service.ts`

## Observable experiment
1. Set a strict budget, for example `GROUNDEDOS_COST_PER_REQUEST_LIMIT_USD`.
2. Run a RAG ask request.
3. Inspect `devMode.cost.breakdown` and `devMode.cost.totalCostUsd`.
4. Lower the budget below projected spend to observe budget rejection.

## Related concepts
- [Observability](./observability.md)
- [Inference Trade-offs](./inference-trade-offs.md)
- [Semantic Caching](./semantic-caching.md)

## Further reading
- [ADR-013 Cost Tracking Strategy](../adr/ADR-013-cost-tracking-strategy.md)
