# observability

Observability and telemetry package. Instruments the entire AI pipeline for monitoring, debugging and cost analysis.

## Responsibilities

- Collect token usage, latency and error metrics per pipeline stage
- Track model usage and cost per request (showback/chargeback)
- Expose OpenTelemetry-compatible traces and spans
- Record cache hit rates and hallucination signals
- Provide hooks for external dashboards (e.g. Grafana)

## Status

Implemented baseline (Phases 2-4): per-request cost tracking, JSONL ledger
persistence, budget enforcement primitives, and an in-memory trade-off metrics
dashboard store.

## Current implementation

- `src/cost/types.ts` defines `CostEvent`, `RequestCostSummary` and `CostBudget` contracts.
- `src/cost/cost.ts` provides:
	- `CostTracker` for per-request cost accounting,
	- `CostLedger` for `.groundedos/cost/ledger.jsonl` persistence,
	- `CostBudgetEnforcer` and `BudgetExceededError` for budget checks,
	- provider-cost resolution helpers (`api-lexical`, `local-hash`, `ollama` = $0 by default).
- `src/cost/cost.test.ts` covers tracker, ledger and enforcer behavior.
- `src/tradeoffs/types.ts` defines request samples and aggregate response contracts.
- `src/tradeoffs/tradeoffs.ts` provides `TradeoffMetricsStore` for rolling-window
  provider and total aggregation (latency, cost, grounded and cache-hit rates).
- `src/tradeoffs/tradeoffs.test.ts` covers aggregation and windowing behavior.
