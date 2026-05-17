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

## Formal job envelope contract

Every message placed on the queue must conform to the following envelope. The TypeScript definition lives in `apps/api/src/jobs/job-queue.ts`; the Python equivalent lives in `apps/worker/job_types.py`.

```
{
  // Discriminator — dot-namespaced, e.g. "phase5-experiment", "model-benchmark"
  "type": string,

  // Opaque job-specific data (see per-job schemas below)
  ...jobSpecificFields,

  // Optional — W3C traceparent string for OTel context propagation (see ADR-012)
  "_otel_context"?: string
}
```

### State machine

```
queued ──► active ──► completed
                 └──► failed (attempt < maxAttempts) ──► delayed ──► active (retry)
                 └──► failed (attempt == maxAttempts) ──► dead-letter queue (DLQ)
```

- **Retry policy**: exponential backoff, base 2 s, max 5 attempts, jitter ± 500 ms.
- **DLQ**: jobs exhausting all attempts are moved to `groundedos-phase6-jobs-dlq` (a separate BullMQ queue). The API exposes `/jobs/:id` which reflects `failed` status with `failedReason`.
- **Idempotency**: the Python worker must check whether a job has already been processed (by `jobId`) before performing side effects. Duplicate delivery can occur after a worker crash mid-ack.
- **Ack/fail semantics**: the Python consumer must call `job.moveToCompleted` (or equivalent) only after all side effects are durable. On any unhandled exception it must call `job.moveToFailed` so BullMQ schedules a retry.

Queue hardening baseline updates:

- Retry policy is now resolved per job type via centralized policy modules in API and worker.
- Backoff strategy supports both fixed and exponential modes.
- DLQ entries preserve an envelope with original payload, job metadata, attempts and failure reason for future triage/re-drive.
- Correlation IDs (`requestId`, `jobId`, `sessionId`, `tenantId`, `userId`, `indexId`) are propagated when available.
- Lifecycle events are logged in structured format and queue metrics are exposed through `GET /jobs/metrics`.

### Status reporting back to the API

The Python worker updates job progress via the BullMQ `updateProgress` API. The API's `GET /jobs/:id` endpoint reads state directly from Redis via BullMQ's `getJob` + `getState` so no additional HTTP callback is required.

### Per-job schemas

| Job type | Key fields | Worker action |
|---|---|---|
| `phase5-experiment` | `track: "quantization" \| "lora" \| "fine-tuning" \| "distillation"` | Run the matching experiment script |
| `model-benchmark` | `providers: string[]` | Run model benchmark for each provider |

## Consequences

- Redis is a required service from Phase 2 onward (or Phase 6 infra slice when Docker Compose is added).
- The `apps/worker/` app owns the Python consumer implementation.
- `apps/worker/job_types.py` contains Pydantic models mirroring the TypeScript payload types; changes to either require updating both.
- Direct HTTP calls from the API to Python workers are explicitly disallowed — all cross-boundary calls go through the queue.
- The DLQ queue name `groundedos-phase6-jobs-dlq` is a stable contract; consumers must not rename it without a coordinated migration.
- See ADR-012 for the `_otel_context` field and trace propagation protocol.
