# Architecture Decision Records (ADRs)

This folder documents significant architectural and technology decisions made in GroundedOS Lab. Each record captures the context, the options considered and the rationale behind the choice, so contributors can understand *why* the system is built the way it is.

## When to write an ADR

Write an ADR whenever a decision:

- Is hard to reverse (framework choice, communication protocol, data schema)
- Has meaningful trade-offs between at least two real alternatives
- Will confuse future contributors if the reasoning is not documented

You do **not** need an ADR for obvious or easily-reversible choices (e.g. adding a utility function, picking a package version that has no alternatives).

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
| [ADR-005](./ADR-005-provider-contracts.md) | Minimal provider contracts before package extraction | Accepted |
