# worker

Background worker responsible for asynchronous and compute-intensive AI tasks. Runs ML pipelines independently from the API server.

## Responsibilities

- Process document ingestion and ETL jobs
- Run embedding generation and indexing pipelines
- Execute fine-tuning and experiment jobs
- Handle queue-based task consumption (e.g. BullMQ / Redis)

## Status

In progress (Phase 6 scaffold). Docker image, Python entrypoint and dependency
baseline are in place; queue-backed job execution is the next step.

## Local usage

From the repository root:

```bash
# Start API first
npm run api:dev

# Start worker in another terminal
npm run api:jobs:worker
```

When Redis is configured, async jobs submitted to `/jobs/*` are consumed by the
worker process.

Canonical operational examples live in
[`docs/operational-runbook.md`](../../docs/operational-runbook.md).

## Current limits

- Queue processing is still a baseline slice; advanced retry policy and dead-letter handling are pending.
- Multi-worker coordination and queue observability dashboards are not complete.
- Production hardening (resource isolation, autoscaling, deployment profiles) is tracked under Phase 6+.

## Next milestones

1. Stabilize queue consumers for `phase5` and model benchmark jobs.
2. Add retry/backoff, failure classification and dead-letter queue handling.
3. Expose worker health and queue depth telemetry in the observability stack.
