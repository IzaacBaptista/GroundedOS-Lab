# ADR-003 — API → Worker communication via BullMQ / Redis

**Status:** Accepted

## Context

GroundedOS Lab separates the API server (Node.js / Fastify) from compute-intensive ML workers (Python). This boundary requires a well-defined communication protocol. Without one, each feature that crosses the boundary will invent its own pattern and the system becomes impossible to reason about.

Three options were considered.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **BullMQ / Redis queue** | Battle-tested for async job processing, retry and backoff built-in, job visibility and monitoring (Bull Board), language-agnostic (Node producer, Python consumer), already in the planned stack | Requires a running Redis instance; adds operational complexity vs pure HTTP |
| **HTTP (internal)** | Simplest to implement, no extra service, standard tooling on both sides | Synchronous by default, tight coupling between API and worker availability, harder to scale workers independently, no built-in retry |
| **gRPC / RPC** | Strongly typed contract, efficient binary serialisation, good for high-throughput internal calls | More complex setup, code generation required, higher learning curve for contributors |

## Decision

**BullMQ (Node.js producer) + Redis + Python worker consumer.**

The queue model is the right fit because:

1. ML tasks (embedding generation, ETL, fine-tuning runs) are inherently async and can be long-running — a synchronous HTTP call from the API would block or time out.
2. BullMQ provides job retry, priority, and delay without custom infrastructure.
3. Redis is already in the planned stack for caching; reusing it for the queue avoids an extra service.

### Interface contract

The Node.js API publishes jobs using BullMQ `Queue`. Python workers consume jobs using either:

- The `bullmq` Python package (preferred when available), or
- A thin HTTP polling adapter that calls the BullMQ REST API via Bull Board's internal routes (acceptable for early phases).

Every job payload must conform to a TypeScript type defined in `packages/core` and a matching Pydantic model in the Python worker. Both definitions are the source of truth for the job schema — changes to either require updating the other.

### Job naming convention

Jobs use dot-separated namespaces: `<domain>.<action>` (e.g. `etl.ingest`, `embeddings.generate`, `experiment.run`).

## Consequences

- Redis is a required service from Phase 2 onward (or Phase 6 infra slice when Docker Compose is added).
- The `apps/worker/` app owns the Python consumer implementation.
- `packages/core` exports job payload types; the Python worker imports the matching Pydantic models from a generated or hand-maintained `core_types.py`.
- Direct HTTP calls from the API to Python workers are explicitly disallowed — all cross-boundary calls go through the queue.
