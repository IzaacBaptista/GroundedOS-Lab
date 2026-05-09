# model-routing

Intelligent model routing and selection layer.

## Responsibilities

- Analyze query features (length, intent, ambiguity, reasoning demand)
- Select model/provider based on latency-cost-quality trade-offs
- Produce inspectable routing decisions with confidence and alternatives

## Status

Complete (local-first baseline): deterministic routing heuristics are active
for experimentation.
Decisions are exposed in API Dev Mode as `routing` metadata.
