# Queue Hardening Guide

This document describes the Phase 6 Queue Hardening baseline for GroundedOS Lab.

## Scope

Implemented in this phase:

- Retry policy per job type
- Backoff strategy abstraction (fixed and exponential)
- Dead-letter queue envelope for exhausted jobs
- Queue metrics per queueName and jobType
- Correlation IDs propagation
- Structured lifecycle logs

Out of scope in this phase:

- Qdrant
- Multi-tenant isolation
- Structured outputs
- Deterministic replay
- Drift detection
- Confidence calibration

## Policies per Job Type

Policies are centralized in:

- API: apps/api/src/jobs/queue-policy.ts
- Worker: apps/worker/retry_policy.py

Default policies:

- phase5-experiment: maxAttempts=5, exponential, delayMs=2000
- model-benchmark: maxAttempts=4, fixed, delayMs=3000

## Retry and Backoff

Both backoff modes are supported:

- fixed: constant delay for every retry
- exponential: delay * 2^(attempt-1)

API producer applies policy at enqueue time and avoids hardcoded retry rules in service methods.
Worker fallback polling uses the same policy abstraction.

## Dead-letter Queue (DLQ)

Queue name:

- groundedos-phase6-jobs-dlq

When attempts are exhausted, jobs are moved to DLQ with a persisted envelope containing:

- original payload
- jobType
- queueName
- attempts and maxAttempts
- createdAt and failedAt
- error
- correlation IDs

Envelope shape is defined in apps/api/src/jobs/job-queue.ts and mirrored by worker behavior.

## Queue Metrics

API exposes queue metrics via:

- GET /jobs/metrics

Metrics include per queueName/jobType:

- jobsSucceeded
- jobsErrored
- jobsRetrying
- jobsDlq
- totalAttempts
- averageDurationMs
- p95DurationMs
- lastFailure

Current implementation keeps an in-process rolling snapshot for duration samples.

## Correlation IDs

Supported optional fields in job payload:

- requestId
- jobId
- sessionId
- tenantId
- userId
- indexId

Controller accepts these values in request body and also infers userId from auth context when available.

## Structured Logs

Lifecycle events emitted:

- job_created
- job_started
- job_completed
- job_failed
- job_retry
- job_dlq

API logging helper: apps/api/src/jobs/queue-logging.ts
Worker logging helper: apps/worker/structured_logging.py

## Known Limitations

- Metrics snapshot is process-local and reset on API restart.
- BullMQ Python path emits structured retry/failure logs but DLQ movement is guaranteed by fallback polling path and API observer path.
- p95 is computed from a rolling in-memory sample, not a persisted histogram.

## Recommended Next Steps

1. Export queue metrics to Prometheus native histogram/counter series.
2. Add DLQ inspection/re-drive endpoints for operational workflows.
3. Persist queue metrics in a shared backend for multi-instance aggregation.
4. Add explicit chaos tests for Redis failover and worker restarts.
