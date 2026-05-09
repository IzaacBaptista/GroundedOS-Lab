# Architecture Decision Records (ADRs)

This folder documents significant architectural and technology decisions made in GroundedOS Lab. Each record captures the context, the options considered and the rationale behind the choice, so contributors can understand *why* the system is built the way it is.

## When to write an ADR

Write an ADR whenever a decision:

- Is hard to reverse (framework choice, communication protocol, data schema)
- Has meaningful trade-offs between at least two real alternatives
- Will confuse future contributors if the reasoning is not documented

You do **not** need an ADR for obvious or easily-reversible choices (e.g. adding a utility function, picking a package version that has no alternatives).

## Status

In progress (Phase 6 documentation rollout): ADR index is active and reflects
accepted decisions through the current implementation baseline.

## ADR template

```markdown
# ADR-NNN — <Title>

**Status:** Proposed | Accepted | Superseded by ADR-NNN

## Context

<What is the problem or need that led to this decision?>

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Option A | ... | ... |
| Option B | ... | ... |

## Decision

<Which option was chosen and why.>

## Consequences

<What changes as a result? What are the known costs or risks?>
```

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-001](./ADR-001-backend-framework.md) | Backend framework: Fastify | Accepted |
| [ADR-002](./ADR-002-vector-database.md) | Vector database: pgvector → Qdrant migration path | Accepted |
| [ADR-003](./ADR-003-api-worker-communication.md) | API → Worker communication via BullMQ / Redis | Accepted |
| [ADR-004](./ADR-004-monorepo-tooling.md) | Monorepo tooling: npm workspaces + Vitest | Accepted |
| [ADR-005](./ADR-005-provider-contracts.md) | Minimal provider contracts before broad package extraction | Accepted |
| [ADR-006](./ADR-006-query-understanding-strategy.md) | Query understanding strategy: deterministic pre-retrieval layer | Accepted |
| [ADR-007](./ADR-007-runtime-validation-strategy.md) | Runtime validation strategy: schema-first contracts | Accepted |
| [ADR-008](./ADR-008-workflow-engine-design.md) | Workflow engine design: lightweight step runner | Accepted |
| [ADR-009](./ADR-009-semantic-cache-design.md) | Semantic cache design: in-memory cosine similarity cache | Accepted |
| [ADR-010](./ADR-010-tradeoff-metrics-dashboard.md) | Trade-off metrics dashboard: in-memory aggregation with API summary endpoint | Accepted |
| [ADR-011](./ADR-011-session-memory-persistence.md) | Session memory persistence: file-backed per-session memory store | Accepted |
| [ADR-012](./ADR-012-distributed-observability.md) | Distributed observability: OpenTelemetry, trace propagation, and dashboards | Accepted |
| [ADR-013](./ADR-013-cost-tracking-strategy.md) | Cost tracking strategy: request-level accounting and budget enforcement | Accepted |
| [ADR-014](./ADR-014-authentication-strategy.md) | Authentication strategy: JWT + session cookies with resource scoping | Accepted |
