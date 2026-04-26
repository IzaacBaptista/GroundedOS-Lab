# model-routing

Intelligent model routing and selection layer.

## Responsibilities

- Analyze query features (length, intent, ambiguity, reasoning demand)
- Select model/provider based on latency-cost-quality trade-offs
- Produce inspectable routing decisions with confidence and alternatives

## Status

Implemented with deterministic heuristics suitable for local-first experimentation.
Decisions are exposed in API Dev Mode as `routing` metadata.
