# ADR-010 — Trade-off metrics dashboard

**Status:** Accepted

## Context

Phase 2 now includes workflow tracing, semantic cache and cost governance, but there was no single runtime view to compare providers across latency, cost and quality indicators. Teams needed a lightweight local dashboard to guide iterative tuning.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Build dashboard from raw request logs in web only | No API changes | Duplicate aggregation logic in client, expensive for larger logs |
| Aggregate metrics in API memory and expose summary endpoint | Fast reads, simple UI, single source of aggregation logic | Metrics reset on API restart |
| Persist full observability stack now (OTel + TSDB + Grafana) | Production-grade architecture | Too heavy for current local-first Phase 2 scope |

## Decision

Choose **API-side in-memory aggregation with a summary endpoint**. Implement `TradeoffMetricsStore` in `packages/observability`, record one sample per successful ask in `apps/api/src/rag-service.ts`, expose `GET /rag/metrics/tradeoffs`, and render it in a dedicated web tab.

## Consequences

- Enables quick provider comparison using stable metrics (`avgLatencyMs`, `p95LatencyMs`, `avgCostUsd`, `groundedRate`, `cacheHitRate`).
- Keeps implementation local-first and low-operational overhead for MVP.
- Metrics are ephemeral across restarts; persistent observability remains a future phase.
