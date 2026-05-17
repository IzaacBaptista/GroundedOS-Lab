# Prometheus + Grafana Setup Guide

## Quick Start

### 1. Start the Observability Stack

```bash
cd /path/to/GroundedOS-Lab

# Start with observability profile (includes Prometheus, Grafana, Jaeger, OTelCol)
docker-compose --profile observability up -d
```

### 2. Access the Dashboards

**Prometheus (metrics scraper & query engine):**
- URL: http://localhost:9090
- Metrics: `/metrics` endpoint at http://localhost:9090/api/v1/query

**Grafana (visualization):**
- URL: http://localhost:3100
- Default credentials: admin / admin (change on first login)
- Queue Dashboard: Already imported and available

**Jaeger (distributed tracing):**
- URL: http://localhost:16686

## Queue Metrics Available

### Counters (Total Counts)
- `queue_jobs_succeeded_total` - Total successful jobs
- `queue_jobs_failed_total` - Total failed jobs
- `queue_jobs_retrying_total` - Total retried jobs
- `queue_jobs_dlq_total` - Total jobs in DLQ
- `queue_attempts_total` - Total attempts made

### Gauges (Point-in-Time Values)
- `queue_duration_ms_average` - Average job duration in milliseconds
- `queue_duration_ms_p95` - 95th percentile job duration

## Dashboard: GroundedOS Queue Hardening

The dashboard shows:
1. **Jobs Succeeded Rate (5m)** - Rate of successful jobs
2. **Jobs Failed Rate (5m)** - Rate of failed jobs
3. **Average Job Duration** - Historical average duration
4. **P95 Job Duration** - 95th percentile latency
5. **Jobs in DLQ** - Current DLQ depth by job type
6. **Total Attempts Rate** - Rate of all attempts (successes + retries)

### Import Dashboard

If the dashboard is not auto-imported:

1. Open Grafana: http://localhost:3100
2. Click "+" → "Import"
3. Upload: `config/grafana/groundedos-queue-hardening-dashboard.json`
4. Select Prometheus as the data source

## Alerts

The following alerts are configured in Prometheus:

### Queue Hardening Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| DLQAccumulation | DLQ count > 10 | Warning | Check for job failures, inspect DLQ via API |
| LowJobSuccessRate | Success rate < 95% | Warning | Investigate failed jobs, check worker logs |
| HighJobDurationP95 | P95 duration > 5000ms | Warning | Profile job execution, check resource usage |
| HighRetryRate | Retry rate > 20% | Warning | Check backoff policy, investigate transient failures |

## API Endpoints for Queue Monitoring

### View Metrics (JSON)
```bash
curl -s http://localhost:3001/jobs/metrics | jq
```

### View Metrics (Prometheus Format)
```bash
curl -s "http://localhost:3001/jobs/metrics?format=prometheus"
```

### List DLQ Entries
```bash
curl -s http://localhost:3001/jobs/dlq/list | jq
```

### Get Specific DLQ Entry
```bash
curl -s http://localhost:3001/jobs/dlq/entry/dlq:job-123 | jq
```

### Inspect Re-drive History
```bash
curl -s "http://localhost:3001/jobs/dlq/history?limit=10&offset=0" | jq
```

### Get Re-drive History by Job Type
```bash
curl -s http://localhost:3001/jobs/dlq/history/phase5-experiment | jq
```

## DLQ Re-drive Operations

### Dry-run (Validate without Action)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}' \
  http://localhost:3001/jobs/dlq/dlq:job-123/redrive | jq
```

### Real Re-drive (Actual Re-enqueue)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}' \
  http://localhost:3001/jobs/dlq/dlq:job-123/redrive | jq
```

## Prometheus Queries

### Success Rate (Last 5 Minutes)
```promql
(
  sum(rate(queue_jobs_succeeded_total[5m]))
  /
  (sum(rate(queue_jobs_succeeded_total[5m])) + sum(rate(queue_jobs_failed_total[5m])))
) * 100
```

### DLQ Accumulation Over Time
```promql
queue_jobs_dlq_total
```

### Average Job Duration Trend
```promql
avg(queue_duration_ms_average)
```

### P95 Duration Spike Detection
```promql
queue_duration_ms_p95 > 5000
```

## Troubleshooting

### Prometheus not scraping metrics
- Check: http://localhost:9090/targets
- Verify API is running: `curl http://localhost:3001/jobs/metrics`
- Check docker-compose logs: `docker logs groundedos-prometheus`

### Grafana can't connect to Prometheus
- Verify Prometheus is healthy: http://localhost:9090/-/healthy
- Check Grafana data source: Settings → Data Sources → Prometheus
- Test connection in Grafana

### Metrics not showing in dashboard
- Ensure API is producing jobs (POST /jobs/phase5 or /jobs/model-benchmark)
- Wait 15-30 seconds for Prometheus scrape (default interval: 15s)
- Check API logs: `docker logs groundedos-api`

## Stop Observability Stack
```bash
docker-compose --profile observability down
```

## Notes

- Prometheus retention: 15 days (default)
- Grafana auto-provisioning: Dashboard imported on startup if present
- Metrics endpoint: Rate-limited at 1 request/sec per client
- DLQ re-drive: Audited and correlated with user info from request
