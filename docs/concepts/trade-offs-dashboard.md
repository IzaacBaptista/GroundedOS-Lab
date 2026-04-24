# Trade-offs Dashboard
> Runtime dashboard that makes latency, cost, grounding and cache behavior visible per provider.

## Why it matters
Retrieval quality work needs fast feedback loops. A trade-offs dashboard turns request telemetry into operational signals so teams can compare providers and tune for the right balance between quality, speed and cost.

## How it works in GroundedOS Lab
- `TradeoffMetricsStore` in `packages/observability` records per-request samples.
- `apps/api/src/rag-service.ts` records a sample after successful local and persisted RAG asks.
- `GET /rag/metrics/tradeoffs` exposes aggregate metrics and recent requests.
- `apps/web/src/App.tsx` renders a Trade-offs tab with totals and provider breakdown.

## Where it lives in the code
- `packages/observability/src/tradeoffs/types.ts`
- `packages/observability/src/tradeoffs/tradeoffs.ts`
- `apps/api/src/rag-service.ts`
- `apps/api/src/rag/rag-metrics/rag-metrics.controller.ts`
- `apps/web/src/App.tsx`

## Observable experiment
1. Execute multiple asks using different embedding providers (`api-lexical`, `local-hash`, `ollama`).
2. Open the Trade-offs tab in the web app.
3. Compare `avgLatencyMs`, `p95LatencyMs`, `groundedRate` and `cacheHitRate` by provider.
4. Validate whether the chosen provider matches the target operating profile.

## Related concepts
- [Observability](./observability.md)
- [Cost Governance](./cost-governance.md)
- [Inference Trade-offs](./inference-trade-offs.md)

## Further reading
- [ADR-010 Trade-off Metrics Dashboard](../adr/ADR-010-tradeoff-metrics-dashboard.md)
