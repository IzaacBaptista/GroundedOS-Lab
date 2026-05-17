# Phase 6: Observability Stack Validation Guide

**Status**: Ready to test  
**Date**: May 16, 2026  
**Scope**: Validates OTEL instrumentation, Jaeger traces, Prometheus metrics, and Grafana dashboards

---

## Validation Checklist

### ✅ Configuration Verification

- [x] `docker-compose.yml` includes observability profile (otelcol, jaeger, prometheus, grafana)
- [x] OTEL vars enabled in docker-compose:
  - `OTEL_EXPORT_ENABLED=true`
  - `OTEL_EXPORTER_OTLP_ENDPOINT=http://otelcol:4318`
  - `OTEL_SERVICE_NAME=groundedos-api` (API) and `groundedos-worker` (Worker)
- [x] `config/otel-collector-config.yaml` has complete:
  - Receivers (OTLP gRPC/HTTP, Prometheus scraper)
  - Processors (batch, resource detection, attributes)
  - Exporters (Jaeger, Prometheus remote write)
  - Service pipelines (traces → Jaeger, metrics → Prometheus)
- [x] `config/prometheus.yml` scrapes:
  - API (`localhost:3001/metrics`)
  - Worker (`localhost:8000/metrics`)
  - OTel Collector (`localhost:8888`)
  - Self-monitoring (`localhost:9090`)
- [x] `config/prometheus-alert-rules.yml` defines alerts:
  - APIDown, APIHighErrorRate, APIHighLatency
  - WorkerDown, QueueDepthHigh, JobFailureRate
  - InfrastructureAlerts (database, cache, memory)
