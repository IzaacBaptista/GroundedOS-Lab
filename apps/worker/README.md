# worker

Background worker responsible for asynchronous and compute-intensive AI tasks. Runs ML pipelines independently from the API server.

## Responsibilities

- Process document ingestion and ETL jobs
- Run embedding generation and indexing pipelines
- Execute fine-tuning and experiment jobs
- Handle queue-based task consumption (e.g. BullMQ / Redis)

## Local Usage

From the repository root:

```bash
# Start API first
npm run api:dev

# Start worker in another terminal
npm run api:jobs:worker
```

When Redis is configured, async jobs submitted to `/jobs/*` are consumed by the
worker process.

**Monitoring:**
- Queue metrics are exposed via API at `GET /jobs/metrics` (JSON) or `?format=prometheus`
- Start observability stack: `docker compose --profile observability up -d`
- Access Prometheus at http://localhost:9090
- Access Grafana at http://localhost:3100

For operational examples and troubleshooting, see:
- [`docs/operational-runbook.md`](../../docs/operational-runbook.md)
- [`docs/prometheus-grafana-setup.md`](../../docs/prometheus-grafana-setup.md)

## Current Status (Phase 6)

✅ **Implemented:**
- Queue hardening baseline with centralized retry policy per job type (phase5-experiment: 5 attempts exponential 2000ms, model-benchmark: 4 attempts fixed 3000ms)
- Fixed/exponential backoff strategies
- DLQ envelope with full metadata preservation (payload, error, correlation IDs, timestamps, attempt count)
- Structured lifecycle event logging (job_created, job_started, job_completed, job_failed, job_retry, job_dlq)
- Correlation ID propagation (requestId, jobId, sessionId, tenantId, userId, indexId)
- Prometheus-compatible metrics export per queue/job-type (success rate, failure rate, retry rate, DLQ depth, duration percentiles)

✅ **Operational Features:**
- DLQ re-drive endpoints with audit trail (user tracking, timestamps, status)
- Re-drive history & filtering by job type
- Dry-run validation before re-drive
- Metrics available in JSON and OpenMetrics (Prometheus) formats

🟡 **Partial / Not Yet:**
- Multi-worker coordination and distributed locking (single-worker baseline works)
- E2E chaos testing with fault injection
- Redis DLQ persistence (currently in-process memory)
- Custom metrics export to Prometheus scraper (endpoint ready, integration via `/metrics?format=prometheus`)

## Next Milestones

1. ✅ Queue hardening baseline (COMPLETED)
2. ✅ Prometheus metrics & Grafana dashboard (COMPLETED)
3. ✅ DLQ re-drive executor & audit trail (COMPLETED)
4. 🔄 Redis persistence for DLQ store (in-memory sufficient for now)
5. 🔄 Multi-worker distributed coordination
6. 🔄 Production hardening (resource isolation, autoscaling, deployment profiles)

