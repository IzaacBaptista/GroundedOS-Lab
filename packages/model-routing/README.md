# model-routing

Intelligent model selection and routing layer. Dispatches requests to the most appropriate model based on cost, latency and quality constraints.

## Responsibilities

- Route requests to local or cloud models based on configurable policies
- Implement fallback and retry logic across model providers
- Track cost and latency per model for routing decisions
- Support A/B comparisons between models

## Status

Scaffold placeholder. Model/provider comparison exists in `packages/benchmarks`
and scripts; centralized routing policies in this package are planned for later
Phase 6 hardening.