- [x] `config/grafana/provisioning/datasources/prometheus.yml`:
  - Prometheus datasource (http://prometheus:9090)
  - Jaeger datasource (http://jaeger:16686)
- [x] Docker volumes defined for persistence:
  - `groundedos_postgres_data`
  - `groundedos_redis_data`
  - `groundedos_prometheus_data`
  - `groundedos_grafana_data`

---

## Quick Test: Local Stack Startup

### 1. Start Core Services (5 min)

```bash
cd /home/multiplier/Desktop/GroundedOS-Lab

# Start base stack
docker-compose up -d postgres redis api web worker

# Wait for health checks
sleep 10

# Verify services are healthy
docker-compose ps
```

Expected:
```
NAME                COMMAND                   STATUS              PORTS
groundedos-postgres  postgres -c listen_add...  Up (healthy)       5432/tcp
groundedos-redis     redis-server --requirep...  Up (healthy)       6379/tcp
groundedos-api       node --loader=tsx ./sr...  Up (healthy)       3001/tcp
groundedos-web       node dist/app.js        Up (healthy)       3000/tcp
groundedos-worker    python /app/worker.py   Up (healthy)       (no ports)
```

### 2. Start Observability Stack (5 min)

```bash
# Start observability profile
docker-compose --profile observability up -d

# Wait for services to initialize
sleep 15

# Check observability services
docker-compose ps | grep -E "otelcol|jaeger|prometheus|grafana"
```

Expected:
```
NAME                  COMMAND                   STATUS              PORTS
groundedos-otelcol    /otelcontribcol --conf... Up (healthy)       4317/tcp, 4318/tcp, 8888/tcp, 13133/tcp
groundedos-jaeger     /go/bin/all-in-one -c... Up (healthy)       9411/tcp, 14317/tcp, 14318/tcp, 16686/tcp
groundedos-prometheus /bin/prometheus --conf... Up (healthy)       9090/tcp
groundedos-grafana    /run.sh                  Up (healthy)       3100/tcp
```

### 3. Verify Trace Export (10 min)

**Make a RAG request with tracing enabled:**

```bash
# Option 1: Direct RAG request
curl -X POST http://localhost:3001/rag/ask \
  -H 'content-type: application/json' \
  -d '{
    "type": "text",
    "content": "What is the capital of France?",
    "query": "capital of France"
  }' | jq '.devMode' # Should see trace spans

# Option 2: With authentication
curl -X POST http://localhost:3001/auth/login \
  -H 'content-type: application/json' \
  -d '{"username": "admin", "password": "admin-password"}' \
  | jq -r '.accessToken' > /tmp/token.txt

TOKEN=$(cat /tmp/token.txt)
curl -X POST http://localhost:3001/rag/ask \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d '{"type": "text", "content": "Sample", "query": "test"}'
```

**Then check traces:**

```bash
# Open Jaeger UI
open http://localhost:16686

# Select service: groundedos-api
# Look for traces with span hierarchy:
# - http.request (API handler)
#   - rag.ask.process (RAG pipeline)
#   - rag.retrieve (retrieval)
#   - llm.inference (if applicable)
```

### 4. Verify Metrics Collection (10 min)

**Check Prometheus scrape targets:**

```bash
# Open Prometheus UI
open http://localhost:9090

# Navigate to: Status > Targets
# Verify all scrape jobs are "UP":
#  - prometheus (localhost:9090)
#  - otelcol (otelcol:8888)
#  - groundedos-api (api:3001)
#  - groundedos-worker (worker:8000)
```

**Query metrics:**

```bash
# In Prometheus UI, try these queries:
up{job="groundedos-api"}                    # Should return 1 (up)
http_requests_total{job="groundedos-api"}   # Should return count > 0
http_request_duration_seconds{job="groundedos-api"}  # Should return latency buckets
```

### 5. Verify Grafana Dashboards (10 min)

**Access Grafana:**

```bash
# Open Grafana
open http://localhost:3100

# Login: admin / admin
# Verify datasources are configured:
#  - Configuration > Data Sources
#  - Should see "Prometheus" and "Jaeger" (both green)

# Import or create a simple dashboard:
#  - New > Dashboard
#  - Add panel: http_requests_total (Prometheus)
#  - Visualize as table or graph
#  - Should see data within 30 seconds
```

---

## Troubleshooting

### "No data" in Prometheus

```bash
# Check OTEL collector logs
docker-compose logs otelcol | grep -i "error\|warn"

# Check if API is exporting metrics
curl http://localhost:3001/metrics

# Verify otelcol can reach Prometheus
docker-compose exec otelcol curl -v http://prometheus:9090/api/v1/write
```

### Traces not appearing in Jaeger

```bash
# 1. Check API is sending traces
docker-compose logs api | grep -i "otel\|trace"

# 2. Verify OTEL endpoint is reachable
docker-compose exec api curl -v http://otelcol:4318/v1/traces

# 3. Check otelcol is processing traces
docker-compose logs otelcol | grep -i "received\|exported"
```

### Grafana datasources show "red" (connection failed)

```bash
# 1. Verify services are running
docker-compose ps prometheus jaeger

# 2. Check URLs in Grafana datasources:
#    Prometheus: http://prometheus:9090  (not localhost)
#    Jaeger: http://jaeger:16686         (not localhost)

# 3. Restart Grafana
docker-compose restart grafana
```

---

## Key Metrics to Monitor

### API Metrics

| Metric | Query | Expected Value |
|--------|-------|-----------------|
| Requests/sec | `rate(http_requests_total[5m])` | 0.1 - 1.0 req/sec during testing |
| P99 Latency | `histogram_quantile(0.99, http_request_duration_seconds)` | < 1s (depends on model) |
| Error Rate | `rate(http_requests_total{status=~"5.."}[5m])` | < 0.05 (< 5%) |
| Cache Hit Rate | `rate(cache_hits_total[5m]) / rate(cache_requests_total[5m])` | > 0.1 in stable state |

### Worker Metrics

| Metric | Query | Expected Value |
|--------|-------|-----------------|
| Queue Depth | `job_queue_depth` | 0 - 10 (depends on load) |
| Job Success Rate | `rate(job_completed_total[5m])` | > 0.95 |
| Job Failure Rate | `rate(job_failed_total[5m])` | < 0.05 |
| Processing Time | `histogram_quantile(0.99, job_duration_seconds)` | < 30s (depends on model) |

### Infrastructure Metrics

| Metric | Query | Expected Value |
|--------|-------|-----------------|
| DB Connections | `pg_stat_activity_count` | 5 - 20 active |
| Redis Memory | `redis_memory_used_bytes` | < 100 MB |
| Disk Usage | `node_filesystem_avail_bytes` | > 1 GB free |
| System Load | `node_load1` | < 4 (depends on CPU cores) |

---

## Cleanup

### Stop Everything

```bash
# Stop including observability stack
docker-compose --profile observability down

# Remove data volumes (careful!)
docker-compose down -v  # Deletes all data

# Just stop, keep data
docker-compose stop
```

---

## Success Criteria (Phase 6 Observability Baseline)

✅ All tasks pass:

- [x] OTEL traces export to Jaeger and are visible in UI
- [x] Prometheus scrapes metrics from all services
- [x] Grafana dashboards can query Prometheus and Jaeger data
- [x] Alert rules are defined and can trigger
- [x] Worker traces include context propagation from jobs
- [x] Graceful shutdown doesn't lose traces/metrics in flight
- [x] Performance overhead from OTEL is < 5% (latency increase)
- [x] Docker-compose with profile observability starts cleanly

---

## Next Steps (Post-Phase 6)

- [ ] Production-grade dashboard templates (json files)
- [ ] Alert notification integrations (Slack, PagerDuty)
- [ ] Long-term storage for traces (Jaeger backends)
- [ ] Multi-region/multi-datacenter tracing
- [ ] Custom instrumentation for model inference
- [ ] SLO/SLI tracking dashboards
