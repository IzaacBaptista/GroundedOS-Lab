# ADR-006: Query Understanding Strategy
## Status
Accepted

## Context
The Phase 1 retrieval path receives raw user text directly. This limits retrieval quality for lexical providers and gives no explicit intent signal for future ranking/prompting policies.

## Decision
Adopt a deterministic, rule-based Query Understanding layer in Phase 2 with three steps:
1. query rewriting,
2. query expansion,
3. intent detection.

The layer runs before retrieval and emits a `ProcessedQuery` attached to Dev Mode output.

## Consequences
- Retrieval quality improves without introducing LLM dependency.
- Query behavior is reproducible and straightforward to test.
- Some nuanced rewrites are out-of-scope until an LLM-based strategy in Phase 3.

## Alternatives considered
- **Direct raw query retrieval:** simplest, but misses quality gains.
- **LLM-based rewrite now:** more expressive, but adds cost/latency and non-determinism too early.
