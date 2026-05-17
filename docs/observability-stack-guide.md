# Observability Stack Setup Guide

This guide covers the Docker Compose observability stack for GroundedOS Lab, which includes OpenTelemetry Collector, Jaeger, Prometheus, and Grafana.

## Quick Start

### Starting the Observability Stack

```bash
# Start observability services (otelcol, jaeger, prometheus, grafana)
docker-compose --profile observability up -d

# View logs
docker-compose logs -f otelcol jaeger prometheus grafana
```

### Accessing the Services

- **Jaeger UI**: http://localhost:16686
- **Prometheus UI**: http://localhost:9090
- **Grafana UI**: http://localhost:3100
  - Default credentials: admin/admin

## Architecture

```

## Long-term local trace retention

In addition to OTEL exporters, API structured traces are retained locally in versioned JSONL files:

- `.groundedos/observability/traces.jsonl`
- `.groundedos/observability/metrics-history.jsonl`

Useful endpoints for regression/debug flows:

- `GET /rag/metrics/traces?limit=100`
- `GET /rag/metrics/observability?limit=500`
┌─────────────────────────────────────────────────────┐
│  GroundedOS Lab Services                             │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │  API (Node.js)                               │   │
│  │  - Exports traces via @opentelemetry/sdk-node
│  │  - Emits metrics via prom client              │   │
│  └──────────────────────────────────────────────┘   │
│                      │                              │
│  ┌──────────────────────────────────────────────┐   │
│  │  Worker (Python)                             │   │
│  │  - Exports traces via opentelemetry-sdk     │   │
│  │  - Emits metrics via opentelemetry.metrics   │   │
│  └──────────────────────────────────────────────┘   │
│                      │                              │
└──────────────────────┼──────────────────────────────┘
                       │ OTLP gRPC/HTTP (traces)
                       │ HTTP (metrics)
                       ▼
        ┌────────────────────────────────┐
        │  OpenTelemetry Collector       │
        │  (4317 gRPC, 4318 HTTP,        │
        │   8888 metrics)                │
        └────────┬───────────┬───────────┘
                 │           │
        ┌────────▼┐   ┌──────▼────────┐
        │ Jaeger  │   │ Prometheus    │
        │ (16686) │   │ (9090)        │
        └────┬────┘   └────┬──────────┘
             │             │
        ┌────▼─────────────▼────┐
        │  Grafana (3100)       │
        │  - Visualize traces   │
        │  - Dashboard metrics  │
        └──────────────────────┘
```

## Configuration Files

### OpenTelemetry Collector (`config/otel-collector-config.yaml`)
Defines:
- **Receivers**: OTLP gRPC (4317) and HTTP (4318) for traces; Prometheus scraper for metrics
- **Processors**: Batch processing, attribute enrichment, resource detection
- **Exporters**: Jaeger for traces, Prometheus remote write for metrics

### Prometheus (`config/prometheus.yml`)
Defines:
- **Scrape jobs**: API, worker, Jaeger, PostgreSQL, Redis (optional)
- **Scrape intervals**: 15s for services, 30s for exporters
- **Alert rules**: Defined in `config/prometheus-alert-rules.yml`

### Alert Rules (`config/prometheus-alert-rules.yml`)
Pre-configured alerts for:
- **API**: Down, high error rate, high latency
- **Worker**: Down, queue depth, job failure rate
- **Infrastructure**: Database, cache, memory, disk

### Grafana (`config/grafana/provisioning/`)
Auto-provisions:
- **Datasources**: Prometheus and Jaeger
- **Dashboards**: Ready for custom dashboard JSON files (place in `provisioning/dashboards/`)

## Enabling Observability in Code

### API (Node.js)

The API is already instrumented with OpenTelemetry:
```typescript
// apps/api/src/otel.ts
import { configureOtel } from "./otel";
configureOtel(); // Initializes SDK at startup
```

To enable trace export, set environment variables:
```bash
export OTEL_EXPORT_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Worker (Python)

The worker is already instrumented with OpenTelemetry:
```python
# apps/worker/otel_setup.py
from otel_setup import configure_otel
configure_otel("groundedos-worker")
```

To enable trace export:
```bash
export OTEL_EXPORT_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

## Viewing Traces in Jaeger

1. Open http://localhost:16686
2. Select service from dropdown (e.g., "groundedos-api", "groundedos-worker")
3. Click "Find Traces"
4. Click a trace to view details
5. Examine span hierarchy, timing, and attributes

