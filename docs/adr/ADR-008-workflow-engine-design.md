# ADR-008: Workflow Engine Design
## Status
Accepted

## Context
RAG ask execution was an implicit function chain. This made per-step tracing and consistent failure semantics difficult, especially as more stages (query understanding, memory, cache, cost) are added.

## Decision
Introduce a lightweight custom `WorkflowRunner` in `packages/core` for Phase 2. It executes named steps sequentially, tracks status/duration, stops on first failure, and returns `WorkflowContext` for Dev Mode.

## Consequences
- Every request exposes explicit step traces and timings.
- Pipeline behavior is easier to debug and benchmark.
- No durable state/retry support yet; durable orchestration remains a future migration.

## Alternatives considered
- **Keep implicit chain:** lowest effort, poor observability.
- **XState:** strong state modeling, but heavier integration for Phase 2 scope.
- **Temporal:** durable orchestration, but infrastructure overhead is premature.