### Example Trace Flow
```
API Request (span_id=123)
├── Database Query (child_span_id=456)
│   └── PostgreSQL (child_span_id=789)
├── Cache Lookup (child_span_id=101)
└── Job Enqueue (child_span_id=102)
    └── Worker Processing (parent_context_propagated via traceparent)
        ├── Model Inference
        └── Result Storage
```

## Viewing Metrics in Prometheus

1. Open http://localhost:9090
2. Use query builder or PromQL expressions:
   ```promql
   # Request rate by service
   rate(http_requests_total[5m])
   
   # Error rate
   rate(http_requests_total{status=~"5.."}[5m])
   
   # Job queue depth
   job_queue_depth
   
   # Job processing duration (p95)
   histogram_quantile(0.95, rate(job_duration_seconds_bucket[5m]))
   ```

## Viewing Dashboards in Grafana

1. Open http://localhost:3100 (default: admin/admin)
2. Create new dashboard or import from JSON
3. Add panels with Prometheus queries and Jaeger links

### Recommended Panels

**Service Health**
```promql
up{job=~"groundedos-.*"}
```

**Request Volume**
```promql
sum(rate(http_requests_total{job="groundedos-api"}[5m])) by (method, route)
```

**Error Rate**
```promql
(sum(rate(http_requests_total{job="groundedos-api", status=~"5.."}[5m])) 
 / sum(rate(http_requests_total{job="groundedos-api"}[5m]))) * 100
```

**Queue Depth**
```promql
job_queue_depth{job="groundedos-worker"}
```

**Job Latency (p99)**
```promql
histogram_quantile(0.99, sum(rate(job_duration_seconds_bucket[5m])) by (le))
```

## Stopping the Observability Stack

```bash
# Stop services (keep volumes)
docker-compose --profile observability down

# Stop and remove volumes (clean slate)
docker-compose --profile observability down -v
```

## Troubleshooting

### Jaeger shows no traces

1. Check OTEL_EXPORT_ENABLED is set to true in API/worker
2. Verify API and worker can reach otelcol:
   ```bash
   docker-compose exec api curl -v http://otelcol:4318/v1/traces
   docker-compose exec worker curl -v http://otelcol:4318/v1/traces
   ```
3. Check OTel Collector logs:
   ```bash
   docker-compose logs otelcol
   ```

### Prometheus shows no metrics

1. Verify API and worker expose `/metrics` endpoints
2. Check Prometheus scrape configuration:
   - Open http://localhost:9090/targets
   - Look for "groundedos-api" and "groundedos-worker"
3. Verify targets are reachable:
   ```bash
   docker-compose exec otelcol curl -v http://api:3001/metrics
   docker-compose exec otelcol curl -v http://worker:8000/metrics
   ```

### Grafana datasource not connecting

1. Verify Prometheus URL is http://prometheus:9090 (not localhost)
2. Check Prometheus is healthy:
   ```bash
   docker-compose logs prometheus | grep healthy
   ```
3. Restart Grafana:
   ```bash
   docker-compose restart grafana
   ```

## Feature Flags

The observability stack respects feature flags:

```bash
# Enable OTel export (for traces/metrics)
export OTEL_EXPORT_ENABLED=true

# Set collector endpoint (default: http://localhost:4318)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://otelcol:4318

# Set service name
export OTEL_SERVICE_NAME=groundedos-api
```

## Performance Considerations

- **Batch processor**: Buffers 1024 spans or 5s, whichever comes first
- **Sampling**: Not enabled by default (all traces exported); configure in code if needed
- **Memory**: Jaeger's all-in-one image uses ~200MB, Prometheus ~100MB, Grafana ~100MB

For production, consider:
- Sampling strategies (head-based or tail-based)
- Persistent trace storage (Jaeger with external backends)
- Metric retention policies (Prometheus TSDB)
- Alerting with AlertManager

## Next Steps

1. **Access Services**:
   - Jaeger: http://localhost:16686
   - Prometheus: http://localhost:9090
   - Grafana: http://localhost:3100

2. **Run a Test Job**:
   ```bash
   curl -X POST http://localhost:3001/api/jobs/enqueue \
     -H "Content-Type: application/json" \
     -d '{"type": "phase5-experiment", "track": "quantization"}'
   ```

3. **View Trace in Jaeger**:
   - Open Jaeger UI
   - Select "groundedos-api" service
   - Find the POST request span
   - Follow the trace chain to worker processing (if enabled)

4. **Create Grafana Dashboard**:
   - Open Grafana
   - Create new dashboard
   - Add panels with custom queries
   - Export dashboard as JSON

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Architecture](https://www.jaegertracing.io/docs/architecture/)
- [Prometheus Querying](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
